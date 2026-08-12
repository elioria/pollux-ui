// SPEC-002 — target adapter protocol. Every adapter exposes the same
// lifecycle:
//
//   inspect(workspace, manifest) -> TargetContext
//   plan(model, context)         -> { outputs: [{path, content}] }
//   render(plan, staging)        -> RenderResult   { ok, problems? }
//   format(staging)              -> FormatResult   { ok, problems? }
//   verify(staging)              -> VerificationResult { ok, problems? }
//
// This module owns everything framework-agnostic around that lifecycle:
// the adapter registry, target resolution against `.pollux/workspace.json`,
// deterministic GenerationPlan construction with plan-time rejection (path
// traversal, output outside the workspace, collision with non-owned files,
// incompatible provenance/model version, missing framework capability),
// ownership stamping, and the staged generate pipeline that publishes
// through the transaction journal.
//
// Pure module: returns values or throws SkeletonError; never exits/prints.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { ERROR_CODES, SkeletonError } from './errors.mjs';
import {
  applyOwnershipHeader,
  detectEditedOwnedFiles,
  mergeGeneratedManifest,
  ownerOfPath,
  readGeneratedManifest,
  serializeGeneratedManifest,
  sha256,
} from './ownership.mjs';
import {
  beginTransaction,
  commitTransaction,
  listPendingTransactions,
  recoverWorkspace,
} from './transaction.mjs';
import { MODEL_VERSION } from '../model/schema.mjs';

/** Version of the target generator machinery. Bump on breaking change. */
export const GENERATOR_VERSION = '1';

/** Version of the GenerationPlan shape. */
export const PLAN_VERSION = '1';

/** Locale-free UTF-16 code-unit comparison. */
const byCodeUnit = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

const isWithin = (parent, child) => {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
};

// ---------------------------------------------------------------- registry

const LIFECYCLE_METHODS = ['inspect', 'plan', 'render', 'format', 'verify'];

/** Assert an adapter implements the lifecycle contract. */
export function assertAdapterShape(adapter) {
  const problems = [];
  if (typeof adapter?.id !== 'string' || !adapter.id) {
    problems.push('adapter.id must be a non-empty string');
  }
  if (typeof adapter?.version !== 'string' || !adapter.version) {
    problems.push('adapter.version must be a non-empty string');
  }
  if (!Array.isArray(adapter?.capabilities)) {
    problems.push('adapter.capabilities must be an array');
  }
  for (const method of LIFECYCLE_METHODS) {
    if (typeof adapter?.[method] !== 'function') {
      problems.push(`adapter.${method} must be a function`);
    }
  }
  if (problems.length > 0) {
    throw new SkeletonError(
      ERROR_CODES.INTERNAL,
      `invalid target adapter${adapter?.id ? ` '${adapter.id}'` : ''} (${problems.length} problem${problems.length === 1 ? '' : 's'})`,
      { details: { problems } }
    );
  }
  return adapter;
}

/** Build a registry (Map keyed by adapter id) from an adapter list. */
export function createAdapterRegistry(adapters = []) {
  const registry = new Map();
  for (const adapter of adapters) {
    assertAdapterShape(adapter);
    if (registry.has(adapter.id)) {
      throw new SkeletonError(
        ERROR_CODES.INTERNAL,
        `duplicate target adapter id '${adapter.id}'`
      );
    }
    registry.set(adapter.id, adapter);
  }
  return registry;
}

// Production registry. Intentionally EMPTY: no standalone target adapter
// ships before SPEC-004 (nextjs), SPEC-005 (react-router) and SPEC-006
// (astro). Tests exercise the pipeline through fixture adapters passed via
// the `registry` option — never registered here.
export const PRODUCTION_ADAPTER_REGISTRY = createAdapterRegistry([]);

/**
 * Resolve one adapter by target id.
 * @throws {SkeletonError} TARGET_UNSUPPORTED when no adapter is registered
 */
export function resolveAdapter(
  targetId,
  { registry = PRODUCTION_ADAPTER_REGISTRY } = {}
) {
  const adapter = registry.get(targetId);
  if (!adapter) {
    throw new SkeletonError(
      ERROR_CODES.TARGET_UNSUPPORTED,
      `no generator adapter is registered for target '${targetId}' — standalone targets arrive with SPEC-004..006`,
      { details: { target: targetId, known: [...registry.keys()].sort() } }
    );
  }
  return adapter;
}

// ------------------------------------------------------- target resolution

/**
 * Read `.pollux/workspace.json` provenance for a workspace.
 * @throws {SkeletonError} TARGET_UNSUPPORTED when absent/unreadable
 */
export function readWorkspaceProvenance(workspace) {
  const file = path.join(workspace, '.pollux/workspace.json');
  if (!fs.existsSync(file)) {
    throw new SkeletonError(
      ERROR_CODES.TARGET_UNSUPPORTED,
      `not a Pollux workspace: ${workspace} has no .pollux/workspace.json`,
      {
        details: { workspace },
        hint: 'create workspaces with `pollux new-workspace <skeleton> --dir=<path>`',
      }
    );
  }
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    throw new SkeletonError(
      ERROR_CODES.TARGET_UNSUPPORTED,
      `.pollux/workspace.json is not valid JSON: ${err.message}`,
      { details: { workspace } }
    );
  }
}

/**
 * Resolve the effective target for a workspace. `--target` is optional; the
 * provenance's `targetAdapter.id`/`targetStatus` are authoritative. Explicit
 * and inferred targets must agree; workspaces whose skeleton declares no
 * Pollux support fail with TARGET_UNSUPPORTED before any planning.
 *
 * @param {object} options
 * @param {string} options.workspace absolute workspace root
 * @param {string} [options.explicitTarget] value of --target, if given
 * @param {(provenance: object) => string|null} [options.supportMessage]
 *   optional lookup for the skeleton manifest's support message
 * @returns {{target: string, provenance: object}}
 */
export function resolveTargetForWorkspace({
  workspace,
  explicitTarget,
  supportMessage,
}) {
  const provenance = readWorkspaceProvenance(workspace);
  const inferred = provenance.targetAdapter?.id ?? null;
  if (explicitTarget && inferred && explicitTarget !== inferred) {
    throw new SkeletonError(
      ERROR_CODES.TARGET_MISMATCH,
      `explicit target '${explicitTarget}' disagrees with the workspace's recorded target '${inferred}'`,
      {
        details: { explicit: explicitTarget, inferred, workspace },
        hint: 'omit --target to use the workspace-recorded target',
      }
    );
  }
  // 'experimental' targets may generate (SPEC-007 rollout step 3: contract
  // shipped behind experimental capability flags); promotion to 'supported'
  // happens only when generatorSupport.pollux flips true with a green matrix.
  const generatable =
    provenance.targetStatus === 'supported' ||
    provenance.targetStatus === 'experimental';
  if (!generatable || !inferred) {
    const message =
      supportMessage?.(provenance) ??
      `skeleton '${provenance.skeleton ?? 'unknown'}' is not yet a Pollux generator target`;
    throw new SkeletonError(ERROR_CODES.TARGET_UNSUPPORTED, message, {
      details: {
        workspace,
        skeleton: provenance.skeleton ?? null,
        targetStatus: provenance.targetStatus ?? null,
      },
      hint: 'standalone generator targets ship with SPEC-004 (nextjs), SPEC-005 (react-router) and SPEC-006 (astro)',
    });
  }
  return { target: inferred, provenance };
}

// ------------------------------------------------------------ plan building

/** Reject unsafe workspace-relative output paths at plan time. */
function pathProblem(workspace, relPath) {
  if (typeof relPath !== 'string' || relPath.length === 0) {
    return 'empty output path';
  }
  if (path.isAbsolute(relPath) || /^[A-Za-z]:[\\/]/.test(relPath)) {
    return `absolute output path: ${relPath}`;
  }
  if (relPath.includes('\\')) return `backslash in output path: ${relPath}`;
  if (relPath.split('/').includes('..')) {
    return `path traversal in output path: ${relPath}`;
  }
  const abs = path.resolve(workspace, relPath);
  if (!isWithin(workspace, abs) || abs === path.resolve(workspace)) {
    return `output escapes the workspace: ${relPath}`;
  }
  const first = relPath.split('/')[0];
  if (first === '.pollux') {
    return `output targets the reserved .pollux directory: ${relPath}`;
  }
  return null;
}

/**
 * Build one deterministic GenerationPlan for one entity: run the adapter's
 * inspect+plan, stamp ownership headers, classify every owned file as
 * created/replaced/preserved/removed against the workspace and the recorded
 * ownership manifest, and reject invalid plans before rendering.
 *
 * Performs NO workspace writes.
 *
 * @param {object} options
 * @param {string} options.workspace absolute workspace root
 * @param {object} options.adapter lifecycle adapter
 * @param {object} options.model frozen PolluxEntityModel
 * @param {object} options.provenance workspace provenance
 * @param {object|null} [options.generatedManifest] parsed generated.json
 *   (read from the workspace when omitted)
 * @returns {{plan: object, contents: Map<string, Buffer>,
 *   editedOwned: string[]}}
 */
export function planEntity({
  workspace,
  adapter,
  model,
  provenance,
  generatedManifest,
}) {
  assertAdapterShape(adapter);
  const manifest =
    generatedManifest === undefined
      ? readGeneratedManifest(workspace)
      : generatedManifest;
  const problems = [];

  // Incompatible provenance/model version is a plan-time rejection.
  if (model.modelVersion !== MODEL_VERSION) {
    problems.push(
      `model version '${model.modelVersion}' is incompatible with generator model version '${MODEL_VERSION}'`
    );
  }
  if (provenance.metadataModelVersion !== MODEL_VERSION) {
    problems.push(
      `workspace provenance records metadata model version '${provenance.metadataModelVersion}', generator requires '${MODEL_VERSION}'`
    );
  }
  if (manifest && manifest.target !== adapter.id) {
    problems.push(
      `.pollux/generated.json records target '${manifest.target}', adapter is '${adapter.id}'`
    );
  }
  // Missing framework capability is a plan-time rejection.
  for (const capability of model.unsupportedCapabilities) {
    if (!adapter.capabilities.includes(capability)) {
      problems.push(
        `entity '${model.entity.id}' requires capability '${capability}' which target '${adapter.id}' does not provide`
      );
    }
  }
  if (problems.length > 0) {
    throw new SkeletonError(
      ERROR_CODES.PLAN_INVALID,
      `plan for entity '${model.entity.id}' is invalid (${problems.length} problem${problems.length === 1 ? '' : 's'})`,
      { details: { entity: model.entity.id, problems } }
    );
  }

  const context = adapter.inspect(workspace, {
    provenance,
    generated: manifest,
  });
  const rawPlan = adapter.plan(model, context);
  const outputs = rawPlan?.outputs;
  if (!Array.isArray(outputs) || outputs.length === 0) {
    throw new SkeletonError(
      ERROR_CODES.PLAN_INVALID,
      `adapter '${adapter.id}' planned no outputs for entity '${model.entity.id}'`,
      { details: { entity: model.entity.id } }
    );
  }

  const meta = {
    target: adapter.id,
    entity: model.entity.id,
    generatorVersion: GENERATOR_VERSION,
    modelVersion: model.modelVersion,
  };
  const entityEntry = manifest?.entities?.[model.entity.id] ?? null;
  const ownedByEntity = new Set(entityEntry?.ownedPaths ?? []);
  const seen = new Set();
  const operations = [];
  const contents = new Map();
  const editedOwned = [];
  const conflicts = [];

  for (const output of [...outputs].sort((a, b) =>
    byCodeUnit(a.path, b.path)
  )) {
    const problem = pathProblem(workspace, output.path);
    if (problem) {
      problems.push(problem);
      continue;
    }
    if (seen.has(output.path)) {
      problems.push(`duplicate output path: ${output.path}`);
      continue;
    }
    seen.add(output.path);
    if (typeof output.content !== 'string') {
      problems.push(`output '${output.path}' has no string content`);
      continue;
    }
    const { content, ownership } = applyOwnershipHeader(
      output.path,
      output.content,
      meta
    );
    const buffer = Buffer.from(content, 'utf8');
    const hash = sha256(buffer);
    const abs = path.join(workspace, output.path);
    const exists = fs.existsSync(abs);
    let action;
    if (!exists) {
      action = 'create';
    } else {
      const owner = ownerOfPath(manifest, output.path);
      if (owner === null || owner !== model.entity.id) {
        // Collision with a non-owned file (or a file owned by another
        // entity) — never replaced, plan-time rejection.
        conflicts.push({ path: output.path, owner });
        continue;
      }
      const currentHash = sha256(fs.readFileSync(abs));
      if (currentHash !== entityEntry.hashes[output.path]) {
        editedOwned.push(output.path);
      }
      action = currentHash === hash ? 'preserve' : 'replace';
    }
    operations.push({ action, path: output.path, hash, ownership });
    contents.set(output.path, buffer);
  }

  // Previously owned files no longer produced are removed (owned only).
  for (const relPath of ownedByEntity) {
    if (seen.has(relPath)) continue;
    const abs = path.join(workspace, relPath);
    if (!fs.existsSync(abs)) continue; // already gone; manifest just drops it
    const currentHash = sha256(fs.readFileSync(abs));
    if (currentHash !== entityEntry.hashes[relPath]) {
      editedOwned.push(relPath);
    }
    operations.push({
      action: 'remove',
      path: relPath,
      hash: null,
      ownership: null,
    });
  }

  if (conflicts.length > 0) {
    throw new SkeletonError(
      ERROR_CODES.OWNERSHIP_CONFLICT,
      `plan for entity '${model.entity.id}' collides with ${conflicts.length} file(s) not owned by it`,
      {
        details: {
          entity: model.entity.id,
          conflicts: conflicts.map((c) => ({
            path: c.path,
            ownedBy: c.owner,
          })),
        },
        hint: 'generated output never replaces files it does not own; move or remove the conflicting files',
      }
    );
  }
  if (problems.length > 0) {
    throw new SkeletonError(
      ERROR_CODES.PLAN_INVALID,
      `plan for entity '${model.entity.id}' is invalid (${problems.length} problem${problems.length === 1 ? '' : 's'})`,
      { details: { entity: model.entity.id, problems } }
    );
  }

  operations.sort((a, b) => byCodeUnit(a.path, b.path));
  const plan = {
    planVersion: PLAN_VERSION,
    target: adapter.id,
    adapterVersion: adapter.version,
    generatorVersion: GENERATOR_VERSION,
    modelVersion: model.modelVersion,
    entity: model.entity.id,
    operations,
  };
  return { plan, contents, editedOwned: [...editedOwned].sort(byCodeUnit) };
}

// --------------------------------------------------------------- generation

const stageResult = (stage, result) => {
  if (result && result.ok !== false) return;
  throw new SkeletonError(ERROR_CODES.INTERNAL, `adapter ${stage} failed`, {
    details: { stage, problems: result?.problems ?? [] },
  });
};

/**
 * Generate one or more planned entities into a workspace: render every plan
 * into a staging tree, run adapter format + verify there, confirm formatting
 * is a fixpoint of the plan hashes, then publish everything (plus the merged
 * `.pollux/generated.json` commit record) through ONE transaction journal.
 *
 * All-or-nothing: planning already happened (caller aborts on any failure);
 * any render/format/verify/publication failure leaves the workspace
 * byte-identical after automatic recovery.
 *
 * @param {object} options
 * @param {string} options.workspace
 * @param {object} options.adapter
 * @param {Array<{plan: object, contents: Map<string, Buffer>,
 *   editedOwned: string[]}>} options.planned results of planEntity
 * @param {object|null} options.generatedManifest current generated.json
 * @param {boolean} [options.acceptGeneratedOverwrite=false]
 * @param {object} [options.transactionHooks] test-only failure injection
 * @returns {{transaction: string, entities: Array<object>}}
 */
export function executePlans({
  workspace,
  adapter,
  planned,
  generatedManifest,
  acceptGeneratedOverwrite = false,
  transactionHooks,
}) {
  // Hand-edited owned files block regeneration unless explicitly accepted.
  // The flag applies ONLY to recorded generated files — non-owned collisions
  // were already rejected at plan time.
  const edited = planned.flatMap((p) =>
    p.editedOwned.map((file) => ({ entity: p.plan.entity, path: file }))
  );
  if (edited.length > 0 && !acceptGeneratedOverwrite) {
    throw new SkeletonError(
      ERROR_CODES.GENERATED_EDITED,
      `${edited.length} generated file(s) were hand-edited since the last generation`,
      {
        details: { edited },
        hint: 'rerun with --accept-generated-overwrite to discard the manual edits',
      }
    );
  }

  // Staging tree outside the workspace: the workspace stays untouched until
  // the journal publishes.
  const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'pollux-staging-'));
  try {
    for (const { plan, contents } of planned) {
      stageResult('render', adapter.render({ ...plan, contents }, staging));
    }
    stageResult('format', adapter.format(staging));
    stageResult('verify', adapter.verify(staging));

    // Formatting must be a fixpoint of the planned content: recompute every
    // staged hash and require it to equal the plan hash, keeping the dry-run
    // plan exact.
    let manifest = generatedManifest;
    const operations = [];
    const summaries = [];
    for (const { plan } of planned) {
      const files = [];
      const counts = { created: 0, replaced: 0, preserved: 0, removed: 0 };
      for (const op of plan.operations) {
        if (op.action === 'remove') {
          counts.removed += 1;
          operations.push({ op: 'remove', path: op.path });
          continue;
        }
        if (op.action === 'preserve') {
          // Byte-identical to the workspace copy: no publication needed.
          counts.preserved += 1;
          files.push({ path: op.path, hash: op.hash });
          continue;
        }
        const stagedFile = path.join(staging, op.path);
        if (!fs.existsSync(stagedFile)) {
          throw new SkeletonError(
            ERROR_CODES.INTERNAL,
            `adapter render did not produce staged file '${op.path}'`,
            { details: { entity: plan.entity, path: op.path } }
          );
        }
        const content = fs.readFileSync(stagedFile);
        const hash = sha256(content);
        if (hash !== op.hash) {
          throw new SkeletonError(
            ERROR_CODES.INTERNAL,
            `staged content for '${op.path}' diverged from the plan hash (formatter is not a fixpoint of planned output)`,
            {
              details: {
                entity: plan.entity,
                path: op.path,
                planned: op.hash,
                staged: hash,
              },
            }
          );
        }
        files.push({ path: op.path, hash });
        if (op.action === 'create') {
          counts.created += 1;
          operations.push({ op: 'create', path: op.path, content });
        } else {
          counts.replaced += 1;
          operations.push({ op: 'replace', path: op.path, content });
        }
      }
      manifest = mergeGeneratedManifest(manifest, {
        target: adapter.id,
        generatorVersion: GENERATOR_VERSION,
        modelVersion: plan.modelVersion,
        entity: plan.entity,
        files,
      });
      summaries.push({ entity: plan.entity, ...counts });
    }

    const txn = beginTransaction({
      workspace,
      operations,
      commitRecord: { content: serializeGeneratedManifest(manifest) },
    });
    commitTransaction(txn, transactionHooks);
    // Committed journal is removed only after paths+hashes match the commit
    // record — recovery performs exactly that check.
    const { recovered } = recoverWorkspace(workspace);
    return { transaction: txn.id, entities: summaries, recovered };
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

/**
 * Guard for read-only commands: planning must not proceed over a pending
 * journal, and a non-mutating command may not roll it back.
 * @throws {SkeletonError} TRANSACTION_INCOMPLETE
 */
export function assertNoPendingTransactions(workspace) {
  const pending = listPendingTransactions(workspace);
  if (pending.length > 0) {
    throw new SkeletonError(
      ERROR_CODES.TRANSACTION_INCOMPLETE,
      `workspace has ${pending.length} unfinished transaction(s)`,
      {
        details: { workspace, transactions: pending },
        hint: 'run `pollux generate` (mutating commands recover automatically) or inspect .pollux/transactions',
      }
    );
  }
}

/**
 * Detect hand-edited owned files for `check-generated`.
 */
export function checkGeneratedState(workspace) {
  const manifest = readGeneratedManifest(workspace);
  const pending = listPendingTransactions(workspace);
  const { edited, missing } = detectEditedOwnedFiles(workspace, manifest);
  return {
    manifest,
    pendingTransactions: pending,
    edited,
    missing,
    clean: pending.length === 0 && edited.length === 0,
  };
}
