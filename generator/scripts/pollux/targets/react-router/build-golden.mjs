#!/usr/bin/env node
// Regenerate the golden fixture for the react-router adapter
// (test-fixtures/pollux/golden/react-router). Run after ANY intentional
// template/adapter change, review the diff, and commit it together with the
// change — adapter.unit.spec.mjs fails on drift otherwise.
//
//   node scripts/pollux/targets/react-router/build-golden.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { adapter } from './adapter.mjs';
import {
  cleanupWorkspace,
  loadEntityFixture,
  makeTargetWorkspace,
} from '../fixtures.mjs';
import { planEntity, readWorkspaceProvenance } from '../protocol.mjs';
import { normalizeEntityModel } from '../../model/normalize.mjs';

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../..'
);
const GOLDEN_DIR = path.join(
  REPO_ROOT,
  'test-fixtures/pollux/golden/react-router'
);

/** Entity-specific + proxy outputs stored verbatim under files/. */
export const REPRESENTATIVE_PATHS = [
  'app/generated/pollux/amostra/spec.ts',
  'app/generated/pollux/nav/amostra.ts',
  'app/generated/pollux/registry/amostra.ts',
  'app/lib/pollux/use-pollux-mutation.ts',
  'app/routes/api.pollux.$.ts',
  'app/routes/api.pollux.auth.ts',
  'app/routes/pollux/amostras/edit.tsx',
  'app/routes/pollux/amostras/index.tsx',
  'app/routes/pollux/amostras/new.tsx',
];

/** Plan the rich-valid fixture into a throwaway workspace (final bytes). */
export function planGolden() {
  const model = normalizeEntityModel(
    loadEntityFixture(REPO_ROOT, 'rich-valid')
  );
  const workspace = makeTargetWorkspace({ adapterId: adapter.id });
  try {
    const provenance = readWorkspaceProvenance(workspace);
    return planEntity({ workspace, adapter, model, provenance });
  } finally {
    cleanupWorkspace(workspace);
  }
}

const main = () => {
  const { plan, contents } = planGolden();
  fs.rmSync(GOLDEN_DIR, { recursive: true, force: true });
  fs.mkdirSync(path.join(GOLDEN_DIR, 'files'), { recursive: true });

  const manifest = {
    target: adapter.id,
    adapterVersion: adapter.version,
    entity: plan.entity,
    modelVersion: plan.modelVersion,
    files: Object.fromEntries(plan.operations.map((op) => [op.path, op.hash])),
  };
  fs.writeFileSync(
    path.join(GOLDEN_DIR, 'manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n'
  );
  for (const rel of REPRESENTATIVE_PATHS) {
    const buffer = contents.get(rel);
    if (!buffer) throw new Error(`representative path not planned: ${rel}`);
    const dest = path.join(GOLDEN_DIR, 'files', rel + '.golden');
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, buffer);
  }
  console.log(
    `golden fixture written: ${plan.operations.length} hashes, ${REPRESENTATIVE_PATHS.length} representative files`
  );
};

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
