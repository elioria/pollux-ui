// SPEC-002 — CLI contract for plan / generate / check-generated: JSON
// failure envelope { ok:false, code, message, details? }, identical exit
// semantics, target inference, and the full pipeline through the test-only
// demo adapter (injected via POLLUX_TEST_ADAPTERS — never registered in the
// production registry).
// Run with: node --test scripts/pollux/targets/*.unit.spec.mjs
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { pathToFileURL } from 'node:url';

import {
  cleanupWorkspace,
  hashTree,
  makeTargetWorkspace,
} from './fixtures.mjs';

const repoRoot = path.resolve(
  new URL('.', import.meta.url).pathname,
  '../../..'
);

// Test-only adapter injection module (imports the fixture demo adapter).
const adapterModuleFile = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), 'pollux-adapters-')),
  'adapters.mjs'
);
fs.writeFileSync(
  adapterModuleFile,
  `import { makeDemoAdapter } from '${pathToFileURL(path.join(repoRoot, 'scripts/pollux/targets/fixtures.mjs')).href}';\nexport const adapters = [makeDemoAdapter()];\n`
);

const tracked = [path.dirname(adapterModuleFile)];
after(() => tracked.forEach(cleanupWorkspace));
const workspaceFixture = (opts) => {
  const workspace = makeTargetWorkspace(opts);
  tracked.push(workspace);
  return workspace;
};

const FIXTURE_DIR = 'test-fixtures/pollux/entities';

const pollux = (cliArgs, { adapters = true } = {}) => {
  const result = spawnSync(
    'node',
    ['scripts/pollux/cli.mjs', ...cliArgs, '--json'],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        ...(adapters ? { POLLUX_TEST_ADAPTERS: adapterModuleFile } : {}),
      },
    }
  );
  let parsed = null;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    // leave null; assertions will surface stdout
  }
  return { ...result, parsed };
};

describe('plan command', () => {
  it('fresh unsupported workspace: clean TARGET_UNSUPPORTED envelope, no writes', () => {
    const workspace = workspaceFixture({ targetStatus: 'unsupported' });
    const before = hashTree(workspace);
    const r = pollux(
      ['plan', `--workspace=${workspace}`, '--entity=rich-valid'],
      { adapters: false }
    );
    assert.equal(r.status, 1);
    assert.equal(r.parsed?.ok, false, r.stdout);
    assert.equal(r.parsed.code, 'TARGET_UNSUPPORTED');
    assert.equal(typeof r.parsed.message, 'string');
    assert.ok(!('stack' in r.parsed));
    assert.equal(hashTree(workspace), before);
  });

  it('explicit target must agree with the recorded target', () => {
    const workspace = workspaceFixture();
    const r = pollux([
      'plan',
      '--target=other',
      `--workspace=${workspace}`,
      '--entity=rich-valid',
      `--metadata-dir=${FIXTURE_DIR}`,
    ]);
    assert.equal(r.status, 1);
    assert.equal(r.parsed.code, 'TARGET_MISMATCH');
  });

  it('dry-run plan lists exact paths and hashes without touching the workspace', () => {
    const workspace = workspaceFixture();
    const before = hashTree(workspace);
    const r = pollux([
      'plan',
      `--workspace=${workspace}`,
      '--entity=rich-valid',
      `--metadata-dir=${FIXTURE_DIR}`,
    ]);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.equal(r.parsed.ok, true);
    assert.equal(r.parsed.plan.entity, 'amostra');
    assert.equal(r.parsed.plan.target, 'demo');
    assert.deepEqual(
      r.parsed.plan.operations.map((op) => op.action),
      ['create', 'create', 'create', 'create']
    );
    for (const op of r.parsed.plan.operations) {
      assert.match(op.hash, /^[0-9a-f]{64}$/);
    }
    assert.equal(hashTree(workspace), before);
  });

  it('unknown entity fails with PLAN_INVALID', () => {
    const workspace = workspaceFixture();
    const r = pollux([
      'plan',
      `--workspace=${workspace}`,
      '--entity=nope',
      `--metadata-dir=${FIXTURE_DIR}`,
    ]);
    assert.equal(r.status, 1);
    assert.equal(r.parsed.code, 'PLAN_INVALID');
  });
});

describe('generate command', () => {
  it('generates one entity, then check-generated reports clean', () => {
    const workspace = workspaceFixture();
    const r = pollux([
      'generate',
      `--workspace=${workspace}`,
      '--entity=rich-valid',
      `--metadata-dir=${FIXTURE_DIR}`,
    ]);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.deepEqual(r.parsed.entities, [
      { entity: 'amostra', created: 4, replaced: 0, preserved: 0, removed: 0 },
    ]);
    assert.ok(
      fs.existsSync(path.join(workspace, 'app/generated/amostra/page.tsx'))
    );
    assert.ok(fs.existsSync(path.join(workspace, '.pollux/generated.json')));

    const check = pollux(['check-generated', `--workspace=${workspace}`]);
    assert.equal(check.status, 0, check.stdout);
    assert.equal(check.parsed.ok, true);
    assert.deepEqual(check.parsed.entities, ['amostra']);

    // Hand-edit an owned file: check fails, generate refuses, flag accepts.
    const owned = path.join(workspace, 'app/generated/amostra/styles.css');
    fs.writeFileSync(owned, '/* mine */\n');
    const dirty = pollux(['check-generated', `--workspace=${workspace}`]);
    assert.equal(dirty.status, 1);
    assert.equal(dirty.parsed.ok, false);
    assert.equal(dirty.parsed.edited.length, 1);

    const refused = pollux([
      'generate',
      `--workspace=${workspace}`,
      '--entity=rich-valid',
      `--metadata-dir=${FIXTURE_DIR}`,
    ]);
    assert.equal(refused.status, 1);
    assert.equal(refused.parsed.code, 'GENERATED_EDITED');

    const accepted = pollux([
      'generate',
      `--workspace=${workspace}`,
      '--entity=rich-valid',
      `--metadata-dir=${FIXTURE_DIR}`,
      '--accept-generated-overwrite',
    ]);
    assert.equal(accepted.status, 0, accepted.stdout);
    assert.equal(accepted.parsed.entities[0].replaced, 1);
    const clean = pollux(['check-generated', `--workspace=${workspace}`]);
    assert.equal(clean.status, 0);
  });

  it('generate --all is all-or-nothing and reports every invalid entity', () => {
    const workspace = workspaceFixture();
    const before = hashTree(workspace);
    // The fixture dir mixes rich-valid with intentionally broken entities.
    const r = pollux([
      'generate',
      `--workspace=${workspace}`,
      '--all',
      `--metadata-dir=${FIXTURE_DIR}`,
    ]);
    assert.equal(r.status, 1);
    assert.equal(r.parsed.code, 'PLAN_INVALID');
    const failed = r.parsed.details.failures.map((f) => f.entity).sort();
    assert.deepEqual(failed, [
      'ambiguous-mutability',
      'duplicate-field',
      'invalid-bounds',
      'missing-key',
      'unsafe-identifier',
      'unsupported-type',
    ]);
    // Aborted before ANY write.
    assert.equal(hashTree(workspace), before);
  });

  it('unsupported workspace fails before planning', () => {
    const workspace = workspaceFixture({ targetStatus: 'unsupported' });
    const r = pollux([
      'generate',
      `--workspace=${workspace}`,
      '--entity=rich-valid',
      `--metadata-dir=${FIXTURE_DIR}`,
    ]);
    assert.equal(r.status, 1);
    assert.equal(r.parsed.code, 'TARGET_UNSUPPORTED');
  });
});

describe('existing command dispatch stays intact', () => {
  it('help lists the new commands alongside the old ones', () => {
    const r = pollux(['help'], { adapters: false });
    assert.equal(r.status, 0);
    const names = Object.keys(r.parsed.commands).join('\n');
    for (const cmd of [
      'plan',
      'generate',
      'check-generated',
      'gen-entity',
      'gen-all',
      'gen-backend',
      'check',
      'new-workspace',
    ]) {
      assert.ok(names.includes(cmd), `help is missing ${cmd}`);
    }
  });

  it('list-entities still answers', () => {
    const r = pollux(['list-entities'], { adapters: false });
    assert.equal(r.status, 0);
    assert.equal(r.parsed.ok, true);
    assert.ok(r.parsed.count > 0);
  });
});
