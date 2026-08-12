// SPEC-004 — Next.js App Router target adapter (EXPERIMENTAL).
//
// Implements the SPEC-002 adapter lifecycle (inspect/plan/render/format/
// verify) for standalone Next.js workspaces created from skeletons/nextjs.
// Plans are fully deterministic: template bytes + the frozen entity model
// map to exact file contents; the protocol stamps ownership headers and
// classifies operations.
//
// Discovered by scripts/pollux/cli.mjs at this module path; also importable
// by tests. Pure module: returns values or throws SkeletonError.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ERROR_CODES, SkeletonError } from '../errors.mjs';
import { OWNERSHIP_MARK } from '../ownership.mjs';
import { renderEntityOutputs } from '../../../../_templates/pollux-targets/nextjs/entity-templates.mjs';

export const NEXTJS_TARGET_ID = 'nextjs';
export const NEXTJS_ADAPTER_VERSION = '0.1.0';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../../../..');
const TEMPLATES = path.join(REPO_ROOT, '_templates/pollux-targets');

// ---------------------------------------------------------------- templates

/** Shared SPEC-003 runtime, copied verbatim to lib/pollux/runtime/. */
const SHARED_RUNTIME_FILES = [
  'api-types.ts',
  'client.ts',
  'codecs.ts',
  'errors-pt.ts',
  'query.ts',
];

/** Shared SPEC-003 UI, copied (with transforms) to components/pollux/. */
const SHARED_UI_FILES = [
  'capability-gate.tsx',
  'data-table.tsx',
  'delete-confirm.tsx',
  'entity-form.tsx',
  'states.tsx',
];

/**
 * Framework-neutral BFF auth core (SPEC-003 "Authentication topology"),
 * copied verbatim into the server-only module tree (imported exclusively by
 * the API proxy and the fixed auth endpoints).
 */
const SHARED_SERVER_FILES = [
  ['shared/runtime/bff-core.ts', 'lib/pollux/server/bff-core.ts'],
];

/** Next-specific static sources -> workspace paths. */
const NEXT_STATIC_FILES = [
  ['static/lib/pollux/server/env.ts', 'lib/pollux/server/env.ts'],
  ['static/lib/pollux/server/data.ts', 'lib/pollux/server/data.ts'],
  [
    'static/components/pollux/next/entity-table.tsx',
    'components/pollux/next/entity-table.tsx',
  ],
  [
    'static/components/pollux/next/entity-create-form.tsx',
    'components/pollux/next/entity-create-form.tsx',
  ],
  [
    'static/components/pollux/next/entity-edit-form.tsx',
    'components/pollux/next/entity-edit-form.tsx',
  ],
  ['static/app/api/pollux/proxy-route.ts', 'app/api/pollux/[...path]/route.ts'],
  [
    'static/app/api/pollux/auth-route.ts',
    'app/api/pollux/auth/[[...path]]/route.ts',
  ],
];

const readTemplate = (rel) =>
  fs.readFileSync(path.join(TEMPLATES, rel), 'utf8');

/**
 * Deterministic transform for shared UI copies: mark them as Client
 * Components and rewrite the runtime-relative imports to the workspace
 * alias (the runtime lands in lib/, the UI in components/).
 */
const transformSharedUi = (content) =>
  `'use client';\n\n${content.replaceAll('../runtime/', '@/lib/pollux/runtime/')}`;

/**
 * Workspace-level outputs (shared runtime/UI + Next static modules) that
 * every entity depends on. Exported for tests/golden tooling.
 */
export function workspaceLevelOutputs() {
  const outputs = [];
  for (const file of SHARED_RUNTIME_FILES) {
    outputs.push({
      path: `lib/pollux/runtime/${file}`,
      content: readTemplate(`shared/runtime/${file}`),
    });
  }
  for (const file of SHARED_UI_FILES) {
    outputs.push({
      path: `components/pollux/${file}`,
      content: transformSharedUi(readTemplate(`shared/ui/${file}`)),
    });
  }
  for (const [templateRel, workspaceRel] of SHARED_SERVER_FILES) {
    outputs.push({ path: workspaceRel, content: readTemplate(templateRel) });
  }
  for (const [templateRel, workspaceRel] of NEXT_STATIC_FILES) {
    outputs.push({
      path: workspaceRel,
      content: readTemplate(`nextjs/${templateRel}`),
    });
  }
  return outputs;
}

// ------------------------------------------------------------------ helpers

/** Which entity (if any) owns a workspace-relative path per generated.json. */
const ownerOf = (manifest, relPath) => {
  if (!manifest) return null;
  for (const [entity, entry] of Object.entries(manifest.entities ?? {})) {
    if (entry.ownedPaths?.includes(relPath)) return entity;
  }
  return null;
};

const FORBIDDEN_IMPORT_PATTERNS = [
  { name: 'TanStack Router', pattern: /@tanstack\/(react-)?router/ },
  {
    name: 'React Router',
    pattern: /from\s+['"]react-router(-dom)?(\/|['"])/,
  },
  { name: 'Astro', pattern: /from\s+['"]astro|['"]astro:/ },
];

const walkFiles = (dir, visit, rel = '') => {
  for (const dirent of fs
    .readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    const childRel = rel === '' ? dirent.name : `${rel}/${dirent.name}`;
    const childAbs = path.join(dir, dirent.name);
    if (dirent.isDirectory()) walkFiles(childAbs, visit, childRel);
    else if (dirent.isFile()) visit(childRel, childAbs);
  }
};

// ------------------------------------------------------------------ adapter

export const nextjsAdapter = {
  id: NEXTJS_TARGET_ID,
  version: NEXTJS_ADAPTER_VERSION,
  // standalone-crud only: entities requiring export/operation/report
  // capabilities are rejected at plan time by the protocol.
  capabilities: [],

  /**
   * Validate the workspace is a Next.js Pollux workspace and freeze the
   * planning context. No writes.
   */
  inspect(workspace, { provenance, generated }) {
    const problems = [];
    if (provenance?.framework !== 'nextjs-app-router') {
      problems.push(
        `workspace framework '${provenance?.framework}' is not 'nextjs-app-router'`
      );
    }
    if (provenance?.targetAdapter?.id !== NEXTJS_TARGET_ID) {
      problems.push(
        `workspace target adapter '${provenance?.targetAdapter?.id}' is not '${NEXTJS_TARGET_ID}'`
      );
    }
    if (
      provenance?.targetStatus !== 'experimental' &&
      provenance?.targetStatus !== 'supported'
    ) {
      problems.push(
        `workspace targetStatus '${provenance?.targetStatus}' does not allow generation`
      );
    }
    // The handwritten shell files the generated output integrates with.
    for (const rel of [
      'package.json',
      'app/layout.tsx',
      'components/sidebar.tsx',
      'components/pollux-nav.tsx',
      'lib/pollux/registry.ts',
    ]) {
      if (!fs.existsSync(path.join(workspace, rel))) {
        problems.push(`workspace is missing required file: ${rel}`);
      }
    }
    if (problems.length > 0) {
      throw new SkeletonError(
        ERROR_CODES.TARGET_UNSUPPORTED,
        `workspace is not a generatable Next.js Pollux workspace (${problems.length} problem${problems.length === 1 ? '' : 's'})`,
        { details: { workspace, problems } }
      );
    }
    return { workspace, provenance, generated: generated ?? null };
  },

  /**
   * Deterministic outputs for one entity: per-entity routes/spec/registry
   * fragment always; workspace-level files only when absent or already owned
   * by this entity (files owned by another generated entity stay with their
   * owner; collisions with handwritten files become plan-time
   * OWNERSHIP_CONFLICT in the protocol).
   */
  plan(model, context) {
    const outputs = [...renderEntityOutputs(model)];
    for (const output of workspaceLevelOutputs()) {
      const exists = fs.existsSync(path.join(context.workspace, output.path));
      if (!exists) {
        outputs.push(output);
        continue;
      }
      const owner = ownerOf(context.generated, output.path);
      if (owner === null || owner === model.entity.id) outputs.push(output);
    }
    return { outputs };
  },

  /** Write planned contents into the staging tree (create/replace only). */
  render(plan, staging) {
    for (const op of plan.operations) {
      if (op.action === 'remove' || op.action === 'preserve') continue;
      const file = path.join(staging, op.path);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, plan.contents.get(op.path));
    }
    return { ok: true };
  },

  /**
   * No-op by design: templates are kept pre-formatted. The skeleton ships no
   * formatter, and the protocol requires formatting to be a FIXPOINT of the
   * planned hashes — running a real formatter here would either change
   * nothing (wasted work) or fail the pipeline. Formatting discipline lives
   * in the template sources instead.
   */
  format() {
    return { ok: true };
  },

  /**
   * Deterministic, offline structural verification of the staged tree:
   * non-empty files, ownership headers on every code file, and the
   * cross-framework import ban. `tsc --noEmit` runs only if the staging
   * tree carries node_modules (it never does under the standard pipeline —
   * staging holds only generated files, so a type check could not resolve
   * the workspace's dependencies or tsconfig from there).
   */
  verify(staging) {
    const problems = [];
    walkFiles(staging, (rel, abs) => {
      const content = fs.readFileSync(abs, 'utf8');
      if (content.length === 0) {
        problems.push(`empty staged file: ${rel}`);
        return;
      }
      const ext = path.extname(rel);
      if (
        ['.ts', '.tsx', '.css'].includes(ext) &&
        !content.includes(OWNERSHIP_MARK)
      ) {
        problems.push(`missing ownership header: ${rel}`);
      }
      if (['.ts', '.tsx', '.js', '.jsx', '.mjs'].includes(ext)) {
        for (const { name, pattern } of FORBIDDEN_IMPORT_PATTERNS) {
          if (pattern.test(content)) {
            problems.push(`forbidden ${name} import in ${rel}`);
          }
        }
      }
      if (ext === '.json') {
        try {
          JSON.parse(content);
        } catch {
          problems.push(`invalid JSON: ${rel}`);
        }
      }
    });
    if (
      problems.length === 0 &&
      fs.existsSync(path.join(staging, 'node_modules'))
    ) {
      // Optional deep check — see docstring; structural checks already ran.
      const result = spawnSync('npx', ['tsc', '--noEmit'], {
        cwd: staging,
        encoding: 'utf8',
      });
      if (result.status !== 0) {
        problems.push(`tsc --noEmit failed:\n${result.stdout}${result.stderr}`);
      }
    }
    return { ok: problems.length === 0, problems };
  },
};

export const adapters = [nextjsAdapter];
export default nextjsAdapter;
