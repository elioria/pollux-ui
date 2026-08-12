// SPEC-002 — ownership headers + .pollux/generated.json record.
// Run with: node --test scripts/pollux/targets/*.unit.spec.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, describe, it } from 'node:test';

import { cleanupWorkspace, makeTargetWorkspace } from './fixtures.mjs';
import {
  applyOwnershipHeader,
  detectEditedOwnedFiles,
  GENERATED_MANIFEST_PATH,
  hasOwnershipHeader,
  mergeGeneratedManifest,
  ownerOfPath,
  ownershipStyleFor,
  readGeneratedManifest,
  serializeGeneratedManifest,
  sha256,
} from './ownership.mjs';

const meta = {
  target: 'demo',
  entity: 'amostra',
  generatorVersion: '1',
  modelVersion: '1',
};

describe('ownership headers per file format', () => {
  it('classifies formats', () => {
    assert.equal(ownershipStyleFor('a/b.tsx'), 'block');
    assert.equal(ownershipStyleFor('a/b.ts'), 'block');
    assert.equal(ownershipStyleFor('a/b.mjs'), 'block');
    assert.equal(ownershipStyleFor('a/b.css'), 'block');
    assert.equal(ownershipStyleFor('a/b.astro'), 'astro');
    assert.equal(ownershipStyleFor('a/b.json'), 'manifest');
    assert.equal(ownershipStyleFor('a/b.svg'), 'manifest');
  });

  it('stamps a machine-readable block comment on ts/tsx/css', () => {
    for (const file of ['x.tsx', 'x.ts', 'x.css']) {
      const { content, ownership } = applyOwnershipHeader(file, 'body\n', meta);
      assert.equal(ownership, 'header');
      assert.ok(content.startsWith('/* @pollux-generated {"target":"demo"'));
      assert.ok(content.endsWith('body\n'));
      assert.ok(hasOwnershipHeader(content));
      // Header record parses back as JSON.
      const record = JSON.parse(
        content.match(/@pollux-generated (\{.*?\}) —/)[1]
      );
      assert.deepEqual(record, {
        target: 'demo',
        entity: 'amostra',
        generatorVersion: '1',
        modelVersion: '1',
      });
    }
  });

  it('stamps astro headers inside the frontmatter fence', () => {
    const withFrontmatter = applyOwnershipHeader(
      'v.astro',
      '---\nconst a = 1;\n---\n<div />\n',
      meta
    );
    assert.equal(withFrontmatter.ownership, 'header');
    assert.ok(withFrontmatter.content.startsWith('---\n// @pollux-generated '));
    assert.ok(withFrontmatter.content.includes('const a = 1;'));

    const without = applyOwnershipHeader('v.astro', '<div />\n', meta);
    assert.ok(without.content.startsWith('---\n// @pollux-generated '));
    assert.ok(without.content.includes('---\n<div />\n'));
  });

  it('json is manifest-only: content untouched', () => {
    const { content, ownership } = applyOwnershipHeader(
      'x.json',
      '{"a":1}\n',
      meta
    );
    assert.equal(ownership, 'manifest-only');
    assert.equal(content, '{"a":1}\n');
  });
});

describe('generated manifest record', () => {
  const files = [
    { path: 'app/b.css', hash: 'h2' },
    { path: 'app/a.tsx', hash: 'h1' },
  ];
  const record = mergeGeneratedManifest(null, {
    target: 'demo',
    generatorVersion: '1',
    modelVersion: '1',
    entity: 'amostra',
    files,
  });

  it('is deterministic: sorted paths and entities', () => {
    assert.deepEqual(record.entities.amostra.ownedPaths, [
      'app/a.tsx',
      'app/b.css',
    ]);
    const second = mergeGeneratedManifest(record, {
      target: 'demo',
      generatorVersion: '1',
      modelVersion: '1',
      entity: 'aaa',
      files: [{ path: 'app/z.tsx', hash: 'h3' }],
    });
    assert.deepEqual(Object.keys(second.entities), ['aaa', 'amostra']);
    assert.equal(
      serializeGeneratedManifest(second),
      serializeGeneratedManifest(JSON.parse(serializeGeneratedManifest(second)))
    );
  });

  it('ownerOfPath resolves owning entity', () => {
    assert.equal(ownerOfPath(record, 'app/a.tsx'), 'amostra');
    assert.equal(ownerOfPath(record, 'app/other.tsx'), null);
    assert.equal(ownerOfPath(null, 'app/a.tsx'), null);
  });

  it('round-trips through the workspace file and detects edits', () => {
    const workspace = makeTargetWorkspace();
    after(() => cleanupWorkspace(workspace));
    const body = 'generated\n';
    fs.mkdirSync(path.join(workspace, 'app'), { recursive: true });
    fs.writeFileSync(path.join(workspace, 'app/a.tsx'), body);
    const live = mergeGeneratedManifest(null, {
      target: 'demo',
      generatorVersion: '1',
      modelVersion: '1',
      entity: 'amostra',
      files: [
        { path: 'app/a.tsx', hash: sha256(Buffer.from(body)) },
        { path: 'app/gone.tsx', hash: 'deadbeef' },
      ],
    });
    fs.writeFileSync(
      path.join(workspace, GENERATED_MANIFEST_PATH),
      serializeGeneratedManifest(live)
    );
    assert.deepEqual(readGeneratedManifest(workspace), live);

    let state = detectEditedOwnedFiles(workspace, live);
    assert.deepEqual(state.edited, []);
    assert.deepEqual(state.missing, [
      { entity: 'amostra', path: 'app/gone.tsx' },
    ]);

    fs.writeFileSync(path.join(workspace, 'app/a.tsx'), 'hand edited\n');
    state = detectEditedOwnedFiles(workspace, live);
    assert.equal(state.edited.length, 1);
    assert.equal(state.edited[0].path, 'app/a.tsx');
    assert.notEqual(state.edited[0].actualHash, state.edited[0].expectedHash);
  });

  it('rejects a corrupt record with MANIFEST_INVALID', () => {
    const workspace = makeTargetWorkspace();
    after(() => cleanupWorkspace(workspace));
    fs.writeFileSync(
      path.join(workspace, GENERATED_MANIFEST_PATH),
      '{not json'
    );
    assert.throws(
      () => readGeneratedManifest(workspace),
      (err) => err.code === 'MANIFEST_INVALID'
    );
    fs.writeFileSync(
      path.join(workspace, GENERATED_MANIFEST_PATH),
      '{"target":"demo"}'
    );
    assert.throws(
      () => readGeneratedManifest(workspace),
      (err) => err.code === 'MANIFEST_INVALID'
    );
  });

  it('returns null when the workspace has no record', () => {
    const workspace = makeTargetWorkspace();
    after(() => cleanupWorkspace(workspace));
    assert.equal(readGeneratedManifest(workspace), null);
  });
});
