// SPEC-006 — focused tests for the astro-react target adapter.
// Run: node --test scripts/pollux/targets/astro-react/
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { adapter } from './adapter.mjs';
import { planGolden, REPRESENTATIVE_PATHS } from './build-golden.mjs';
import {
  cleanupWorkspace,
  loadEntityFixture,
  makeTargetWorkspace,
} from '../fixtures.mjs';
import { OWNERSHIP_MARK, sha256 } from '../ownership.mjs';
import { planEntity, readWorkspaceProvenance } from '../protocol.mjs';
import { normalizeEntityModel } from '../../model/normalize.mjs';

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../..'
);
const GOLDEN_DIR = path.join(
  REPO_ROOT,
  'test-fixtures/pollux/golden/astro-react'
);

const planRichValid = ({ generatedManifest } = {}) => {
  const model = normalizeEntityModel(
    loadEntityFixture(REPO_ROOT, 'rich-valid')
  );
  const workspace = makeTargetWorkspace({ adapterId: adapter.id });
  try {
    const provenance = readWorkspaceProvenance(workspace);
    return planEntity({
      workspace,
      adapter,
      model,
      provenance,
      ...(generatedManifest !== undefined ? { generatedManifest } : {}),
    });
  } finally {
    cleanupWorkspace(workspace);
  }
};

test('plans are deterministic (hashes + operations identical across runs)', () => {
  const first = planRichValid();
  const second = planRichValid();
  assert.deepEqual(first.plan, second.plan);
  for (const [rel, buffer] of first.contents) {
    assert.equal(
      sha256(buffer),
      sha256(second.contents.get(rel)),
      `content differs for ${rel}`
    );
  }
});

test('every ts/tsx/astro output carries an ownership header', () => {
  const { plan, contents } = planRichValid();
  for (const op of plan.operations) {
    const ext = path.extname(op.path);
    if (!['.ts', '.tsx', '.astro'].includes(ext)) continue;
    const content = contents.get(op.path).toString('utf8');
    assert.ok(
      content.includes(OWNERSHIP_MARK),
      `missing ownership header: ${op.path}`
    );
    assert.equal(op.ownership, 'header');
    if (ext === '.astro') {
      // Header must live INSIDE the frontmatter fence.
      assert.match(content, /^---\n\/\/ @pollux-generated /);
    }
  }
});

test('client hydration is limited to the CRUD island pages', () => {
  const { plan, contents } = planRichValid();
  for (const op of plan.operations) {
    const content = contents.get(op.path).toString('utf8');
    if (
      op.path.startsWith('src/pages/manager/') &&
      op.path.endsWith('.astro')
    ) {
      const matches = content.match(/client:[a-z]+/g) ?? [];
      assert.deepEqual(
        [...new Set(matches)],
        ['client:load'],
        `${op.path} must hydrate exactly the island with client:load`
      );
      // Exactly ONE island directive in the template body (matches inside
      // the frontmatter fence are comments, not directives).
      const body = content
        .split(/\n---\n/)
        .slice(1)
        .join('\n---\n');
      assert.equal(
        (body.match(/client:[a-z]+/g) ?? []).length,
        1,
        `${op.path}: one island per page`
      );
    } else if (op.path.endsWith('.astro')) {
      assert.ok(
        !/client:[a-z]/.test(content),
        `unexpected hydration directive in ${op.path}`
      );
    }
  }
  // Non-CRUD skeleton pages ship no generated CRUD JavaScript at all.
  for (const rel of ['src/pages/index.astro', 'src/layouts/Layout.astro']) {
    const skeletonFile = path.join(REPO_ROOT, 'skeletons/astro', rel);
    const content = fs.readFileSync(skeletonFile, 'utf8');
    assert.ok(
      !/client:[a-z]/.test(content),
      `${rel} must not carry a hydration directive`
    );
  }
});

test('no cross-framework imports (next/*, @tanstack, react-router, remix)', () => {
  const { plan, contents } = planRichValid();
  const forbidden = [
    /from\s+['"]next(\/|['"])/,
    /from\s+['"]@tanstack\//,
    /from\s+['"]react-router/,
    /from\s+['"]@remix-run\//,
  ];
  for (const op of plan.operations) {
    const content = contents.get(op.path).toString('utf8');
    for (const pattern of forbidden) {
      assert.ok(
        !pattern.test(content),
        `forbidden import ${pattern} in ${op.path}`
      );
    }
  }
});

test('shared files are skipped while another entity owns them', () => {
  const foreignManifest = {
    target: adapter.id,
    generatorVersion: '1',
    modelVersion: '1',
    entities: {
      other: {
        ownedPaths: ['src/lib/pollux/runtime/api-types.ts'],
        hashes: { 'src/lib/pollux/runtime/api-types.ts': 'x'.repeat(64) },
      },
    },
  };
  const { plan } = planRichValid({ generatedManifest: foreignManifest });
  assert.ok(
    !plan.operations.some(
      (op) => op.path === 'src/lib/pollux/runtime/api-types.ts'
    ),
    'shared file owned by another entity must not be re-planned'
  );
  // Entity-specific outputs are always planned.
  assert.ok(
    plan.operations.some(
      (op) => op.path === 'src/generated/pollux/amostra/island.tsx'
    )
  );
});

test('verify flags forbidden imports and stray hydration in staging', () => {
  const staging = fs.mkdtempSync(path.join(REPO_ROOT, '.golden-tmp-'));
  try {
    const write = (rel, content) => {
      const abs = path.join(staging, rel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, content);
    };
    write(
      'src/generated/pollux/x/island.tsx',
      `/* ${OWNERSHIP_MARK} {} */\nimport { Link } from 'next/link';\n`
    );
    write(
      'src/pages/other.astro',
      `---\n// ${OWNERSHIP_MARK} {}\n---\n<Widget client:load />\n`
    );
    write(
      'src/pages/manager/xs/index.astro',
      `---\n// ${OWNERSHIP_MARK} {}\n---\n<p>no island</p>\n`
    );
    const result = adapter.verify(staging);
    assert.equal(result.ok, false);
    assert.ok(result.problems.some((p) => p.includes('forbidden framework')));
    assert.ok(result.problems.some((p) => p.includes('outside CRUD pages')));
    assert.ok(result.problems.some((p) => p.includes('without a hydrated')));
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
});

test('golden fixture matches the current plan (rich-valid)', () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(GOLDEN_DIR, 'manifest.json'), 'utf8')
  );
  const { plan, contents } = planGolden();
  assert.equal(manifest.target, adapter.id);
  assert.equal(manifest.adapterVersion, adapter.version);
  const actual = Object.fromEntries(
    plan.operations.map((op) => [op.path, op.hash])
  );
  assert.deepEqual(
    actual,
    manifest.files,
    'plan hashes drifted from the golden manifest — rerun build-golden.mjs and review the diff'
  );
  for (const rel of REPRESENTATIVE_PATHS) {
    const golden = fs.readFileSync(
      path.join(GOLDEN_DIR, 'files', rel + '.golden')
    );
    assert.equal(
      sha256(golden),
      sha256(contents.get(rel)),
      `representative file drifted: ${rel}`
    );
  }
});
