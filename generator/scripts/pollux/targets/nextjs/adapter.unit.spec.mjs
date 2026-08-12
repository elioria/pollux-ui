// SPEC-004 — Next.js target adapter unit specs.
// Run with: node --test scripts/pollux/targets/nextjs/*.unit.spec.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, describe, it } from 'node:test';

import nextjsAdapter, { NEXTJS_TARGET_ID } from './adapter.mjs';
import {
  cleanupWorkspace,
  loadRichValidModel,
  makeNextjsWorkspace,
} from './fixture.mjs';
import { GOLDEN_DIR, REPRESENTATIVE_FILES } from './update-golden.mjs';
import { OWNERSHIP_MARK, sha256 } from '../ownership.mjs';
import { executePlans, planEntity } from '../protocol.mjs';

const model = loadRichValidModel();

const planFresh = () => {
  const fixture = makeNextjsWorkspace();
  try {
    return planEntity({
      workspace: fixture.workspace,
      adapter: nextjsAdapter,
      model,
      provenance: fixture.provenance,
      generatedManifest: null,
    });
  } finally {
    cleanupWorkspace(fixture.workspace);
  }
};

const generateInto = (fixture) => {
  const planned = planEntity({
    workspace: fixture.workspace,
    adapter: nextjsAdapter,
    model,
    provenance: fixture.provenance,
    generatedManifest: null,
  });
  return executePlans({
    workspace: fixture.workspace,
    adapter: nextjsAdapter,
    planned: [planned],
    generatedManifest: null,
  });
};

describe('nextjs adapter — planning', () => {
  it('is deterministic: two plans of the same model are identical', () => {
    const a = planFresh();
    const b = planFresh();
    assert.deepEqual(a.plan, b.plan);
    assert.deepEqual(
      [...a.contents.keys()].sort(),
      [...b.contents.keys()].sort()
    );
    for (const [rel, buffer] of a.contents) {
      assert.equal(sha256(buffer), sha256(b.contents.get(rel)));
    }
  });

  it('plans only safe, workspace-relative, traversal-free paths', () => {
    const { plan } = planFresh();
    assert.ok(plan.operations.length > 0);
    for (const op of plan.operations) {
      assert.ok(!path.isAbsolute(op.path), `absolute: ${op.path}`);
      assert.ok(!op.path.includes('\\'), `backslash: ${op.path}`);
      assert.ok(!op.path.split('/').includes('..'), `traversal: ${op.path}`);
      assert.notEqual(op.path.split('/')[0], '.pollux');
      assert.equal(op.action, 'create');
    }
  });

  it('never plans the handwritten shell files', () => {
    const { plan } = planFresh();
    const planned = new Set(plan.operations.map((op) => op.path));
    for (const shell of [
      'components/sidebar.tsx',
      'components/pollux-nav.tsx',
      'lib/pollux/registry.ts',
      'app/layout.tsx',
      'package.json',
    ]) {
      assert.ok(!planned.has(shell), `planned handwritten file: ${shell}`);
    }
  });

  it('rejects a workspace of the wrong framework', () => {
    const fixture = makeNextjsWorkspace({ framework: 'astro' });
    try {
      assert.throws(
        () =>
          planEntity({
            workspace: fixture.workspace,
            adapter: nextjsAdapter,
            model,
            provenance: fixture.provenance,
            generatedManifest: null,
          }),
        /not a generatable Next\.js Pollux workspace/
      );
    } finally {
      cleanupWorkspace(fixture.workspace);
    }
  });
});

describe('nextjs adapter — rendered output', () => {
  const { plan, contents } = planFresh();

  it('stamps ownership headers on every code file', () => {
    for (const op of plan.operations) {
      const content = contents.get(op.path).toString('utf8');
      if (/\.(ts|tsx|css)$/.test(op.path)) {
        assert.ok(
          content.startsWith(`/* ${OWNERSHIP_MARK}`),
          `missing header: ${op.path}`
        );
        assert.match(content, new RegExp(`"target":"${NEXTJS_TARGET_ID}"`));
        assert.match(content, /"entity":"amostra"/);
        assert.equal(op.ownership, 'header');
      } else if (op.path.endsWith('.json')) {
        assert.equal(op.ownership, 'manifest-only');
        assert.doesNotThrow(() => JSON.parse(content));
      }
    }
  });

  it('keeps client directives valid (header comment before use client)', () => {
    const table = contents
      .get('components/pollux/next/entity-table.tsx')
      .toString('utf8');
    const lines = table.split('\n');
    assert.ok(lines[0].startsWith('/*'));
    assert.equal(lines[1], "'use client';");
  });

  it('contains no cross-framework imports (TanStack/React Router/Astro)', () => {
    for (const [rel, buffer] of contents) {
      const content = buffer.toString('utf8');
      assert.ok(!/@tanstack\//.test(content), `tanstack import in ${rel}`);
      assert.ok(
        !/from\s+['"]react-router/.test(content),
        `react-router import in ${rel}`
      );
      assert.ok(
        !/from\s+['"]astro|['"]astro:/.test(content),
        `astro import in ${rel}`
      );
    }
  });

  it('rewrites shared-ui runtime imports to the workspace alias', () => {
    const table = contents
      .get('components/pollux/data-table.tsx')
      .toString('utf8');
    assert.ok(table.includes("'use client';"));
    assert.ok(table.includes('@/lib/pollux/runtime/api-types'));
    assert.ok(!table.includes('../runtime/'));
  });
});

describe('nextjs adapter — generation into a workspace', () => {
  const fixture = makeNextjsWorkspace();
  after(() => cleanupWorkspace(fixture.workspace));

  it('generates, preserves the handwritten shell, and is idempotent', () => {
    const shellBefore = fs.readFileSync(
      path.join(fixture.workspace, 'components/sidebar.tsx'),
      'utf8'
    );
    const first = generateInto(fixture);
    assert.equal(first.entities[0].entity, 'amostra');
    assert.ok(first.entities[0].created > 0);

    // Registry fragment written; handwritten shell byte-identical.
    const fragment = JSON.parse(
      fs.readFileSync(
        path.join(fixture.workspace, 'lib/pollux/registry/amostra.json'),
        'utf8'
      )
    );
    assert.equal(fragment.entity, 'amostra');
    assert.equal(fragment.href, '/manager/amostras');
    assert.ok(fragment.queryKeys.includes('page'));
    assert.ok(fragment.queryKeys.includes('f_titulo__contains'));
    assert.equal(
      fs.readFileSync(
        path.join(fixture.workspace, 'components/sidebar.tsx'),
        'utf8'
      ),
      shellBefore
    );

    // Regeneration: everything preserved (byte-identical outputs).
    const manifest = JSON.parse(
      fs.readFileSync(
        path.join(fixture.workspace, '.pollux/generated.json'),
        'utf8'
      )
    );
    const planned = planEntity({
      workspace: fixture.workspace,
      adapter: nextjsAdapter,
      model,
      provenance: fixture.provenance,
      generatedManifest: manifest,
    });
    const second = executePlans({
      workspace: fixture.workspace,
      adapter: nextjsAdapter,
      planned: [planned],
      generatedManifest: manifest,
    });
    assert.equal(second.entities[0].created, 0);
    assert.equal(second.entities[0].replaced, 0);
    assert.ok(second.entities[0].preserved > 0);
    assert.equal(
      fs.readFileSync(
        path.join(fixture.workspace, 'components/sidebar.tsx'),
        'utf8'
      ),
      shellBefore
    );
  });
});

describe('nextjs adapter — golden output', () => {
  const { plan, contents } = planFresh();

  it('matches the committed golden manifest (paths + sha256)', () => {
    const golden = JSON.parse(
      fs.readFileSync(path.join(GOLDEN_DIR, 'manifest.json'), 'utf8')
    );
    assert.equal(golden.entity, 'amostra');
    assert.equal(golden.adapterVersion, plan.adapterVersion);
    const actual = plan.operations.map((op) => ({
      path: op.path,
      sha256: op.hash,
    }));
    assert.deepEqual(
      actual,
      golden.files,
      'rendered output drifted from test-fixtures/pollux/golden/nextjs — if intentional, run node scripts/pollux/targets/nextjs/update-golden.mjs'
    );
  });

  it('matches the committed representative files byte-for-byte', () => {
    for (const rel of REPRESENTATIVE_FILES) {
      const golden = fs.readFileSync(
        path.join(GOLDEN_DIR, 'files', rel + '.golden')
      );
      assert.equal(
        contents.get(rel).toString('utf8'),
        golden.toString('utf8'),
        `representative file drifted: ${rel}`
      );
    }
  });
});
