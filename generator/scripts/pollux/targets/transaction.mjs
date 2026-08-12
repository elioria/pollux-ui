// SPEC-002 — durable publication journal under `.pollux/transactions/<id>/`.
//
// Contract:
// - before the FIRST workspace change, the journal records every
//   create/replace/remove operation, backs up replaced/removed files and
//   stages every new payload (so both rollback and roll-forward are possible);
// - each file is published through a same-directory temporary file and an
//   atomic rename; removals unlink the target;
// - `.pollux/generated.json` is the commit record and is renamed last —
//   a transaction is committed iff the live commit record's hash equals the
//   journalled commit hash;
// - on any error, operations are reversed from the journal (backups restored,
//   created files and directories removed);
// - on startup, every mutating command calls `recoverWorkspace` which rolls
//   back uncommitted journals and completes committed ones; a committed
//   journal is removed only after every path+hash matches the commit record.
//
// Pure module: returns values or throws SkeletonError; never exits or prints.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { ERROR_CODES, SkeletonError } from './errors.mjs';
import { GENERATED_MANIFEST_PATH, sha256 } from './ownership.mjs';

/** Workspace-relative journal root. */
export const TRANSACTIONS_DIR = '.pollux/transactions';

const JOURNAL_FILE = 'journal.json';

/** Locale-free UTF-16 code-unit comparison. */
const byCodeUnit = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

const isWithin = (parent, child) => {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
};

/** Sortable, unique transaction id (time-prefixed). */
const newTransactionId = (now) =>
  `${now()
    .toISOString()
    .replace(/[-:.TZ]/g, '')}-${crypto.randomBytes(4).toString('hex')}`;

/** Durable write: write + fsync the file, best-effort fsync of its dir. */
function writeDurable(file, content) {
  const fd = fs.openSync(file, 'w');
  try {
    fs.writeFileSync(fd, content);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

/** Ancestor directories of relPath (relative to workspace) that are absent. */
function absentAncestors(workspace, relPath) {
  const absent = [];
  let dir = path.dirname(relPath);
  while (dir !== '.' && dir !== path.sep) {
    if (!fs.existsSync(path.join(workspace, dir))) absent.push(dir);
    dir = path.dirname(dir);
  }
  // Deepest first when creating is handled by mkdir -p; keep deepest-first
  // order here for rollback removal.
  return absent;
}

/**
 * Open a new transaction. Records the full journal — operation list, backups
 * of replaced/removed files, staged payloads for every new file and the
 * staged commit record — BEFORE any workspace file changes. Only writes
 * under `.pollux/transactions/<id>/`.
 *
 * @param {object} options
 * @param {string} options.workspace absolute workspace root
 * @param {Array<{op: 'create'|'replace'|'remove', path: string,
 *   content?: Buffer|string, hash?: string}>} options.operations
 *   workspace-relative operations (content required for create/replace)
 * @param {{content: Buffer|string}} options.commitRecord new
 *   `.pollux/generated.json` payload (renamed into place last)
 * @param {() => Date} [options.now]
 * @returns {{id: string, dir: string, workspace: string, journal: object}}
 */
export function beginTransaction({
  workspace,
  operations,
  commitRecord,
  now = () => new Date(),
}) {
  const id = newTransactionId(now);
  const dir = path.join(workspace, TRANSACTIONS_DIR, id);
  const backupsDir = path.join(dir, 'backups');
  const stagedDir = path.join(dir, 'staged');
  fs.mkdirSync(backupsDir, { recursive: true });
  fs.mkdirSync(stagedDir, { recursive: true });

  // Deterministic publish order: creates/replaces by path, then removes.
  const writes = operations
    .filter((o) => o.op !== 'remove')
    .sort((a, b) => byCodeUnit(a.path, b.path));
  const removes = operations
    .filter((o) => o.op === 'remove')
    .sort((a, b) => byCodeUnit(a.path, b.path));

  const journalOps = [];
  let index = 0;
  for (const op of [...writes, ...removes]) {
    const abs = path.resolve(workspace, op.path);
    if (!isWithin(workspace, abs)) {
      throw new SkeletonError(
        ERROR_CODES.PLAN_INVALID,
        `transaction operation escapes the workspace: ${op.path}`,
        { details: { path: op.path } }
      );
    }
    const entry = {
      op: op.op,
      path: op.path,
      hash: op.op === 'remove' ? null : sha256(Buffer.from(op.content)),
      backup: null,
      staged: null,
      createdDirs:
        op.op === 'remove' ? [] : absentAncestors(workspace, op.path),
    };
    if (op.op === 'replace' || op.op === 'remove') {
      if (!fs.existsSync(abs)) {
        throw new SkeletonError(
          ERROR_CODES.PLAN_INVALID,
          `cannot ${op.op} missing file: ${op.path}`,
          { details: { path: op.path } }
        );
      }
      entry.backup = `backups/${index}`;
      fs.copyFileSync(abs, path.join(dir, entry.backup));
    } else if (fs.existsSync(abs)) {
      throw new SkeletonError(
        ERROR_CODES.PLAN_INVALID,
        `cannot create over existing file: ${op.path}`,
        { details: { path: op.path } }
      );
    }
    if (op.op !== 'remove') {
      entry.staged = `staged/${index}`;
      writeDurable(path.join(dir, entry.staged), Buffer.from(op.content));
    }
    journalOps.push(entry);
    index += 1;
  }

  // Commit record: staged payload + backup of the previous record (if any).
  const commitAbs = path.join(workspace, GENERATED_MANIFEST_PATH);
  const commit = {
    path: GENERATED_MANIFEST_PATH,
    hash: sha256(Buffer.from(commitRecord.content)),
    staged: 'staged/commit',
    backup: fs.existsSync(commitAbs) ? 'backups/commit' : null,
    createdDirs: absentAncestors(workspace, GENERATED_MANIFEST_PATH),
  };
  writeDurable(
    path.join(dir, commit.staged),
    Buffer.from(commitRecord.content)
  );
  if (commit.backup) fs.copyFileSync(commitAbs, path.join(dir, commit.backup));

  const journal = {
    journalVersion: '1',
    id,
    createdAt: now().toISOString(),
    workspaceRelativeTo: '.',
    operations: journalOps,
    commit,
  };
  writeDurable(path.join(dir, JOURNAL_FILE), JSON.stringify(journal, null, 2));
  return { id, dir, workspace, journal };
}

/** Publish one payload via same-directory temp file + atomic rename. */
function publishFile(workspace, relPath, sourceFile, txnId) {
  const abs = path.join(workspace, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const tmp = path.join(
    path.dirname(abs),
    `.${path.basename(abs)}.pollux-tmp-${txnId}`
  );
  fs.copyFileSync(sourceFile, tmp);
  fs.renameSync(tmp, abs);
}

/**
 * Publish every journalled operation, commit record LAST. On any error the
 * transaction is rolled back from the journal and the error is rethrown.
 *
 * @param {object} txn handle from beginTransaction
 * @param {{beforeOperation?: (op: object) => void,
 *          beforeCommitRecord?: () => void,
 *          afterCommitRecord?: () => void,
 *          crashInsteadOfRollback?: boolean}} [hooks]
 *   test-only failure-injection points; `crashInsteadOfRollback` simulates a
 *   process kill: the error propagates without reversing the journal.
 */
export function commitTransaction(txn, hooks = {}) {
  try {
    for (const op of txn.journal.operations) {
      hooks.beforeOperation?.(op);
      if (op.op === 'remove') {
        fs.rmSync(path.join(txn.workspace, op.path));
      } else {
        publishFile(
          txn.workspace,
          op.path,
          path.join(txn.dir, op.staged),
          txn.id
        );
      }
    }
    hooks.beforeCommitRecord?.();
    publishFile(
      txn.workspace,
      txn.journal.commit.path,
      path.join(txn.dir, txn.journal.commit.staged),
      txn.id
    );
    hooks.afterCommitRecord?.();
  } catch (err) {
    if (hooks.crashInsteadOfRollback) throw err;
    rollbackTransaction(txn);
    throw err;
  }
}

const removeIfExists = (abs) => {
  if (fs.existsSync(abs)) fs.rmSync(abs);
};

const removeCreatedDirs = (workspace, createdDirs) => {
  for (const rel of createdDirs) {
    const abs = path.join(workspace, rel);
    try {
      if (fs.existsSync(abs) && fs.readdirSync(abs).length === 0) {
        fs.rmdirSync(abs);
      }
    } catch {
      // Non-empty or racing — leave it; content, not dirs, defines the tree.
    }
  }
};

const restoreFromBackup = (txn, entry) => {
  const abs = path.join(txn.workspace, entry.path);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.copyFileSync(path.join(txn.dir, entry.backup), abs);
};

/**
 * Reverse every journalled operation (idempotent: safe on partially applied
 * transactions), then delete the journal. Leaves the workspace byte-identical
 * to its pre-transaction state.
 */
export function rollbackTransaction(txn) {
  const { journal } = txn;
  // Commit record first: restore backup or remove the new record.
  if (journal.commit.backup) restoreFromBackup(txn, journal.commit);
  else {
    removeIfExists(path.join(txn.workspace, journal.commit.path));
    removeCreatedDirs(txn.workspace, journal.commit.createdDirs);
  }
  // Reverse operations in reverse publish order.
  for (const op of [...journal.operations].reverse()) {
    if (op.op === 'create') {
      removeIfExists(path.join(txn.workspace, op.path));
      removeCreatedDirs(txn.workspace, op.createdDirs);
    } else {
      // replace/remove: restore the backed-up original.
      restoreFromBackup(txn, op);
    }
  }
  // Stray same-directory temp files from an interrupted publish.
  for (const op of [...journal.operations, journal.commit]) {
    const abs = path.join(txn.workspace, op.path);
    removeIfExists(
      path.join(
        path.dirname(abs),
        `.${path.basename(abs)}.pollux-tmp-${txn.id}`
      )
    );
  }
  fs.rmSync(txn.dir, { recursive: true, force: true });
}

/** Load a persisted transaction handle from its journal directory. */
function loadTransaction(workspace, id) {
  const dir = path.join(workspace, TRANSACTIONS_DIR, id);
  const journalFile = path.join(dir, JOURNAL_FILE);
  if (!fs.existsSync(journalFile)) return null;
  let journal;
  try {
    journal = JSON.parse(fs.readFileSync(journalFile, 'utf8'));
  } catch {
    return null;
  }
  return { id, dir, workspace, journal };
}

/** Pending transaction ids in a workspace (oldest first). */
export function listPendingTransactions(workspace) {
  const root = path.join(workspace, TRANSACTIONS_DIR);
  if (!fs.existsSync(root)) return [];
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort(byCodeUnit);
}

/** True when the live commit record matches the journalled commit hash. */
function isCommitted(txn) {
  const abs = path.join(txn.workspace, txn.journal.commit.path);
  if (!fs.existsSync(abs)) return false;
  return sha256(fs.readFileSync(abs)) === txn.journal.commit.hash;
}

/** Verify every journalled path+hash against the workspace. */
function verifyCommitted(txn) {
  const mismatches = [];
  for (const op of txn.journal.operations) {
    const abs = path.join(txn.workspace, op.path);
    if (op.op === 'remove') {
      if (fs.existsSync(abs)) mismatches.push(op);
    } else if (
      !fs.existsSync(abs) ||
      sha256(fs.readFileSync(abs)) !== op.hash
    ) {
      mismatches.push(op);
    }
  }
  return mismatches;
}

/**
 * Startup recovery: every mutating command calls this before planning.
 * Uncommitted journals are rolled back; committed journals are completed
 * (roll-forward from staged payloads) and removed only once every path+hash
 * matches the commit record.
 *
 * @returns {{recovered: Array<{id: string,
 *   action: 'rolled-back'|'completed'|'removed'}>}}
 * @throws {SkeletonError} TRANSACTION_INCOMPLETE when a journal can be
 *   neither rolled back nor completed
 */
export function recoverWorkspace(workspace) {
  const recovered = [];
  for (const id of listPendingTransactions(workspace)) {
    const txn = loadTransaction(workspace, id);
    if (!txn) {
      // Journal directory without a readable journal: created but never
      // populated (crash inside beginTransaction) — no workspace change
      // can have happened, drop it.
      fs.rmSync(path.join(workspace, TRANSACTIONS_DIR, id), {
        recursive: true,
        force: true,
      });
      recovered.push({ id, action: 'removed' });
      continue;
    }
    if (!isCommitted(txn)) {
      rollbackTransaction(txn);
      recovered.push({ id, action: 'rolled-back' });
      continue;
    }
    // Committed: complete any missing publications from staged payloads.
    let mismatches = verifyCommitted(txn);
    if (mismatches.length > 0) {
      for (const op of mismatches) {
        if (op.op === 'remove') {
          removeIfExists(path.join(workspace, op.path));
        } else {
          publishFile(
            workspace,
            op.path,
            path.join(txn.dir, op.staged),
            txn.id
          );
        }
      }
      mismatches = verifyCommitted(txn);
      if (mismatches.length > 0) {
        throw new SkeletonError(
          ERROR_CODES.TRANSACTION_INCOMPLETE,
          `transaction ${id} is committed but ${mismatches.length} path(s) cannot be made to match the commit record`,
          {
            details: { transaction: id, paths: mismatches.map((m) => m.path) },
            hint: 'inspect .pollux/transactions and resolve manually',
          }
        );
      }
      fs.rmSync(txn.dir, { recursive: true, force: true });
      recovered.push({ id, action: 'completed' });
      continue;
    }
    fs.rmSync(txn.dir, { recursive: true, force: true });
    recovered.push({ id, action: 'removed' });
  }
  return { recovered };
}
