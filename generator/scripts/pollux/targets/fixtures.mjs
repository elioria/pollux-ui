// Test-only fixtures for the target-adapter unit specs. The 'demo' adapter
// exercises the full inspect/plan/render/format/verify pipeline; it is NOT
// registered in the production registry (no standalone adapter ships before
// SPEC-004..006) and must only ever be constructed by tests.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { sha256 } from './ownership.mjs';
import { MODEL_VERSION } from '../model/schema.mjs';

export const DEMO_TARGET_ID = 'demo';

/**
 * Build the demo adapter. Deterministic: plans four files per entity —
 * tsx + css (header ownership), json (manifest-only ownership) and astro
 * (frontmatter header). Format is an idempotent rewrite; verify checks the
 * staged files are non-empty.
 *
 * @param {object} [opts]
 * @param {string[]} [opts.capabilities]
 * @param {(model: object, context: object) => Array<{path: string,
 *   content: string}>} [opts.planOutputs] override planned outputs
 * @param {{render?: Error, format?: Error, verify?: Error}} [opts.failWith]
 *   stage-level failure injection
 */
export function makeDemoAdapter(opts = {}) {
  return {
    id: DEMO_TARGET_ID,
    version: '1',
    capabilities: opts.capabilities ?? ['export', 'operation'],
    inspect(workspace, manifest) {
      return { workspace, manifest };
    },
    plan(model, context) {
      if (opts.planOutputs) {
        return { outputs: opts.planOutputs(model, context) };
      }
      const dir = `app/generated/${model.entity.id}`;
      const fieldLines = model.fields
        .map((f) => `  // ${f.codeName}: ${f.scalarType}`)
        .join('\n');
      return {
        outputs: [
          {
            path: `${dir}/page.tsx`,
            content: `export function ${model.entity.id}Page() {\n${fieldLines}\n  return null;\n}\n`,
          },
          {
            path: `${dir}/styles.css`,
            content: `.${model.entity.id} {\n  display: block;\n}\n`,
          },
          {
            path: `${dir}/columns.json`,
            content: JSON.stringify(model.list.visibleColumns, null, 2) + '\n',
          },
          {
            path: `${dir}/view.astro`,
            content: `---\nconst entity = '${model.entity.id}';\n---\n<div>{entity}</div>\n`,
          },
        ],
      };
    },
    render(plan, staging) {
      if (opts.failWith?.render) throw opts.failWith.render;
      for (const op of plan.operations) {
        if (op.action === 'remove' || op.action === 'preserve') continue;
        const file = path.join(staging, op.path);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, plan.contents.get(op.path));
      }
      return { ok: true };
    },
    format(staging) {
      if (opts.failWith?.format) throw opts.failWith.format;
      // Idempotent rewrite (fixpoint of planned content).
      const walk = (dir) => {
        for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
          const abs = path.join(dir, d.name);
          if (d.isDirectory()) walk(abs);
          else fs.writeFileSync(abs, fs.readFileSync(abs));
        }
      };
      walk(staging);
      return { ok: true };
    },
    verify(staging) {
      if (opts.failWith?.verify) throw opts.failWith.verify;
      const problems = [];
      const walk = (dir) => {
        for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
          const abs = path.join(dir, d.name);
          if (d.isDirectory()) walk(abs);
          else if (fs.statSync(abs).size === 0) {
            problems.push(`empty staged file: ${abs}`);
          }
        }
      };
      walk(staging);
      return { ok: problems.length === 0, problems };
    },
  };
}

/**
 * Create a throwaway workspace directory with `.pollux/workspace.json`
 * provenance and a couple of pre-existing hand files.
 *
 * @param {object} [opts]
 * @param {'supported'|'unsupported'} [opts.targetStatus]
 * @param {string|null} [opts.adapterId]
 * @param {string} [opts.metadataModelVersion]
 * @param {string} [opts.skeleton]
 */
export function makeTargetWorkspace(opts = {}) {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'pollux-target-'));
  const {
    targetStatus = 'supported',
    adapterId = DEMO_TARGET_ID,
    metadataModelVersion = MODEL_VERSION,
    skeleton = 'demo-skel',
  } = opts;
  fs.mkdirSync(path.join(workspace, '.pollux'), { recursive: true });
  fs.writeFileSync(
    path.join(workspace, '.pollux/workspace.json'),
    JSON.stringify(
      {
        schemaVersion: 1,
        skeleton,
        framework: 'demo-framework',
        metadataModelVersion,
        targetStatus,
        targetAdapter:
          targetStatus === 'supported'
            ? { id: adapterId, version: '1' }
            : { id: null, version: null },
      },
      null,
      2
    ) + '\n'
  );
  fs.writeFileSync(
    path.join(workspace, 'package.json'),
    '{\n  "name": "demo-workspace",\n  "private": true\n}\n'
  );
  fs.writeFileSync(
    path.join(workspace, 'README.md'),
    '# demo workspace (hand-written)\n'
  );
  return workspace;
}

export function cleanupWorkspace(workspace) {
  fs.rmSync(workspace, { recursive: true, force: true });
}

/**
 * Deterministic content hash of an entire directory tree: sorted
 * `relpath sha256` lines over every regular file. Two byte-identical trees
 * produce equal digests regardless of directory mtimes.
 */
export function hashTree(root) {
  const lines = [];
  const walk = (rel) => {
    const abs = path.join(root, rel);
    for (const d of fs
      .readdirSync(abs, { withFileTypes: true })
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
      const childRel = rel === '' ? d.name : `${rel}/${d.name}`;
      const childAbs = path.join(root, childRel);
      if (d.isDirectory()) walk(childRel);
      else if (d.isFile()) {
        lines.push(`${childRel} ${sha256(fs.readFileSync(childAbs))}`);
      }
    }
  };
  walk('');
  return lines.sort().join('\n');
}

/** Load a metadata fixture from test-fixtures/pollux/entities. */
export function loadEntityFixture(repoRoot, name) {
  return JSON.parse(
    fs.readFileSync(
      path.join(repoRoot, 'test-fixtures/pollux/entities', `${name}.json`),
      'utf8'
    )
  );
}
