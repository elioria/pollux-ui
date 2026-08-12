#!/usr/bin/env node
// pollux — agent-friendly CLI over the Pollux generator (_templates/pollux).
// Obsidian-CLI-style verbs, non-interactive, machine-readable with --json,
// non-zero exit codes on failure. Run `pollux help` for the command list.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  normalizeEntityModel,
  PolluxNormalizationError,
} from './model/normalize.mjs';
import {
  ERROR_CODES,
  isSkeletonError,
  SkeletonError,
} from './skeletons/errors.mjs';
import {
  getManifest,
  getSkeletonEntry,
  listSkeletons,
  loadRegistry,
  skeletonContext,
  validateAllSkeletons,
} from './skeletons/registry.mjs';
import { createWorkspace } from './skeletons/workspace.mjs';
import { readGeneratedManifest } from './targets/ownership.mjs';
import {
  assertNoPendingTransactions,
  checkGeneratedState,
  createAdapterRegistry,
  executePlans,
  planEntity,
  resolveAdapter,
  resolveTargetForWorkspace,
} from './targets/protocol.mjs';
import { recoverWorkspace } from './targets/transaction.mjs';

const CLI_VERSION = '0.2.0';

const repoRoot = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  '../..'
);
process.chdir(repoRoot);

const args = process.argv.slice(2);
const json = args.includes('--json');
const positional = args.filter((a) => !a.startsWith('--'));
const flag = (name) => {
  const prefix = `--${name}=`;
  const hit = args.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
};

const out = (data, human) => {
  if (json) {
    console.log(JSON.stringify(data, null, 2));
  } else {
    console.log(human ?? JSON.stringify(data, null, 2));
  }
};

const fail = (message, code = 1) => {
  if (json) console.log(JSON.stringify({ ok: false, error: message }));
  else console.error(`pollux: ${message}`);
  process.exit(code);
};

const run = (cmd, cmdArgs, { quiet = false } = {}) => {
  return spawnSync(cmd, cmdArgs, {
    stdio: quiet ? 'pipe' : 'inherit',
    encoding: 'utf8',
    shell: false,
  });
};

// ---------------------------------------------------------------- entities

const readEntities = () => {
  const dir = path.join(repoRoot, 'json-files');
  const valid = [];
  const stubs = [];
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    const name = file.replace(/\.json$/, '');
    try {
      const parsed = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
      if (parsed?.data?.attributes) valid.push(name);
      else stubs.push(name);
    } catch {
      stubs.push(name);
    }
  }
  return { valid: valid.sort(), stubs: stubs.sort() };
};

const templateGroups = () => {
  const dir = path.join(repoRoot, '_templates/pollux');
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      group: entry.name,
      templates: fs
        .readdirSync(path.join(dir, entry.name), { recursive: true })
        .filter((f) => String(f).endsWith('.ejs.t')).length,
    }));
};

// ---------------------------------------------------------------- skeletons
// Behavior lives in scripts/pollux/skeletons/{schema,registry,workspace}.mjs.
// The CLI only parses arguments and renders results/errors.

const skeletonCtx = skeletonContext(repoRoot);

// Failure contract (SPEC-001): --json prints ONE object
// { ok:false, code, message, details? } on stdout, no stack traces;
// human mode prints a concise error + recovery hint on stderr.
// Exit status is identical in both modes.
const failSkeleton = (err) => {
  if (!isSkeletonError(err)) {
    err = new SkeletonError(ERROR_CODES.INTERNAL, err?.message ?? String(err));
  }
  if (json) {
    console.log(JSON.stringify(err.toJSON()));
  } else {
    console.error(`pollux: ${err.message}`);
    for (const p of err.details?.problems ?? []) console.error(`  - ${p}`);
    if (err.hint) console.error(`hint: ${err.hint}`);
  }
  process.exit(1);
};

const usageError = (usage) =>
  new SkeletonError(ERROR_CODES.USAGE, `usage: ${usage}`, {
    hint: 'run `pollux help` for the command list',
  });

// Skeleton commands accept both --flag=value and `--flag value` forms.
const parseValueFlags = (names) => {
  const flags = {};
  const rest = [];
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--json') continue;
    const inline = names.find((n) => a.startsWith(`--${n}=`));
    if (inline) {
      flags[inline] = a.slice(inline.length + 3);
      continue;
    }
    const spaced = names.find((n) => a === `--${n}`);
    if (spaced) {
      if (i + 1 >= args.length)
        throw usageError(`--${spaced} requires a value`);
      flags[spaced] = args[i + 1];
      i += 1;
      continue;
    }
    if (!a.startsWith('--')) rest.push(a);
  }
  return { flags, rest };
};

// POSIX shell-quote a path for copy-pasteable human output.
const shellQuote = (s) =>
  /^[A-Za-z0-9_./-]+$/.test(s) ? s : `'${s.replaceAll("'", `'\\''`)}'`;

// ---------------------------------------------------------------- targets
// Behavior lives in scripts/pollux/targets/{protocol,ownership,transaction}.mjs.

// Skeleton-manifest support message for TARGET_UNSUPPORTED workspaces.
const skeletonSupportMessage = (provenance) => {
  try {
    const manifest = JSON.parse(
      fs.readFileSync(
        path.join(repoRoot, 'skeletons', provenance.skeleton, 'skeleton.json'),
        'utf8'
      )
    );
    const notes = manifest.generatorSupport?.notes;
    return notes
      ? `skeleton '${provenance.skeleton}' is not a Pollux generator target: ${notes}`
      : null;
  } catch {
    return null;
  }
};

// Production adapters are discovered from their SPEC-004..006 module
// locations; a missing module simply means the target is not shipped yet.
// POLLUX_TEST_ADAPTERS overrides the registry entirely (test-only).
const PRODUCTION_ADAPTER_MODULES = [
  'scripts/pollux/targets/nextjs/adapter.mjs',
  'scripts/pollux/targets/react-router/adapter.mjs',
  'scripts/pollux/targets/astro-react/adapter.mjs',
  'scripts/pollux/targets/tanstack-start/adapter.mjs',
];

const loadAdapterRegistry = async () => {
  const spec = process.env.POLLUX_TEST_ADAPTERS;
  if (spec) {
    const mod = await import(pathToFileURL(path.resolve(repoRoot, spec)).href);
    return createAdapterRegistry(mod.adapters ?? [mod.default]);
  }
  const adapters = [];
  for (const rel of PRODUCTION_ADAPTER_MODULES) {
    const file = path.resolve(repoRoot, rel);
    if (!fs.existsSync(file)) continue;
    const mod = await import(pathToFileURL(file).href);
    adapters.push(...(mod.adapters ?? [mod.default]));
  }
  return adapters.length > 0 ? createAdapterRegistry(adapters) : undefined;
};

const loadEntityMetadata = (metadataDir, entity) => {
  const file = path.join(metadataDir, `${entity}.json`);
  if (!fs.existsSync(file)) {
    throw new SkeletonError(
      ERROR_CODES.PLAN_INVALID,
      `unknown entity '${entity}' (no ${path.relative(repoRoot, file)})`,
      { details: { entity, file } }
    );
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
};

const validEntityNamesIn = (metadataDir) =>
  fs
    .readdirSync(metadataDir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/\.json$/, ''))
    .filter((name) => {
      try {
        const parsed = JSON.parse(
          fs.readFileSync(path.join(metadataDir, `${name}.json`), 'utf8')
        );
        return Boolean(parsed?.data?.attributes);
      } catch {
        return false;
      }
    })
    .sort();

const describePlanFailure = (entity, err) => {
  if (err instanceof PolluxNormalizationError) {
    return {
      entity,
      code: ERROR_CODES.PLAN_INVALID,
      diagnostics: err.diagnostics,
    };
  }
  if (isSkeletonError(err)) {
    return {
      entity,
      code: err.code,
      message: err.message,
      details: err.details,
    };
  }
  return {
    entity,
    code: ERROR_CODES.INTERNAL,
    message: err?.message ?? String(err),
  };
};

// Shared front half of plan/generate: workspace + target + adapter + models.
const resolveGenerationContext = async (flags) => {
  if (!flags.workspace) {
    throw usageError(
      'pollux plan|generate [--target=<t>] --workspace=<path> --entity=<name>'
    );
  }
  const workspace = path.resolve(flags.workspace);
  const { target, provenance } = resolveTargetForWorkspace({
    workspace,
    explicitTarget: flags.target,
    supportMessage: skeletonSupportMessage,
  });
  const registry = await loadAdapterRegistry();
  const adapter = resolveAdapter(target, registry ? { registry } : {});
  const metadataDir = path.resolve(
    repoRoot,
    flags['metadata-dir'] ?? 'json-files'
  );
  return { workspace, target, provenance, adapter, metadataDir };
};

// Plan every requested entity, collecting EVERY failure before aborting.
const planAllEntities = ({ ctx, entityNames, generatedManifest }) => {
  const planned = [];
  const failures = [];
  for (const name of entityNames) {
    try {
      const model = normalizeEntityModel(
        loadEntityMetadata(ctx.metadataDir, name)
      );
      planned.push(
        planEntity({
          workspace: ctx.workspace,
          adapter: ctx.adapter,
          model,
          provenance: ctx.provenance,
          generatedManifest,
        })
      );
    } catch (err) {
      failures.push(describePlanFailure(name, err));
    }
  }
  if (failures.length > 0) {
    throw new SkeletonError(
      ERROR_CODES.PLAN_INVALID,
      `${failures.length} of ${entityNames.length} entities failed planning — no files were written`,
      { details: { failures } }
    );
  }
  return planned;
};

// ---------------------------------------------------------------- commands

const commands = {
  help() {
    out(
      {
        usage: 'pollux <command> [args] [--json]',
        commands: HELP,
      },
      [
        'pollux — Pollux generator CLI for humans and AI agents',
        '',
        'usage: pollux <command> [args] [--json]',
        '',
        ...Object.entries(HELP).map(
          ([cmd, desc]) => `  ${cmd.padEnd(42)} ${desc}`
        ),
        '',
        'Every command supports --json for machine-readable output.',
      ].join('\n')
    );
  },

  'list-entities'() {
    const { valid, stubs } = readEntities();
    out(
      { ok: true, count: valid.length, entities: valid, stubs },
      `${valid.length} entities:\n  ${valid.join(' ')}\nstubs (skipped): ${stubs.join(' ')}`
    );
  },

  'list-skeletons'() {
    try {
      const rows = listSkeletons(skeletonCtx);
      out(
        { ok: true, count: rows.length, skeletons: rows },
        rows
          .map(
            (r) =>
              `${r.name.padEnd(16)} ${r.framework.padEnd(28)} ${r.status.padEnd(12)} pollux:${r.pollux}`
          )
          .join('\n')
      );
    } catch (err) {
      failSkeleton(err);
    }
  },

  'describe-skeleton'() {
    try {
      const { rest } = parseValueFlags([]);
      const name = rest[1];
      if (!name) throw usageError('pollux describe-skeleton <name>');
      const registry = loadRegistry(skeletonCtx);
      const entry = getSkeletonEntry(registry, name);
      const manifest = getManifest(entry, skeletonCtx);
      out({ ok: true, skeleton: manifest }, JSON.stringify(manifest, null, 2));
    } catch (err) {
      failSkeleton(err);
    }
  },

  'validate-skeletons'() {
    try {
      const { ok, results } = validateAllSkeletons(skeletonCtx);
      out(
        { ok, results },
        results
          .map((r) =>
            r.problems.length === 0
              ? `${r.name.padEnd(16)} OK`
              : `${r.name.padEnd(16)} FAIL\n  - ${r.problems.join('\n  - ')}`
          )
          .join('\n')
      );
      if (!ok) process.exit(1);
    } catch (err) {
      failSkeleton(err);
    }
  },

  'new-workspace'() {
    try {
      const { flags, rest } = parseValueFlags(['dir', 'name']);
      const skeleton = rest[1];
      if (!skeleton || !flags.dir) {
        throw usageError(
          'pollux new-workspace <skeleton> --dir=<path> [--name=<pkg>]'
        );
      }
      const result = createWorkspace({
        repoRoot,
        skeleton,
        dir: flags.dir,
        name: flags.name,
        cliVersion: CLI_VERSION,
      });
      const humanNext = [
        `cd ${shellQuote(result.workspace)}`,
        ...result.next.slice(1),
      ];
      const dirtyWarning = result.dirty
        ? '\n\nwarning: skeleton source differs from git HEAD — this workspace is not reproducible from the recorded revision alone (see .pollux/workspace.json digest)'
        : '';
      out(
        {
          ok: true,
          skeleton: result.skeleton,
          workspace: result.workspace,
          package: result.package,
          dirty: result.dirty,
          provenance: result.provenance,
          next: result.next,
          steps: result.steps,
        },
        `workspace '${result.package}' created from skeleton '${result.skeleton}' at ${result.workspace}\n\nnext steps:\n  ${humanNext.join('\n  ')}${dirtyWarning}`
      );
    } catch (err) {
      failSkeleton(err);
    }
  },

  async plan() {
    try {
      const { flags } = parseValueFlags([
        'target',
        'workspace',
        'entity',
        'metadata-dir',
      ]);
      if (!flags.entity) {
        throw usageError(
          'pollux plan [--target=<t>] --workspace=<path> --entity=<name> [--json]'
        );
      }
      const ctx = await resolveGenerationContext(flags);
      // plan performs no writes — a pending journal is reported, not fixed.
      assertNoPendingTransactions(ctx.workspace);
      const generatedManifest = readGeneratedManifest(ctx.workspace);
      const { plan, editedOwned } = planAllEntities({
        ctx,
        entityNames: [flags.entity],
        generatedManifest,
      })[0];
      out(
        { ok: true, workspace: ctx.workspace, plan, editedOwned },
        [
          `plan for entity '${plan.entity}' (target ${plan.target}, ${plan.operations.length} operations):`,
          ...plan.operations.map(
            (op) =>
              `  ${op.action.padEnd(8)} ${op.path}${op.hash ? `  ${op.hash.slice(0, 12)}` : ''}`
          ),
          ...(editedOwned.length > 0
            ? [
                `hand-edited owned files (need --accept-generated-overwrite): ${editedOwned.join(', ')}`,
              ]
            : []),
        ].join('\n')
      );
    } catch (err) {
      failSkeleton(err);
    }
  },

  async generate() {
    try {
      const { flags } = parseValueFlags([
        'target',
        'workspace',
        'entity',
        'metadata-dir',
      ]);
      const all = args.includes('--all');
      const accept = args.includes('--accept-generated-overwrite');
      if (!flags.workspace || (!flags.entity && !all)) {
        throw usageError(
          'pollux generate [--target=<t>] --workspace=<path> --entity=<name> | --all [--accept-generated-overwrite]'
        );
      }
      // Mutating command: complete any unfinished transaction before planning.
      const workspacePath = path.resolve(flags.workspace);
      let recovered = [];
      if (fs.existsSync(path.join(workspacePath, '.pollux'))) {
        recovered = recoverWorkspace(workspacePath).recovered;
      }
      const ctx = await resolveGenerationContext(flags);
      const generatedManifest = readGeneratedManifest(ctx.workspace);
      const entityNames = all
        ? validEntityNamesIn(ctx.metadataDir)
        : [flags.entity];
      // All-or-nothing at the planning boundary.
      const planned = planAllEntities({ ctx, entityNames, generatedManifest });
      const result = executePlans({
        workspace: ctx.workspace,
        adapter: ctx.adapter,
        planned,
        generatedManifest,
        acceptGeneratedOverwrite: accept,
      });
      out(
        {
          ok: true,
          target: ctx.target,
          workspace: ctx.workspace,
          transaction: result.transaction,
          entities: result.entities,
          recovered,
        },
        [
          `generated ${result.entities.length} entit${result.entities.length === 1 ? 'y' : 'ies'} for target '${ctx.target}' (transaction ${result.transaction})`,
          ...result.entities.map(
            (e) =>
              `  ${e.entity.padEnd(16)} created:${e.created} replaced:${e.replaced} preserved:${e.preserved} removed:${e.removed}`
          ),
          ...(recovered.length > 0
            ? [`recovered ${recovered.length} unfinished transaction(s) first`]
            : []),
        ].join('\n')
      );
    } catch (err) {
      failSkeleton(err);
    }
  },

  'check-generated'() {
    try {
      const { flags } = parseValueFlags(['workspace']);
      if (!flags.workspace) {
        throw usageError('pollux check-generated --workspace=<path>');
      }
      const workspace = path.resolve(flags.workspace);
      const state = checkGeneratedState(workspace);
      out(
        {
          ok: state.clean,
          workspace,
          target: state.manifest?.target ?? null,
          entities: Object.keys(state.manifest?.entities ?? {}),
          pendingTransactions: state.pendingTransactions,
          edited: state.edited,
          missing: state.missing,
        },
        [
          state.manifest
            ? `target ${state.manifest.target} — ${Object.keys(state.manifest.entities).length} generated entit${Object.keys(state.manifest.entities).length === 1 ? 'y' : 'ies'}`
            : 'no .pollux/generated.json — nothing generated yet',
          ...state.pendingTransactions.map(
            (id) =>
              `PENDING transaction ${id} (run a mutating command to recover)`
          ),
          ...state.edited.map((e) => `EDITED ${e.path} (entity ${e.entity})`),
          ...state.missing.map(
            (m) =>
              `missing ${m.path} (entity ${m.entity}; recreated on next generate)`
          ),
          state.clean ? 'clean' : 'NOT clean',
        ].join('\n')
      );
      if (!state.clean) process.exit(1);
    } catch (err) {
      failSkeleton(err);
    }
  },

  'list-templates'() {
    const groups = templateGroups();
    out(
      { ok: true, groups },
      groups
        .map((g) => `${g.group.padEnd(14)} ${g.templates} templates`)
        .join('\n')
    );
  },

  describe() {
    const entity = positional[1];
    if (!entity) fail('usage: pollux describe <entity>');
    const file = path.join(repoRoot, 'json-files', `${entity}.json`);
    if (!fs.existsSync(file)) fail(`unknown entity '${entity}'`);
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!parsed?.data?.attributes)
      fail(`'${entity}' is a stub (no attributes)`);
    const attributes = parsed.data.attributes.map((a) => ({
      name: a.name,
      dataType: a.dataType,
      nullable: a.isNullable === true,
      primaryKey: a.isPrimaryKey === true,
      inGrid: a.grdIsinGrid === true,
      inFormAdd: a.fnrIsinFormAdd === true,
      inFormUpdate: a.fedIsinFormUpd === true,
      mandatoryAdd: a.fnrMandatory === 'sim',
    }));
    const summary = {
      ok: true,
      entity,
      table: parsed.data.dbName,
      gridTitle: parsed.data.gridTitle ?? null,
      fieldCount: attributes.length,
      routes: [`/generated/${entity}`, `/generated-server/${entity}`],
      goRoute: `/api/generated/v1/${entity}`,
      attributes,
    };
    out(
      summary,
      [
        `entity ${entity} (table ${summary.table}) — ${attributes.length} fields`,
        ...attributes.map(
          (a) =>
            `  ${a.name.padEnd(24)} ${a.dataType.padEnd(12)}${a.primaryKey ? ' pk' : ''}${a.nullable ? '' : ' notnull'}${a.inGrid ? ' grid' : ''}${a.inFormAdd ? ' add' : ''}${a.inFormUpdate ? ' upd' : ''}${a.mandatoryAdd ? ' required' : ''}`
        ),
      ].join('\n')
    );
  },

  validate() {
    const targets = positional.slice(1);
    const metadataDir = flag('metadata-dir');
    const result = run('node', [
      'scripts/pollux/validate-metadata.mjs',
      ...(metadataDir ? [`--dir=${path.resolve(metadataDir)}`] : []),
      ...targets,
    ]);
    process.exit(result.status ?? 1);
  },

  'gen-entity'() {
    const entity = positional[1];
    if (!entity)
      fail(
        'usage: pollux gen-entity <entity> [--groups=page,serverpage,form-fields,data-table-components,debug] [--renderer=go|node]'
      );
    const { valid } = readEntities();
    if (!valid.includes(entity)) fail(`unknown or stub entity '${entity}'`);

    const check = run(
      'node',
      ['scripts/pollux/validate-metadata.mjs', entity],
      { quiet: true }
    );
    if (check.status !== 0)
      fail(`metadata validation failed:\n${check.stdout}${check.stderr}`);

    const groups = (
      flag('groups') ??
      'page,serverpage,form-fields,data-table-components,debug'
    ).split(',');
    const renderer = flag('renderer') ?? 'go';
    const bin = renderer === 'node' ? 'hygen' : '.cache/gohygen';
    if (renderer !== 'node' && !fs.existsSync(bin)) {
      fail(
        'gohygen binary missing — run ./gen-all-go.sh once to build it, or use --renderer=node'
      );
    }

    const rendered = [];
    for (const group of groups) {
      const result = run(
        bin,
        ['pollux', group, entity, '--json', `json-files/${entity}.json`],
        { quiet: true }
      );
      if (result.status !== 0) {
        fail(
          `render failed for group '${group}':\n${result.stdout}${result.stderr}`
        );
      }
      rendered.push(group);
    }
    out(
      {
        ok: true,
        entity,
        renderer,
        groups: rendered,
        next: 'run `pollux fmt` before committing',
      },
      `rendered ${rendered.join(', ')} for ${entity} — run \`pollux fmt\` before committing`
    );
  },

  'gen-all'() {
    const renderer = flag('renderer') ?? 'go';
    const script = renderer === 'node' ? './gen-all.sh' : './gen-all-go.sh';
    const result = run('bash', [script]);
    if ((result.status ?? 1) !== 0) process.exit(result.status ?? 1);
    out(
      { ok: true, renderer, next: 'run `pollux fmt` then `pollux check`' },
      'all entities regenerated — run `pollux fmt` then `pollux check`'
    );
  },

  'gen-backend'() {
    const backend = flag('backend') ?? positional[1];
    if (!backend) fail('usage: pollux gen-backend --backend=typescript|go');
    const result = run('bash', ['./generate-pollux.sh', '--backend', backend]);
    process.exit(result.status ?? 1);
  },

  fmt() {
    // Canonical post-gen pipeline: import sort first, formatter LAST.
    run(
      'pnpm',
      ['exec', 'oxlint', '--fix', 'src/app/(private)/generated', 'src/routes'],
      { quiet: true }
    );
    const findResult = spawnSync(
      'bash',
      [
        '-c',
        `find "src/app/(private)/generated" \\( -name '*.ts' -o -name '*.tsx' -o -name '*.css' \\) -print0 | xargs -0 pnpm exec oxfmt && ls src/routes/generated*.tsx | xargs pnpm exec oxfmt`,
      ],
      { encoding: 'utf8' }
    );
    if (findResult.status !== 0) fail(`oxfmt failed:\n${findResult.stderr}`);
    out({ ok: true }, 'formatted (oxlint --fix, then oxfmt)');
  },

  check() {
    const result = run('bash', ['./scripts/pollux/check-drift.sh']);
    process.exit(result.status ?? 1);
  },

  manifest() {
    const result = run('node', ['scripts/pollux/build-manifest.mjs']);
    if ((result.status ?? 1) !== 0) process.exit(result.status ?? 1);
    out(
      {
        ok: true,
        files: [
          'docs/operations/pollux-rollout-manifest.json',
          'docs/operations/pollux-rollout-inventory.md',
        ],
      },
      'manifest + inventory written to docs/operations/'
    );
  },

  test() {
    const suite = flag('suite') ?? positional[1] ?? 'unit';
    const suites = {
      unit: ['pnpm', ['test:ci', 'src/server/generated-crud']],
      // node --test does not expand bare directories on Node 24; the glob
      // is passed literally and expanded by node's own test runner.
      skeletons: [
        'node',
        ['--test', 'scripts/pollux/skeletons/*.unit.spec.mjs'],
      ],
      model: ['node', ['--test', 'scripts/pollux/model/*.unit.spec.mjs']],
      targets: ['node', ['--test', 'scripts/pollux/targets/*.unit.spec.mjs']],
      selection: ['bash', ['./scripts/pollux/test-backend-selection.sh']],
      go: [
        'bash',
        ['-c', 'cd generated/pollux-go && go test ./... && go vet ./...'],
      ],
      e2e: [
        'bash',
        [
          '-c',
          'VITE_BASE_URL=${VITE_BASE_URL:-http://localhost:3011} pnpm exec dotenv -- playwright test --project=chromium --workers=4 e2e/generated-crud.spec.ts e2e/generated-server.spec.ts e2e/generated-guard.spec.ts e2e/go-backend.spec.ts',
        ],
      ],
    };
    const entry = suites[suite];
    if (!entry)
      fail(
        `unknown suite '${suite}' (unit|skeletons|model|targets|selection|go|e2e)`
      );
    const result = run(entry[0], entry[1]);
    process.exit(result.status ?? 1);
  },

  doctor() {
    const checks = [];
    const add = (name, ok, detail) => checks.push({ name, ok, detail });

    add(
      'json-files metadata',
      true,
      `${readEntities().valid.length} valid entities`
    );
    add(
      'gohygen binary',
      fs.existsSync('.cache/gohygen'),
      '.cache/gohygen (build: ./gen-all-go.sh)'
    );
    const node = spawnSync('node', ['--version'], { encoding: 'utf8' });
    add('node', node.status === 0, node.stdout?.trim());
    const goVersion = spawnSync('go', ['version'], { encoding: 'utf8' });
    add('go toolchain', goVersion.status === 0, goVersion.stdout?.trim());
    const pg = spawnSync(
      'docker',
      ['exec', 'start-ui-web-postgres-1', 'pg_isready', '-U', 'startui'],
      { encoding: 'utf8' }
    );
    add(
      'postgres (docker start-ui-web-postgres-1)',
      pg.status === 0,
      pg.stdout?.trim() || 'not reachable (pnpm dk:start)'
    );
    const dev = spawnSync(
      'curl',
      [
        '-s',
        '-o',
        '/dev/null',
        '-w',
        '%{http_code}',
        'http://localhost:3011/login',
      ],
      { encoding: 'utf8' }
    );
    add(
      'dev server :3011',
      dev.stdout === '200',
      `HTTP ${dev.stdout || 'n/a'} (pnpm dev)`
    );
    const goSvc = spawnSync(
      'curl',
      [
        '-s',
        '-o',
        '/dev/null',
        '-w',
        '%{http_code}',
        'http://localhost:8091/healthz',
      ],
      { encoding: 'utf8' }
    );
    add(
      'go backend :8091 (optional)',
      goSvc.stdout === '200',
      `HTTP ${goSvc.stdout || 'n/a'}`
    );

    const allOk = checks
      .filter((c) => !c.name.includes('optional'))
      .every((c) => c.ok);
    out(
      { ok: allOk, checks },
      checks
        .map(
          (c) =>
            `${c.ok ? 'ok  ' : 'FAIL'} ${c.name.padEnd(44)} ${c.detail ?? ''}`
        )
        .join('\n')
    );
    if (!allOk) process.exit(1);
  },
};

const HELP = {
  'list-entities': 'valid metadata entities + skipped stubs',
  'list-templates': 'template groups under _templates/pollux',
  'list-skeletons': 'registered app skeletons (skeletons/registry.json)',
  'describe-skeleton <name>': 'full skeleton.json manifest for one skeleton',
  'validate-skeletons': 'validate skeleton manifests + shared-token drift',
  'new-workspace <skeleton> --dir=<path> [--name=<pkg>]':
    'copy a boilerplate skeleton into a fresh app workspace (staged + atomic)',
  'plan [--target=<t>] --workspace=<path> --entity=<name>':
    'dry-run GenerationPlan (paths + hashes, no writes)',
  'generate [--target=<t>] --workspace=<path> --entity=<name> | --all':
    'generate entities into a workspace (journaled, all-or-nothing; [--accept-generated-overwrite])',
  'check-generated --workspace=<path>':
    'verify generated files against .pollux/generated.json (edits, pending journals)',
  'describe <entity>': 'field-level metadata summary for one entity',
  'validate [entity...] [--metadata-dir=<dir>]':
    'validate metadata (json-files/ or an external dir)',
  'gen-entity <e> [--groups=..] [--renderer=go|node]':
    'regenerate one entity (default groups: page,serverpage,form-fields,data-table-components,debug)',
  'gen-all [--renderer=go|node]': 'regenerate every valid entity (TS output)',
  'gen-backend --backend=typescript|go':
    'backend selector (go -> generated/pollux-go)',
  fmt: 'canonical post-gen pipeline (oxlint --fix, then oxfmt)',
  check: 'regeneration drift gate (fails on any byte difference)',
  manifest: 'rollout manifest + inventory into docs/operations/',
  'test [--suite=unit|skeletons|model|targets|selection|go|e2e]':
    'run a Pollux test suite',
  doctor: 'environment checks (metadata, gohygen, go, postgres, dev server)',
};

const command = positional[0] ?? 'help';
const handler = commands[command];
if (!handler) fail(`unknown command '${command}' — run \`pollux help\``, 2);
await handler();
