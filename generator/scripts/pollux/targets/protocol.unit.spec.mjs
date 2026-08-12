// SPEC-002 — adapter protocol: registry, target resolution, deterministic
// plans, plan-time rejection, staged generation + journaled publication.
// Run with: node --test scripts/pollux/targets/*.unit.spec.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, describe, it } from 'node:test';

import {
  cleanupWorkspace,
  hashTree,
  loadEntityFixture,
  makeDemoAdapter,
  makeTargetWorkspace,
} from './fixtures.mjs';
import { hasOwnershipHeader, readGeneratedManifest } from './ownership.mjs';
import {
  assertNoPendingTransactions,
  checkGeneratedState,
  createAdapterRegistry,
  executePlans,
  planEntity,
  PRODUCTION_ADAPTER_REGISTRY,
  resolveAdapter,
  resolveTargetForWorkspace,
} from './protocol.mjs';
import { listPendingTransactions } from './transaction.mjs';
import { normalizeEntityModel } from '../model/normalize.mjs';

const repoRoot = path.resolve(
  new URL('.', import.meta.url).pathname,
  '../../..'
);
const richModel = () =>
  normalizeEntityModel(loadEntityFixture(repoRoot, 'rich-valid'));

const tracked = [];
const workspaceFixture = (opts) => {
  const workspace = makeTargetWorkspace(opts);
  tracked.push(workspace);
  return workspace;
};
after(() => tracked.forEach(cleanupWorkspace));

const provenanceOf = (workspace) =>
  JSON.parse(
    fs.readFileSync(path.join(workspace, '.pollux/workspace.json'), 'utf8')
  );

/** Plan + execute one or more models against a workspace. */
const generate = (workspace, adapter, models, opts = {}) => {
  const generatedManifest = readGeneratedManifest(workspace);
  const provenance = provenanceOf(workspace);
  const planned = models.map((model) =>
    planEntity({ workspace, adapter, model, provenance, generatedManifest })
  );
  return executePlans({
    workspace,
    adapter,
    planned,
    generatedManifest,
    ...opts,
  });
};

describe('adapter registry', () => {
  it('production registry is empty until SPEC-004..006', () => {
    assert.equal(PRODUCTION_ADAPTER_REGISTRY.size, 0);
    assert.throws(
      () => resolveAdapter('nextjs'),
      (err) => err.code === 'TARGET_UNSUPPORTED'
    );
  });

  it('resolves fixture adapters from an injected registry only', () => {
    const registry = createAdapterRegistry([makeDemoAdapter()]);
    assert.equal(resolveAdapter('demo', { registry }).id, 'demo');
    assert.throws(
      () => resolveAdapter('other', { registry }),
      (err) => err.code === 'TARGET_UNSUPPORTED'
    );
  });

  it('rejects malformed adapters and duplicate ids', () => {
    assert.throws(() => createAdapterRegistry([{ id: 'x' }]));
    assert.throws(() =>
      createAdapterRegistry([makeDemoAdapter(), makeDemoAdapter()])
    );
  });
});

describe('target resolution', () => {
  it('unsupported workspaces fail before planning with TARGET_UNSUPPORTED', () => {
    const workspace = workspaceFixture({ targetStatus: 'unsupported' });
    assert.throws(
      () => resolveTargetForWorkspace({ workspace }),
      (err) => err.code === 'TARGET_UNSUPPORTED'
    );
    // The manifest's support message wins when a lookup is provided.
    assert.throws(
      () =>
        resolveTargetForWorkspace({
          workspace,
          supportMessage: () => 'custom support message',
        }),
      (err) => err.message === 'custom support message'
    );
  });

  it('explicit and inferred targets must agree (TARGET_MISMATCH)', () => {
    const workspace = workspaceFixture();
    assert.throws(
      () => resolveTargetForWorkspace({ workspace, explicitTarget: 'other' }),
      (err) => err.code === 'TARGET_MISMATCH'
    );
    const { target } = resolveTargetForWorkspace({
      workspace,
      explicitTarget: 'demo',
    });
    assert.equal(target, 'demo');
  });

  it('a directory without provenance is not a workspace', () => {
    const dir = fs.mkdtempSync('/tmp/pollux-noprov-');
    tracked.push(dir);
    assert.throws(
      () => resolveTargetForWorkspace({ workspace: dir }),
      (err) => err.code === 'TARGET_UNSUPPORTED'
    );
  });
});

describe('plan determinism and dry-run guarantees', () => {
  it('two plans of the same model are identical: exact paths + hashes, no workspace change', () => {
    const workspace = workspaceFixture();
    const adapter = makeDemoAdapter();
    const before = hashTree(workspace);
    const provenance = provenanceOf(workspace);
    const a = planEntity({
      workspace,
      adapter,
      model: richModel(),
      provenance,
      generatedManifest: null,
    });
    const b = planEntity({
      workspace,
      adapter,
      model: richModel(),
      provenance,
      generatedManifest: null,
    });
    assert.equal(JSON.stringify(a.plan), JSON.stringify(b.plan));
    assert.equal(hashTree(workspace), before, 'plan performed a write');
    assert.deepEqual(
      a.plan.operations.map((op) => [op.action, op.path]),
      [
        ['create', 'app/generated/amostra/columns.json'],
        ['create', 'app/generated/amostra/page.tsx'],
        ['create', 'app/generated/amostra/styles.css'],
        ['create', 'app/generated/amostra/view.astro'],
      ]
    );
    for (const op of a.plan.operations) {
      assert.match(op.hash, /^[0-9a-f]{64}$/);
    }
    assert.equal(
      a.plan.operations.find((o) => o.path.endsWith('.json')).ownership,
      'manifest-only'
    );
    assert.equal(
      a.plan.operations.find((o) => o.path.endsWith('.tsx')).ownership,
      'header'
    );
  });

  for (const [label, badPath] of [
    ['path traversal', '../outside.tsx'],
    ['nested traversal', 'app/../../outside.tsx'],
    ['absolute path', '/etc/passwd'],
    ['reserved .pollux path', '.pollux/generated.json'],
  ]) {
    it(`rejects ${label} at plan time`, () => {
      const workspace = workspaceFixture();
      const adapter = makeDemoAdapter({
        planOutputs: () => [{ path: badPath, content: 'x\n' }],
      });
      assert.throws(
        () =>
          planEntity({
            workspace,
            adapter,
            model: richModel(),
            provenance: provenanceOf(workspace),
            generatedManifest: null,
          }),
        (err) => err.code === 'PLAN_INVALID'
      );
    });
  }

  it('rejects collision with a non-owned file (OWNERSHIP_CONFLICT), never replacing it', () => {
    const workspace = workspaceFixture();
    const adapter = makeDemoAdapter();
    // README.md-style hand file directly on a planned output path.
    fs.mkdirSync(path.join(workspace, 'app/generated/amostra'), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(workspace, 'app/generated/amostra/page.tsx'),
      'hand-written page\n'
    );
    const before = hashTree(workspace);
    assert.throws(
      () =>
        planEntity({
          workspace,
          adapter,
          model: richModel(),
          provenance: provenanceOf(workspace),
          generatedManifest: null,
        }),
      (err) =>
        err.code === 'OWNERSHIP_CONFLICT' &&
        err.details.conflicts[0].path === 'app/generated/amostra/page.tsx'
    );
    assert.equal(hashTree(workspace), before);
    assert.equal(
      fs.readFileSync(
        path.join(workspace, 'app/generated/amostra/page.tsx'),
        'utf8'
      ),
      'hand-written page\n'
    );
  });

  it('rejects incompatible provenance model version (PLAN_INVALID)', () => {
    const workspace = workspaceFixture({ metadataModelVersion: '0' });
    assert.throws(
      () =>
        planEntity({
          workspace,
          adapter: makeDemoAdapter(),
          model: richModel(),
          provenance: provenanceOf(workspace),
          generatedManifest: null,
        }),
      (err) =>
        err.code === 'PLAN_INVALID' &&
        err.details.problems.some((p) => p.includes('metadata model version'))
    );
  });

  it('rejects a missing framework capability (PLAN_INVALID)', () => {
    const workspace = workspaceFixture();
    const raw = loadEntityFixture(repoRoot, 'rich-valid');
    raw.data.gridButtonReport = true; // entity needs 'export'
    const model = normalizeEntityModel(raw);
    assert.throws(
      () =>
        planEntity({
          workspace,
          adapter: makeDemoAdapter({ capabilities: [] }),
          model,
          provenance: provenanceOf(workspace),
          generatedManifest: null,
        }),
      (err) =>
        err.code === 'PLAN_INVALID' &&
        err.details.problems.some((p) => p.includes("capability 'export'"))
    );
  });
});

describe('generation pipeline', () => {
  it('generates, stamps ownership and records .pollux/generated.json', () => {
    const workspace = workspaceFixture();
    const adapter = makeDemoAdapter();
    const result = generate(workspace, adapter, [richModel()]);
    assert.deepEqual(result.entities, [
      { entity: 'amostra', created: 4, replaced: 0, preserved: 0, removed: 0 },
    ]);
    const page = fs.readFileSync(
      path.join(workspace, 'app/generated/amostra/page.tsx'),
      'utf8'
    );
    assert.ok(hasOwnershipHeader(page));
    const astro = fs.readFileSync(
      path.join(workspace, 'app/generated/amostra/view.astro'),
      'utf8'
    );
    assert.ok(astro.startsWith('---\n// @pollux-generated '));
    const manifest = readGeneratedManifest(workspace);
    assert.equal(manifest.target, 'demo');
    assert.equal(manifest.modelVersion, '1');
    assert.equal(manifest.entities.amostra.ownedPaths.length, 4);
    assert.deepEqual(listPendingTransactions(workspace), []);
    assert.equal(checkGeneratedState(workspace).clean, true);

    // Second run: everything byte-identical -> preserved, nothing replaced.
    const again = generate(workspace, adapter, [richModel()]);
    assert.deepEqual(again.entities, [
      { entity: 'amostra', created: 0, replaced: 0, preserved: 4, removed: 0 },
    ]);
  });

  it('hand-edited owned files: GENERATED_EDITED without the flag, replaced with it', () => {
    const workspace = workspaceFixture();
    const adapter = makeDemoAdapter();
    generate(workspace, adapter, [richModel()]);
    const pagePath = path.join(workspace, 'app/generated/amostra/page.tsx');
    fs.writeFileSync(pagePath, 'my manual change\n');
    const before = hashTree(workspace);
    assert.throws(
      () => generate(workspace, adapter, [richModel()]),
      (err) =>
        err.code === 'GENERATED_EDITED' &&
        err.details.edited[0].path === 'app/generated/amostra/page.tsx'
    );
    assert.equal(hashTree(workspace), before, 'refusal must not write');
    // check-generated sees the edit too.
    assert.equal(checkGeneratedState(workspace).edited.length, 1);
    // Accepting the overwrite replaces ONLY the recorded generated file.
    const result = generate(workspace, adapter, [richModel()], {
      acceptGeneratedOverwrite: true,
    });
    assert.equal(result.entities[0].replaced, 1);
    assert.equal(result.entities[0].preserved, 3);
    assert.ok(hasOwnershipHeader(fs.readFileSync(pagePath, 'utf8')));
    assert.equal(checkGeneratedState(workspace).clean, true);
  });

  it('owned files no longer planned are removed; hand files never touched', () => {
    const workspace = workspaceFixture();
    const adapter = makeDemoAdapter();
    generate(workspace, adapter, [richModel()]);
    const handHash = hashTree(workspace)
      .split('\n')
      .filter((l) => l.startsWith('README.md') || l.startsWith('package.json'))
      .join('\n');
    // Regenerate with a shrunken plan: css file dropped.
    const shrunk = makeDemoAdapter({
      planOutputs: (model) => [
        {
          path: `app/generated/${model.entity.id}/page.tsx`,
          content: 'export const page = 1;\n',
        },
      ],
    });
    const result = generate(workspace, shrunk, [richModel()]);
    assert.equal(result.entities[0].removed, 3);
    assert.ok(
      !fs.existsSync(path.join(workspace, 'app/generated/amostra/styles.css'))
    );
    const manifest = readGeneratedManifest(workspace);
    assert.deepEqual(manifest.entities.amostra.ownedPaths, [
      'app/generated/amostra/page.tsx',
    ]);
    assert.equal(
      hashTree(workspace)
        .split('\n')
        .filter(
          (l) => l.startsWith('README.md') || l.startsWith('package.json')
        )
        .join('\n'),
      handHash
    );
  });

  for (const stage of ['render', 'format', 'verify']) {
    it(`${stage} failure leaves the workspace byte-identical`, () => {
      const workspace = workspaceFixture();
      generate(workspace, makeDemoAdapter(), [richModel()]);
      const before = hashTree(workspace);
      const failing = makeDemoAdapter({
        planOutputs: (model) => [
          {
            path: `app/generated/${model.entity.id}/page.tsx`,
            content: 'changed body\n',
          },
        ],
        failWith: { [stage]: new Error(`${stage} exploded`) },
      });
      assert.throws(
        () => generate(workspace, failing, [richModel()]),
        /exploded|failed/
      );
      assert.equal(hashTree(workspace), before);
      assert.deepEqual(listPendingTransactions(workspace), []);
    });
  }

  it('publication failure is rolled back from the journal automatically', () => {
    const workspace = workspaceFixture();
    generate(workspace, makeDemoAdapter(), [richModel()]);
    const before = hashTree(workspace);
    const changed = makeDemoAdapter({
      planOutputs: (model) => [
        {
          path: `app/generated/${model.entity.id}/page.tsx`,
          content: 'new body\n',
        },
      ],
    });
    let n = 0;
    assert.throws(
      () =>
        generate(workspace, changed, [richModel()], {
          transactionHooks: {
            beforeOperation: () => {
              if (n === 1) throw new Error('disk full');
              n += 1;
            },
          },
        }),
      /disk full/
    );
    assert.equal(hashTree(workspace), before);
    assert.deepEqual(listPendingTransactions(workspace), []);
  });

  it('bulk generation is all-or-nothing at the planning boundary', () => {
    const workspace = workspaceFixture();
    const adapter = makeDemoAdapter();
    const before = hashTree(workspace);
    const provenance = provenanceOf(workspace);
    const good = richModel();
    // Second entity fails planning (traversal). Plan both first, publish none.
    const badAdapter = makeDemoAdapter({
      planOutputs: () => [{ path: '../escape.tsx', content: 'x\n' }],
    });
    const failures = [];
    const planned = [];
    for (const [model, useAdapter] of [
      [good, adapter],
      [good, badAdapter],
    ]) {
      try {
        planned.push(
          planEntity({
            workspace,
            adapter: useAdapter,
            model,
            provenance,
            generatedManifest: null,
          })
        );
      } catch (err) {
        failures.push({ code: err.code });
      }
    }
    assert.equal(failures.length, 1);
    // Planning failed for one entity -> caller aborts before ANY write.
    assert.equal(hashTree(workspace), before);
  });

  it('two entities publish through one transaction', () => {
    const workspace = workspaceFixture();
    const adapter = makeDemoAdapter();
    const raw = loadEntityFixture(repoRoot, 'rich-valid');
    raw.data.name = 'outra';
    raw.data.dbName = 'outra';
    const result = generate(workspace, adapter, [
      richModel(),
      normalizeEntityModel(raw),
    ]);
    assert.equal(result.entities.length, 2);
    const manifest = readGeneratedManifest(workspace);
    assert.deepEqual(Object.keys(manifest.entities), ['amostra', 'outra']);
  });
});

describe('pending-journal guard', () => {
  it('assertNoPendingTransactions raises TRANSACTION_INCOMPLETE', () => {
    const workspace = workspaceFixture();
    assert.doesNotThrow(() => assertNoPendingTransactions(workspace));
    fs.mkdirSync(path.join(workspace, '.pollux/transactions/t1'), {
      recursive: true,
    });
    assert.throws(
      () => assertNoPendingTransactions(workspace),
      (err) => err.code === 'TRANSACTION_INCOMPLETE'
    );
  });
});
