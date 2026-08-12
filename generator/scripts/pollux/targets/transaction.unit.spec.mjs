// SPEC-002 — transaction journal: failure injection per operation,
// interruption before/after the commit-record rename, and startup recovery.
// Run with: node --test scripts/pollux/targets/*.unit.spec.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, describe, it } from 'node:test';

import {
  cleanupWorkspace,
  hashTree,
  makeTargetWorkspace,
} from './fixtures.mjs';
import { GENERATED_MANIFEST_PATH, sha256 } from './ownership.mjs';
import {
  beginTransaction,
  commitTransaction,
  listPendingTransactions,
  recoverWorkspace,
  rollbackTransaction,
  TRANSACTIONS_DIR,
} from './transaction.mjs';

const tracked = [];
const workspaceFixture = () => {
  const workspace = makeTargetWorkspace();
  tracked.push(workspace);
  // Pre-existing generated state: one owned file to replace, one to remove.
  fs.mkdirSync(path.join(workspace, 'app/generated/ent'), { recursive: true });
  fs.writeFileSync(
    path.join(workspace, 'app/generated/ent/old.tsx'),
    'old replaceable\n'
  );
  fs.writeFileSync(
    path.join(workspace, 'app/generated/ent/dead.tsx'),
    'to be removed\n'
  );
  fs.writeFileSync(
    path.join(workspace, GENERATED_MANIFEST_PATH),
    '{"target":"demo","generatorVersion":"1","modelVersion":"1","entities":{}}\n'
  );
  return workspace;
};
after(() => tracked.forEach(cleanupWorkspace));

const OPS = [
  { op: 'create', path: 'app/generated/ent/new.tsx', content: 'new file\n' },
  {
    op: 'replace',
    path: 'app/generated/ent/old.tsx',
    content: 'replaced content\n',
  },
  { op: 'remove', path: 'app/generated/ent/dead.tsx' },
];
const COMMIT = {
  content:
    '{"target":"demo","generatorVersion":"1","modelVersion":"1","entities":{"ent":{"ownedPaths":[],"hashes":{}}}}\n',
};

const begin = (workspace) =>
  beginTransaction({ workspace, operations: OPS, commitRecord: COMMIT });

const readWs = (workspace, rel) =>
  fs.readFileSync(path.join(workspace, rel), 'utf8');

describe('journal creation', () => {
  it('records ops, backups and staged payloads BEFORE any workspace change', () => {
    const workspace = workspaceFixture();
    const before = hashTree(workspace);
    const txn = begin(workspace);
    // Workspace outside .pollux/transactions is untouched.
    const afterBegin = hashTree(workspace)
      .split('\n')
      .filter((l) => !l.startsWith(`${TRANSACTIONS_DIR}/`))
      .join('\n');
    assert.equal(afterBegin, before);
    // Journal carries every op with backup/staged where required.
    assert.equal(txn.journal.operations.length, 3);
    const byPath = Object.fromEntries(
      txn.journal.operations.map((o) => [o.path, o])
    );
    assert.equal(byPath['app/generated/ent/new.tsx'].backup, null);
    assert.ok(byPath['app/generated/ent/old.tsx'].backup);
    assert.ok(byPath['app/generated/ent/dead.tsx'].backup);
    assert.equal(byPath['app/generated/ent/dead.tsx'].staged, null);
    assert.equal(
      fs.readFileSync(
        path.join(txn.dir, byPath['app/generated/ent/old.tsx'].backup),
        'utf8'
      ),
      'old replaceable\n'
    );
    assert.equal(txn.journal.commit.path, GENERATED_MANIFEST_PATH);
    assert.equal(txn.journal.commit.hash, sha256(Buffer.from(COMMIT.content)));
    rollbackTransaction(txn);
    assert.equal(hashTree(workspace), before);
  });
});

describe('commit and rollback', () => {
  it('publishes all ops then the commit record; journal removable', () => {
    const workspace = workspaceFixture();
    const txn = begin(workspace);
    commitTransaction(txn);
    assert.equal(readWs(workspace, 'app/generated/ent/new.tsx'), 'new file\n');
    assert.equal(
      readWs(workspace, 'app/generated/ent/old.tsx'),
      'replaced content\n'
    );
    assert.ok(
      !fs.existsSync(path.join(workspace, 'app/generated/ent/dead.tsx'))
    );
    assert.equal(readWs(workspace, GENERATED_MANIFEST_PATH), COMMIT.content);
    // Committed journal removed only after paths+hashes match — they do.
    const { recovered } = recoverWorkspace(workspace);
    assert.deepEqual(recovered, [{ id: txn.id, action: 'removed' }]);
    assert.deepEqual(listPendingTransactions(workspace), []);
  });

  for (const failAt of [0, 1, 2]) {
    it(`failure injected at operation ${failAt} rolls back byte-identically`, () => {
      const workspace = workspaceFixture();
      const before = hashTree(workspace);
      const txn = begin(workspace);
      let n = 0;
      assert.throws(
        () =>
          commitTransaction(txn, {
            beforeOperation: () => {
              if (n === failAt) throw new Error(`boom at op ${failAt}`);
              n += 1;
            },
          }),
        /boom at op/
      );
      assert.equal(hashTree(workspace), before);
      assert.deepEqual(listPendingTransactions(workspace), []);
    });
  }

  it('failure before the commit-record rename rolls back', () => {
    const workspace = workspaceFixture();
    const before = hashTree(workspace);
    const txn = begin(workspace);
    assert.throws(
      () =>
        commitTransaction(txn, {
          beforeCommitRecord: () => {
            throw new Error('pre-commit boom');
          },
        }),
      /pre-commit boom/
    );
    assert.equal(hashTree(workspace), before);
  });
});

describe('interruption + startup recovery', () => {
  it('crash BEFORE the commit-record rename: next command rolls back', () => {
    const workspace = workspaceFixture();
    const before = hashTree(workspace);
    const txn = begin(workspace);
    // Simulated process kill: no in-process rollback happens.
    assert.throws(
      () =>
        commitTransaction(txn, {
          crashInsteadOfRollback: true,
          beforeCommitRecord: () => {
            throw new Error('killed');
          },
        }),
      /killed/
    );
    // Workspace is dirty and the journal is pending.
    assert.notEqual(
      hashTree(workspace)
        .split('\n')
        .filter((l) => !l.startsWith(`${TRANSACTIONS_DIR}/`))
        .join('\n'),
      before
    );
    assert.deepEqual(listPendingTransactions(workspace), [txn.id]);
    // Next mutating command recovers: uncommitted -> rollback.
    const { recovered } = recoverWorkspace(workspace);
    assert.deepEqual(recovered, [{ id: txn.id, action: 'rolled-back' }]);
    assert.equal(hashTree(workspace), before);
  });

  it('crash mid-operations: next command rolls back byte-identically', () => {
    const workspace = workspaceFixture();
    const before = hashTree(workspace);
    const txn = begin(workspace);
    let n = 0;
    assert.throws(
      () =>
        commitTransaction(txn, {
          crashInsteadOfRollback: true,
          beforeOperation: () => {
            if (n === 2) throw new Error('killed mid-publish');
            n += 1;
          },
        }),
      /killed mid-publish/
    );
    const { recovered } = recoverWorkspace(workspace);
    assert.deepEqual(recovered, [{ id: txn.id, action: 'rolled-back' }]);
    assert.equal(hashTree(workspace), before);
  });

  it('crash AFTER the commit-record rename: committed, journal removed after verification', () => {
    const workspace = workspaceFixture();
    const txn = begin(workspace);
    assert.throws(
      () =>
        commitTransaction(txn, {
          crashInsteadOfRollback: true,
          afterCommitRecord: () => {
            throw new Error('killed post-commit');
          },
        }),
      /killed post-commit/
    );
    // Commit record is live: the transaction is committed.
    assert.equal(readWs(workspace, GENERATED_MANIFEST_PATH), COMMIT.content);
    const committed = hashTree(workspace)
      .split('\n')
      .filter((l) => !l.startsWith(`${TRANSACTIONS_DIR}/`))
      .join('\n');
    const { recovered } = recoverWorkspace(workspace);
    assert.deepEqual(recovered, [{ id: txn.id, action: 'removed' }]);
    assert.equal(hashTree(workspace), committed);
    assert.equal(
      readWs(workspace, 'app/generated/ent/old.tsx'),
      'replaced content\n'
    );
  });

  it('committed journal with mismatching file is completed (roll-forward), then removed', () => {
    const workspace = workspaceFixture();
    const txn = begin(workspace);
    commitTransaction(txn);
    // Tamper with a published file before recovery runs.
    fs.writeFileSync(
      path.join(workspace, 'app/generated/ent/new.tsx'),
      'tampered\n'
    );
    const { recovered } = recoverWorkspace(workspace);
    assert.deepEqual(recovered, [{ id: txn.id, action: 'completed' }]);
    assert.equal(readWs(workspace, 'app/generated/ent/new.tsx'), 'new file\n');
    assert.deepEqual(listPendingTransactions(workspace), []);
  });

  it('journal directory without journal.json is dropped harmlessly', () => {
    const workspace = workspaceFixture();
    const before = hashTree(workspace);
    fs.mkdirSync(path.join(workspace, TRANSACTIONS_DIR, 'zz-empty'), {
      recursive: true,
    });
    const { recovered } = recoverWorkspace(workspace);
    assert.deepEqual(recovered, [{ id: 'zz-empty', action: 'removed' }]);
    assert.equal(hashTree(workspace), before);
  });
});
