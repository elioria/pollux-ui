// SPEC-004 — test fixtures for the Next.js adapter specs and golden tooling.
// Builds a throwaway minimal Next.js Pollux workspace (the handwritten shell
// files inspect() requires + experimental provenance) without copying the
// full skeleton, so specs stay fast and hermetic.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { NEXTJS_ADAPTER_VERSION, NEXTJS_TARGET_ID } from './adapter.mjs';
import { normalizeEntityModel } from '../../model/normalize.mjs';
import { MODEL_VERSION } from '../../model/schema.mjs';

export const REPO_ROOT = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  '../../../..'
);

/** Normalized model of the rich-valid fixture entity ('amostra'). */
export const loadRichValidModel = () =>
  normalizeEntityModel(
    JSON.parse(
      fs.readFileSync(
        path.join(REPO_ROOT, 'test-fixtures/pollux/entities/rich-valid.json'),
        'utf8'
      )
    )
  );

/**
 * Create a minimal Next.js Pollux workspace in a temp dir.
 * @param {object} [opts]
 * @param {string} [opts.framework]
 * @param {string} [opts.targetStatus]
 */
export function makeNextjsWorkspace(opts = {}) {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'pollux-nextjs-'));
  const write = (rel, content) => {
    const abs = path.join(workspace, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  };
  write(
    'package.json',
    JSON.stringify({ name: 'nextjs-fixture', private: true }, null, 2) + '\n'
  );
  write('app/layout.tsx', '// handwritten shell layout (fixture)\n');
  write('components/sidebar.tsx', '// handwritten sidebar (fixture)\n');
  write('components/pollux-nav.tsx', '// handwritten pollux nav (fixture)\n');
  write('lib/pollux/registry.ts', '// handwritten registry reader (fixture)\n');
  const provenance = {
    schemaVersion: 1,
    skeleton: 'nextjs',
    framework: opts.framework ?? 'nextjs-app-router',
    metadataModelVersion: MODEL_VERSION,
    targetStatus: opts.targetStatus ?? 'experimental',
    targetAdapter: { id: NEXTJS_TARGET_ID, version: NEXTJS_ADAPTER_VERSION },
  };
  write('.pollux/workspace.json', JSON.stringify(provenance, null, 2) + '\n');
  return { workspace, provenance };
}

export const cleanupWorkspace = (workspace) =>
  fs.rmSync(workspace, { recursive: true, force: true });
