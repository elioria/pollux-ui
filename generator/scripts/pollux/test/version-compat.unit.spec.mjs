// SPEC-007 — version compatibility gates.
//
// Unsupported provenance/model/adapter combinations must fail BEFORE any
// workspace write, through the real CLI, with a stable error code and an
// actionable message. Each scenario doctors `.pollux/workspace.json` in a
// real workspace created by `pollux new-workspace` and asserts:
//   - non-zero exit + `{ ok:false, code, ... }` JSON envelope;
//   - the workspace file tree is byte-for-byte untouched (no partial writes,
//     no .pollux/generated.json, no leftover transaction journals).
//
// Run with: node --test scripts/pollux/test/version-compat.unit.spec.mjs

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../../..');
const CLI = path.join(REPO_ROOT, 'scripts/pollux/cli.mjs');
const METADATA_DIR = 'test-fixtures/pollux/entities';
const ENTITY = 'rich-valid';

const runCli = (args) =>
  spawnSync('node', [CLI, ...args, '--json'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });

const parseJson = (result) => {
  try {
    return JSON.parse(result.stdout.trim());
  } catch {
    assert.fail(
      `CLI did not print a JSON envelope.\nstdout: ${result.stdout}\nstderr: ${result.stderr}`
    );
  }
};

/** Sorted relative path + size + mtimeMs snapshot of a workspace tree. */
const snapshotTree = (root) => {
  const rows = [];
  const walk = (dir, rel = '') => {
    for (const entry of fs
      .readdirSync(dir, { withFileTypes: true })
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
      const childRel = rel === '' ? entry.name : `${rel}/${entry.name}`;
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(abs, childRel);
      else {
        const stat = fs.statSync(abs);
        rows.push(`${childRel} ${stat.size} ${stat.mtimeMs}`);
      }
    }
  };
  walk(root);
  return rows.join('\n');
};

const PROVENANCE_REL = '.pollux/workspace.json';

describe('SPEC-007 version compatibility (real CLI, doctored provenance)', () => {
  let parent;
  let workspace;
  let pristineProvenance;

  before(() => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), 'pollux-version-compat-'));
    workspace = path.join(parent, 'workspace');
    const created = runCli(['new-workspace', 'nextjs', `--dir=${workspace}`]);
    assert.equal(created.status, 0, created.stdout + created.stderr);
    pristineProvenance = fs.readFileSync(
      path.join(workspace, PROVENANCE_REL),
      'utf8'
    );
  });

  after(() => {
    fs.rmSync(parent, { recursive: true, force: true });
  });

  /** Doctor provenance, run a mutating CLI command, assert clean failure. */
  const assertRejectedBeforeWrites = (mutate, cliArgs, expect) => {
    const provenance = JSON.parse(pristineProvenance);
    mutate(provenance);
    fs.writeFileSync(
      path.join(workspace, PROVENANCE_REL),
      JSON.stringify(provenance, null, 2)
    );
    const beforeTree = snapshotTree(workspace);
    try {
      const result = runCli(cliArgs);
      assert.notEqual(result.status, 0, 'CLI must exit non-zero');
      const envelope = parseJson(result);
      assert.equal(envelope.ok, false);
      assert.equal(envelope.code, expect.code);
      const text = JSON.stringify(envelope);
      for (const needle of expect.mentions) {
        assert.match(
          text,
          new RegExp(needle),
          `error must mention '${needle}' to be actionable`
        );
      }
      assert.equal(
        snapshotTree(workspace),
        beforeTree,
        'workspace must be untouched after a version-compat rejection'
      );
      assert.equal(
        fs.existsSync(path.join(workspace, '.pollux/generated.json')),
        false,
        'no generated manifest may be written'
      );
      assert.equal(
        fs.existsSync(path.join(workspace, '.pollux/transactions')) &&
          fs.readdirSync(path.join(workspace, '.pollux/transactions')).length >
            0,
        false,
        'no transaction journal may be left behind'
      );
    } finally {
      fs.writeFileSync(
        path.join(workspace, PROVENANCE_REL),
        pristineProvenance
      );
    }
  };

  // Lazy: `workspace` is only assigned in the before() hook.
  const generateArgs = () => [
    'generate',
    `--workspace=${workspace}`,
    `--entity=${ENTITY}`,
    `--metadata-dir=${METADATA_DIR}`,
  ];

  it('rejects a workspace with a foreign metadataModelVersion before writes', () => {
    assertRejectedBeforeWrites(
      (p) => {
        p.metadataModelVersion = '999';
      },
      generateArgs(),
      {
        code: 'PLAN_INVALID',
        mentions: [
          "metadata model version '999'",
          "generator requires '1'",
          'no files were written',
        ],
      }
    );
  });

  it('rejects an unknown targetAdapter id with the known-target list', () => {
    assertRejectedBeforeWrites(
      (p) => {
        p.targetAdapter = { id: 'svelte', version: '9.9.9' };
      },
      generateArgs(),
      {
        code: 'TARGET_UNSUPPORTED',
        mentions: [
          "no generator adapter is registered for target 'svelte'",
          'astro-react',
          'nextjs',
          'react-router',
          'tanstack-start',
        ],
      }
    );
  });

  it('rejects a tampered targetStatus (neither experimental nor supported)', () => {
    assertRejectedBeforeWrites(
      (p) => {
        p.targetStatus = 'promoted-by-hand';
      },
      generateArgs(),
      {
        code: 'TARGET_UNSUPPORTED',
        mentions: ['nextjs'],
      }
    );
  });

  it('rejects an explicit --target that disagrees with the recorded adapter', () => {
    assertRejectedBeforeWrites(
      () => {},
      [...generateArgs(), '--target=react-router'],
      {
        code: 'TARGET_MISMATCH',
        mentions: [
          "explicit target 'react-router'",
          "recorded target 'nextjs'",
        ],
      }
    );
  });

  it('plan is rejected identically (dry-run honors the same gates)', () => {
    assertRejectedBeforeWrites(
      (p) => {
        p.metadataModelVersion = '999';
      },
      [
        'plan',
        `--workspace=${workspace}`,
        `--entity=${ENTITY}`,
        `--metadata-dir=${METADATA_DIR}`,
      ],
      {
        code: 'PLAN_INVALID',
        mentions: ["metadata model version '999'"],
      }
    );
  });
});
