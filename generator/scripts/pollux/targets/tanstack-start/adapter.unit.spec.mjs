// SPEC-008 — focused tests for the tanstack-start target adapter.
// Run with: node --test scripts/pollux/targets/tanstack-start/adapter.unit.spec.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { adapter } from './adapter.mjs';
import { planGolden, REPRESENTATIVE_PATHS } from './build-golden.mjs';
import {
  cleanupWorkspace,
  loadEntityFixture,
  makeTargetWorkspace,
} from '../fixtures.mjs';
import { hasOwnershipHeader, readGeneratedManifest } from '../ownership.mjs';
import {
  assertAdapterShape,
  executePlans,
  planEntity,
  readWorkspaceProvenance,
} from '../protocol.mjs';
import { normalizeEntityModel } from '../../model/normalize.mjs';

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../..'
);
const SKELETON_DIR = path.join(REPO_ROOT, 'skeletons/tanstack-start');
const GOLDEN_DIR = path.join(
  REPO_ROOT,
  'test-fixtures/pollux/golden/tanstack-start'
);

const richValidModel = () =>
  normalizeEntityModel(loadEntityFixture(REPO_ROOT, 'rich-valid'));

/** Second entity: rich-valid renamed, so shared-ownership paths differ. */
const secondEntityModel = () => {
  const raw = structuredClone(loadEntityFixture(REPO_ROOT, 'rich-valid'));
  raw.data.name = 'inspecao';
  raw.data.dbName = 'inspecao';
  raw.data.gridTitle = 'Inspeções';
  return normalizeEntityModel(raw);
};

/** Workspace seeded with the skeleton's handwritten shell files. */
const makeSkeletonWorkspace = () => {
  const workspace = makeTargetWorkspace({ adapterId: adapter.id });
  for (const rel of ['src/routes/__root.tsx', 'src/router.tsx']) {
    const src = path.join(SKELETON_DIR, rel);
    const dest = path.join(workspace, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
  return workspace;
};

describe('adapter contract', () => {
  it('implements the lifecycle shape with id tanstack-start', () => {
    assertAdapterShape(adapter);
    assert.equal(adapter.id, 'tanstack-start');
    assert.equal(adapter.version, '0.1.0');
  });
});

describe('plan determinism', () => {
  it('plans identical operations and hashes for identical inputs', () => {
    const workspace = makeTargetWorkspace({ adapterId: adapter.id });
    try {
      const provenance = readWorkspaceProvenance(workspace);
      const first = planEntity({
        workspace,
        adapter,
        model: richValidModel(),
        provenance,
      });
      const second = planEntity({
        workspace,
        adapter,
        model: richValidModel(),
        provenance,
      });
      assert.deepEqual(first.plan.operations, second.plan.operations);
      assert.ok(first.plan.operations.length > 10);
      // Sorted, unique output paths (protocol determinism contract).
      const paths = first.plan.operations.map((op) => op.path);
      assert.deepEqual(paths, [...new Set(paths)].sort());
    } finally {
      cleanupWorkspace(workspace);
    }
  });
});

describe('planned output content', () => {
  const { plan, contents } = planGolden();

  it('stamps an ownership header on every ts/tsx output', () => {
    for (const op of plan.operations) {
      assert.equal(op.ownership, 'header', `no header ownership: ${op.path}`);
      assert.ok(
        hasOwnershipHeader(contents.get(op.path).toString('utf8')),
        `missing ownership header: ${op.path}`
      );
    }
  });

  it('contains no cross-framework imports (next, react-router, astro)', () => {
    const banned = [
      /from\s+['"]next(\/|['"])/,
      /from\s+['"]react-router['"]/,
      /from\s+['"]@react-router\//,
      /from\s+['"]astro(\/|['"])/,
      /from\s+['"]@astrojs\//,
      /next\/navigation/,
    ];
    for (const op of plan.operations) {
      const content = contents.get(op.path).toString('utf8');
      for (const pattern of banned) {
        assert.ok(
          !pattern.test(content),
          `forbidden import ${pattern} in ${op.path}`
        );
      }
    }
  });

  it('nav/registry fragments target the handwritten shell + generated proxy', () => {
    const nav = contents
      .get('src/generated/pollux/nav/amostra.ts')
      .toString('utf8');
    assert.match(nav, /to: "\/manager\/amostras"/);
    assert.match(nav, /label: "Amostras de Verificação"/);
    const registry = contents
      .get('src/generated/pollux/registry/amostra.ts')
      .toString('utf8');
    assert.match(registry, /entity: "amostra"/);
    assert.match(registry, /"f_titulo__contains"/);
    const proxy = contents.get('src/routes/api/pollux/$.ts').toString('utf8');
    assert.match(proxy, /generated\/pollux\/registry\/\*\.ts/);
    // Server route registration + server-only env: upstream configuration is
    // read from process.env in the server module, never via a public prefix.
    assert.match(proxy, /createFileRoute\('\/api\/pollux\/\$'\)/);
    assert.match(proxy, /process\.env/);
    assert.doesNotMatch(proxy, /import\.meta\.env\.PUBLIC_/);
    const auth = contents
      .get('src/routes/api/pollux/auth.$action.ts')
      .toString('utf8');
    assert.match(auth, /createFileRoute\('\/api\/pollux\/auth\/\$action'\)/);
    assert.match(auth, /handleAuthAction/);
  });

  it('list route implements the URL-state contract with pending preservation', () => {
    const list = contents
      .get('src/routes/manager/amostras/index.tsx')
      .toString('utf8');
    assert.match(list, /parseListQuery/);
    assert.match(list, /stringifyListQuery/);
    assert.match(list, /useRouterState/);
    assert.match(list, /router\.invalidate\(\)/);
    assert.match(list, /errorComponent: PageErrorBoundary/);
    assert.match(list, /createFileRoute\('\/manager\/amostras\/'\)/);
  });
});

describe('generation pipeline into a skeleton workspace', () => {
  it('preserves handwritten shell files and records ownership; a second entity reuses shared files', () => {
    const workspace = makeSkeletonWorkspace();
    try {
      const provenance = readWorkspaceProvenance(workspace);
      const handwritten = Object.fromEntries(
        ['src/routes/__root.tsx', 'src/router.tsx'].map((rel) => [
          rel,
          fs.readFileSync(path.join(workspace, rel), 'utf8'),
        ])
      );

      // First entity: plans + owns the shared proxy/runtime/ui files.
      const first = planEntity({
        workspace,
        adapter,
        model: richValidModel(),
        provenance,
      });
      executePlans({
        workspace,
        adapter,
        planned: [first],
        generatedManifest: null,
      });
      const manifest1 = readGeneratedManifest(workspace);
      assert.ok(
        manifest1.entities.amostra.ownedPaths.includes(
          'src/routes/api/pollux/$.ts'
        )
      );

      // Handwritten shell files are untouched by generation.
      for (const [rel, before] of Object.entries(handwritten)) {
        assert.equal(
          fs.readFileSync(path.join(workspace, rel), 'utf8'),
          before,
          `handwritten file modified: ${rel}`
        );
      }
      // Generated route files land where the framework route-tree generator
      // discovers them.
      for (const rel of [
        'src/routes/manager/amostras/index.tsx',
        'src/routes/manager/amostras/new.tsx',
        'src/routes/manager/amostras/$id.edit.tsx',
      ]) {
        assert.ok(
          fs.existsSync(path.join(workspace, rel)),
          `missing generated route: ${rel}`
        );
      }

      // Second entity: shared files stay owned by 'amostra'; no conflict.
      const second = planEntity({
        workspace,
        adapter,
        model: secondEntityModel(),
        provenance,
        generatedManifest: readGeneratedManifest(workspace),
      });
      const sharedInSecond = second.plan.operations.filter((op) =>
        op.path.startsWith('src/lib/pollux/')
      );
      assert.equal(sharedInSecond.length, 0);
      executePlans({
        workspace,
        adapter,
        planned: [second],
        generatedManifest: readGeneratedManifest(workspace),
      });
      const manifest2 = readGeneratedManifest(workspace);
      assert.deepEqual(Object.keys(manifest2.entities), [
        'amostra',
        'inspecao',
      ]);
      assert.ok(
        !manifest2.entities.inspecao.ownedPaths.includes(
          'src/routes/api/pollux/$.ts'
        )
      );
      assert.ok(
        fs.existsSync(
          path.join(workspace, 'src/routes/manager/inspecaos/index.tsx')
        )
      );

      // Regenerating the first entity again is a pure preserve pass.
      const again = planEntity({
        workspace,
        adapter,
        model: richValidModel(),
        provenance,
        generatedManifest: readGeneratedManifest(workspace),
      });
      assert.ok(
        again.plan.operations.every((op) => op.action === 'preserve'),
        'regeneration should preserve every owned file'
      );
      assert.deepEqual(again.editedOwned, []);
    } finally {
      cleanupWorkspace(workspace);
    }
  });
});

describe('golden output', () => {
  it('matches the committed golden manifest and representative files', () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(GOLDEN_DIR, 'manifest.json'), 'utf8')
    );
    const { plan, contents } = planGolden();
    assert.equal(manifest.target, adapter.id);
    assert.equal(manifest.adapterVersion, adapter.version);
    assert.equal(manifest.entity, plan.entity);
    assert.deepEqual(
      Object.fromEntries(plan.operations.map((op) => [op.path, op.hash])),
      manifest.files,
      'planned hashes drifted from the golden manifest — regenerate with build-golden.mjs and review the diff'
    );
    for (const rel of REPRESENTATIVE_PATHS) {
      const golden = fs.readFileSync(
        path.join(GOLDEN_DIR, 'files', rel + '.golden')
      );
      assert.ok(
        golden.equals(contents.get(rel)),
        `representative file drifted: ${rel}`
      );
    }
  });
});
