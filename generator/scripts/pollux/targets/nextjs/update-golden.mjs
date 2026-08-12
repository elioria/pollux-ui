#!/usr/bin/env node
// SPEC-004 — regenerate the Next.js golden output fixture:
//   test-fixtures/pollux/golden/nextjs/manifest.json   (paths + sha256)
//   test-fixtures/pollux/golden/nextjs/files/**        (representative files)
//
// The manifest hashes the FINAL planned content (ownership headers included)
// for the rich-valid fixture entity generated into a pristine workspace.
// Run after any intentional template/adapter change:
//   node scripts/pollux/targets/nextjs/update-golden.mjs
import fs from 'node:fs';
import path from 'node:path';

import nextjsAdapter from './adapter.mjs';
import {
  cleanupWorkspace,
  loadRichValidModel,
  makeNextjsWorkspace,
  REPO_ROOT,
} from './fixture.mjs';
import { planEntity } from '../protocol.mjs';

/** Representative rendered files committed verbatim next to the manifest. */
export const REPRESENTATIVE_FILES = [
  'app/(pollux)/manager/amostras/page.tsx',
  'app/api/pollux/[...path]/route.ts',
  'lib/pollux/entities/amostra/spec.ts',
];

export const GOLDEN_DIR = path.join(
  REPO_ROOT,
  'test-fixtures/pollux/golden/nextjs'
);

/** Plan the rich-valid entity into a pristine fixture workspace. */
export function planRichValid() {
  const { workspace, provenance } = makeNextjsWorkspace();
  try {
    return planEntity({
      workspace,
      adapter: nextjsAdapter,
      model: loadRichValidModel(),
      provenance,
      generatedManifest: null,
    });
  } finally {
    cleanupWorkspace(workspace);
  }
}

const isMain =
  process.argv[1] &&
  import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href;

if (isMain) {
  const { plan, contents } = planRichValid();
  const manifest = {
    target: plan.target,
    adapterVersion: plan.adapterVersion,
    generatorVersion: plan.generatorVersion,
    modelVersion: plan.modelVersion,
    entity: plan.entity,
    files: plan.operations.map((op) => ({ path: op.path, sha256: op.hash })),
  };
  fs.rmSync(GOLDEN_DIR, { recursive: true, force: true });
  fs.mkdirSync(path.join(GOLDEN_DIR, 'files'), { recursive: true });
  fs.writeFileSync(
    path.join(GOLDEN_DIR, 'manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n'
  );
  for (const rel of REPRESENTATIVE_FILES) {
    const buffer = contents.get(rel);
    if (!buffer) throw new Error(`representative file not planned: ${rel}`);
    const dest = path.join(GOLDEN_DIR, 'files', rel + '.golden');
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, buffer);
  }
  console.log(
    `golden updated: ${manifest.files.length} hashed files, ${REPRESENTATIVE_FILES.length} representative files`
  );
}
