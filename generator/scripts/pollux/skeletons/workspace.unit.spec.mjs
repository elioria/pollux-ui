// SPEC-001 — staged atomic workspace creation. Covers destination
// classification, pre-write rejection, fault-injected rollback, provenance,
// lockfile policy and digest determinism.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';

import { ERROR_CODES } from './errors.mjs';
import { cleanupFixture, makeFixtureRepo } from './fixtures.mjs';
import { createWorkspace } from './workspace.mjs';

const cleanups = [];
const repo = (opts) => {
  const f = makeFixtureRepo(opts);
  cleanups.push(f.repoRoot);
  return f;
};
const tmp = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'pollux-ws-'));
  cleanups.push(d);
  return d;
};
after(() => cleanups.forEach(cleanupFixture));

const create = (f, dir, extra = {}) =>
  createWorkspace({
    repoRoot: f.repoRoot,
    skeleton: 'demo',
    dir,
    cliVersion: 'test',
    ...extra,
  });

const codeOf = (fn) => {
  try {
    fn();
  } catch (err) {
    return err.code;
  }
  return null;
};

const noStagingLeftovers = (parent) => {
  const leftovers = fs
    .readdirSync(parent)
    .filter(
      (n) => n.startsWith('.pollux-staging') || n.startsWith('.pollux-backup')
    );
  assert.deepEqual(leftovers, [], 'staging/backup directories left behind');
};

// ------------------------------------------------------------------ success

test('creates a workspace with provenance, lockfile and no artifacts', () => {
  const f = repo();
  const dest = path.join(tmp(), 'my-app');
  const result = create(f, dest);

  assert.equal(result.workspace, dest);
  assert.equal(result.package, 'my-app');
  assert.ok(fs.existsSync(path.join(dest, 'app/layout.tsx')));
  assert.ok(
    fs.existsSync(path.join(dest, 'pnpm-lock.yaml')),
    'lockfile copied'
  );
  assert.ok(
    !fs.existsSync(path.join(dest, 'skeleton.json')),
    'manifest stays behind'
  );
  assert.ok(!fs.existsSync(path.join(dest, 'node_modules')), 'no node_modules');
  assert.ok(!fs.existsSync(path.join(dest, '.next')), 'no build artifacts');
  assert.ok(!fs.existsSync(path.join(dest, '.git')), 'no VCS artifacts');

  const pkg = JSON.parse(
    fs.readFileSync(path.join(dest, 'package.json'), 'utf8')
  );
  assert.equal(pkg.name, 'my-app');

  const prov = JSON.parse(
    fs.readFileSync(path.join(dest, '.pollux/workspace.json'), 'utf8')
  );
  assert.equal(prov.schemaVersion, 1);
  assert.equal(prov.skeleton, 'demo');
  assert.equal(prov.framework, 'demo-framework');
  assert.equal(prov.manifestVersion, '1.0.0');
  assert.equal(prov.cliVersion, 'test');
  assert.equal(prov.metadataModelVersion, '1');
  assert.match(prov.digest, /^sha256:[0-9a-f]{64}$/);
  assert.equal(prov.targetStatus, 'unsupported');
  assert.deepEqual(prov.targetAdapter, { id: null, version: null });
  assert.ok(
    typeof prov.createdAt === 'string' &&
      !Number.isNaN(Date.parse(prov.createdAt))
  );
  // No dependency on / leak of the source checkout location.
  assert.ok(
    !JSON.stringify(prov).includes(f.repoRoot),
    'provenance must not contain absolute source paths'
  );
  assert.equal(prov.sourcePath, 'skeletons/demo');

  noStagingLeftovers(path.dirname(dest));
});

test('accepts an existing empty directory destination', () => {
  const f = repo();
  const dest = path.join(tmp(), 'empty-dir');
  fs.mkdirSync(dest);
  const result = create(f, dest);
  assert.equal(result.package, 'empty-dir');
  assert.ok(fs.existsSync(path.join(dest, 'package.json')));
  noStagingLeftovers(path.dirname(dest));
});

test('steps records are executable {cwd, command, args} and next is kept', () => {
  const f = repo();
  const dest = path.join(tmp(), 'dir with spaces', 'my app dir');
  const result = create(f, dest, { name: 'spaced-app' });
  assert.deepEqual(result.steps[0], {
    cwd: dest,
    command: 'pnpm',
    args: ['install', '--frozen-lockfile'],
  });
  assert.deepEqual(result.steps[1], {
    cwd: dest,
    command: 'pnpm',
    args: ['dev'],
  });
  assert.equal(result.next[0], `cd ${dest}`);
  assert.equal(result.next[1], 'pnpm install --frozen-lockfile');
  assert.equal(result.next[2], 'pnpm dev');
});

// ------------------------------------------------------------------ failures

test('invalid npm package name is rejected before any filesystem write', () => {
  const f = repo();
  const parent = tmp();
  const dest = path.join(parent, 'target');
  assert.equal(
    codeOf(() => create(f, dest, { name: 'INVALID NAME' })),
    ERROR_CODES.PACKAGE_NAME_INVALID
  );
  assert.ok(!fs.existsSync(dest), 'destination must not be created');
  noStagingLeftovers(parent);
});

test('file destination is DESTINATION_NOT_DIRECTORY', () => {
  const f = repo();
  const parent = tmp();
  const dest = path.join(parent, 'a-file');
  fs.writeFileSync(dest, 'not a dir\n');
  assert.equal(
    codeOf(() => create(f, dest)),
    ERROR_CODES.DESTINATION_NOT_DIRECTORY
  );
  assert.equal(fs.readFileSync(dest, 'utf8'), 'not a dir\n');
  noStagingLeftovers(parent);
});

test('non-empty destination is DESTINATION_NOT_EMPTY', () => {
  const f = repo();
  const parent = tmp();
  const dest = path.join(parent, 'occupied');
  fs.mkdirSync(dest);
  fs.writeFileSync(path.join(dest, 'keep.txt'), 'keep\n');
  assert.equal(
    codeOf(() => create(f, dest)),
    ERROR_CODES.DESTINATION_NOT_EMPTY
  );
  assert.equal(fs.readFileSync(path.join(dest, 'keep.txt'), 'utf8'), 'keep\n');
  noStagingLeftovers(parent);
});

test('unknown skeleton is SKELETON_UNKNOWN', () => {
  const f = repo();
  assert.equal(
    codeOf(() =>
      createWorkspace({ repoRoot: f.repoRoot, skeleton: 'nope', dir: tmp() })
    ),
    ERROR_CODES.SKELETON_UNKNOWN
  );
});

test('reference skeleton is SKELETON_NOT_COPYABLE', () => {
  const f = repo({
    registry: (r) => (r.skeletons[0].status = 'reference'),
    manifest: (m) => {
      m.status = 'reference';
      m.referenceRoot = '.';
    },
  });
  assert.equal(
    codeOf(() => create(f, path.join(tmp(), 'x'))),
    ERROR_CODES.SKELETON_NOT_COPYABLE
  );
});

test('invalid skeleton fails as MANIFEST_INVALID before writing', () => {
  const f = repo({ manifest: (m) => delete m.commands.build });
  const parent = tmp();
  const dest = path.join(parent, 'x');
  assert.equal(
    codeOf(() => create(f, dest)),
    ERROR_CODES.MANIFEST_INVALID
  );
  assert.ok(!fs.existsSync(dest));
});

test('source symlink escaping the skeleton is COPY_FAILED, destination untouched', () => {
  const f = repo();
  const outside = path.join(f.repoRoot, 'secret.txt');
  fs.writeFileSync(outside, 'secret\n');
  fs.symlinkSync(outside, path.join(f.skeletonDir, 'leak.txt'));
  const parent = tmp();
  const dest = path.join(parent, 'x');
  assert.equal(
    codeOf(() => create(f, dest)),
    ERROR_CODES.COPY_FAILED
  );
  assert.ok(!fs.existsSync(dest));
  noStagingLeftovers(parent);
});

test('injected copy failure leaves destination unchanged and no staging', () => {
  const f = repo();
  const parent = tmp();
  const dest = path.join(parent, 'x');
  assert.equal(
    codeOf(() =>
      create(f, dest, {
        hooks: {
          onCopyEntry: (e) => {
            if (e.rel === path.join('app', 'page.tsx'))
              throw new Error('disk full (injected)');
          },
        },
      })
    ),
    ERROR_CODES.COPY_FAILED
  );
  assert.ok(!fs.existsSync(dest), 'absent destination stays absent');
  noStagingLeftovers(parent);
});

test('injected post-copy failure rolls back, restoring an empty destination', () => {
  const f = repo();
  const parent = tmp();
  const dest = path.join(parent, 'pre-existing');
  fs.mkdirSync(dest);
  assert.equal(
    codeOf(() =>
      create(f, dest, {
        hooks: {
          afterStage: () => {
            throw new Error('injected post-copy failure');
          },
        },
      })
    ),
    ERROR_CODES.POST_COPY_VALIDATION_FAILED
  );
  assert.ok(fs.existsSync(dest), 'empty destination restored');
  assert.deepEqual(fs.readdirSync(dest), [], 'destination still empty');
  noStagingLeftovers(parent);
});

test('missing lockfile in skeleton fails staged validation, no partial output', () => {
  const f = repo({ lockfile: false });
  const parent = tmp();
  const dest = path.join(parent, 'x');
  assert.equal(
    codeOf(() => create(f, dest)),
    ERROR_CODES.POST_COPY_VALIDATION_FAILED
  );
  assert.ok(!fs.existsSync(dest));
  noStagingLeftovers(parent);
});

// -------------------------------------------------------------- determinism

test('same revision: two creations differ only in nondeterministic fields', () => {
  const f = repo({ git: true });
  const d1 = path.join(tmp(), 'app');
  const d2 = path.join(tmp(), 'app');
  const r1 = create(f, d1, { name: 'same-app' });
  const r2 = create(f, d2, { name: 'same-app' });
  assert.equal(r1.provenance.dirty, false, 'clean git tree is not dirty');
  assert.equal(r1.provenance.digest, r2.provenance.digest);
  assert.equal(r1.provenance.sourceRevision, r2.provenance.sourceRevision);
  const strip = (p) => {
    const { createdAt, ...rest } = p;
    return rest;
  };
  assert.deepEqual(strip(r1.provenance), strip(r2.provenance));
});

test('dirty source content flips the dirty flag and changes the digest', () => {
  const f = repo({ git: true });
  const r1 = create(f, path.join(tmp(), 'app'));
  fs.appendFileSync(
    path.join(f.skeletonDir, 'app/layout.tsx'),
    '// local edit\n'
  );
  const r2 = create(f, path.join(tmp(), 'app'));
  assert.equal(r1.provenance.dirty, false);
  assert.equal(r2.provenance.dirty, true);
  assert.notEqual(r1.provenance.digest, r2.provenance.digest);
});
