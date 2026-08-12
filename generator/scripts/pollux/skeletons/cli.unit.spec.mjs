// SPEC-001 — CLI contract for the skeleton commands: JSON/human failure
// envelopes, identical exit semantics, additive `steps` field, shell-quoted
// human output, both --flag=value and `--flag value` forms.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';

const repoRoot = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  '../../..'
);
const CLI = path.join(repoRoot, 'scripts/pollux/cli.mjs');

const cleanups = [];
const tmp = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'pollux-cli-'));
  cleanups.push(d);
  return d;
};
after(() =>
  cleanups.forEach((d) => fs.rmSync(d, { recursive: true, force: true }))
);

const cli = (...args) =>
  spawnSync('node', [CLI, ...args], { encoding: 'utf8', cwd: repoRoot });

const assertNoStack = (text) =>
  assert.ok(
    !/\n\s+at /.test(text) && !text.includes('node:internal'),
    `output must not contain a stack trace:\n${text}`
  );

test('json failure: file destination is a single clean JSON object', () => {
  const file = path.join(tmp(), 'a-file');
  fs.writeFileSync(file, 'x\n');
  const r = cli('new-workspace', 'nextjs', '--dir', file, '--json');
  assert.equal(r.status, 1);
  const payload = JSON.parse(r.stdout); // throws if stdout is not one object
  assert.equal(payload.ok, false);
  assert.equal(payload.code, 'DESTINATION_NOT_DIRECTORY');
  assert.ok(typeof payload.message === 'string');
  assertNoStack(r.stdout);
  assertNoStack(r.stderr);
});

test('human failure: same error, same exit status, concise message + hint', () => {
  const file = path.join(tmp(), 'a-file');
  fs.writeFileSync(file, 'x\n');
  const r = cli('new-workspace', 'nextjs', `--dir=${file}`);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /destination is not a directory/);
  assert.match(r.stderr, /hint:/);
  assertNoStack(r.stderr);
  assert.equal(r.stdout, '');
});

test('json failure: unknown skeleton has stable code', () => {
  const r = cli(
    'new-workspace',
    'nope',
    '--dir',
    path.join(tmp(), 'x'),
    '--json'
  );
  assert.equal(r.status, 1);
  assert.equal(JSON.parse(r.stdout).code, 'SKELETON_UNKNOWN');
});

test('json failure: invalid npm name rejected pre-write with stable code', () => {
  const dest = path.join(tmp(), 'x');
  const r = cli(
    'new-workspace',
    'nextjs',
    '--dir',
    dest,
    '--name',
    'INVALID NAME',
    '--json'
  );
  assert.equal(r.status, 1);
  assert.equal(JSON.parse(r.stdout).code, 'PACKAGE_NAME_INVALID');
  assert.ok(!fs.existsSync(dest), 'no filesystem writes before rejection');
});

test('json failure: reference skeleton is SKELETON_NOT_COPYABLE', () => {
  const r = cli(
    'new-workspace',
    'start-ui-vite',
    `--dir=${path.join(tmp(), 'x')}`,
    '--json'
  );
  assert.equal(r.status, 1);
  assert.equal(JSON.parse(r.stdout).code, 'SKELETON_NOT_COPYABLE');
});

test('success: --dir= form keeps existing fields and adds steps records', () => {
  const dest = path.join(tmp(), 'eq-form');
  const r = cli('new-workspace', 'nextjs', `--dir=${dest}`, '--json');
  assert.equal(r.status, 0, r.stderr);
  const payload = JSON.parse(r.stdout);
  // existing success fields retained
  assert.equal(payload.ok, true);
  assert.equal(payload.skeleton, 'nextjs');
  assert.equal(payload.workspace, dest);
  assert.equal(payload.package, 'eq-form');
  assert.ok(Array.isArray(payload.next));
  assert.equal(payload.next[0], `cd ${dest}`);
  // additive structured steps
  assert.deepEqual(payload.steps[0], {
    cwd: dest,
    command: 'pnpm',
    args: ['install', '--frozen-lockfile'],
  });
  // workspace content: provenance + lockfile, no artifacts
  assert.ok(fs.existsSync(path.join(dest, '.pollux/workspace.json')));
  assert.ok(fs.existsSync(path.join(dest, 'pnpm-lock.yaml')));
  assert.ok(!fs.existsSync(path.join(dest, 'node_modules')));
  assert.ok(!fs.existsSync(path.join(dest, 'skeleton.json')));
});

test('success: space-separated --dir/--name forms and spaced paths', () => {
  const dest = path.join(tmp(), 'dir with spaces');
  const r = cli(
    'new-workspace',
    'nextjs',
    '--dir',
    dest,
    '--name',
    'spaced-app',
    '--json'
  );
  assert.equal(r.status, 0, r.stderr);
  const payload = JSON.parse(r.stdout);
  assert.equal(payload.package, 'spaced-app');
  assert.equal(payload.steps[0].cwd, dest);

  // Human mode shell-quotes the destination in the copyable cd command.
  const dest2 = path.join(tmp(), 'another spaced dir');
  const r2 = cli(
    'new-workspace',
    'nextjs',
    '--dir',
    dest2,
    '--name',
    'spaced-two'
  );
  assert.equal(r2.status, 0, r2.stderr);
  assert.ok(
    r2.stdout.includes(`cd '${dest2}'`),
    `expected shell-quoted cd in:\n${r2.stdout}`
  );
});

test('existing command names and success fields are retained', () => {
  const ls = cli('list-skeletons', '--json');
  assert.equal(ls.status, 0);
  const lsPayload = JSON.parse(ls.stdout);
  assert.equal(lsPayload.ok, true);
  assert.ok(typeof lsPayload.count === 'number');
  assert.ok(Array.isArray(lsPayload.skeletons));
  for (const row of lsPayload.skeletons)
    for (const field of [
      'name',
      'framework',
      'status',
      'displayName',
      'pollux',
    ])
      assert.ok(field in row, `missing list-skeletons field ${field}`);

  const desc = cli('describe-skeleton', 'nextjs', '--json');
  assert.equal(desc.status, 0);
  const descPayload = JSON.parse(desc.stdout);
  assert.equal(descPayload.ok, true);
  assert.equal(descPayload.skeleton.name, 'nextjs');

  const val = cli('validate-skeletons', '--json');
  assert.equal(val.status, 0, val.stdout);
  const valPayload = JSON.parse(val.stdout);
  assert.equal(valPayload.ok, true);
  assert.ok(Array.isArray(valPayload.results));
});

test('usage errors are typed, not stack traces', () => {
  const r = cli('describe-skeleton', '--json');
  assert.equal(r.status, 1);
  assert.equal(JSON.parse(r.stdout).code, 'USAGE');
  const r2 = cli('new-workspace', 'nextjs', '--json');
  assert.equal(r2.status, 1);
  assert.equal(JSON.parse(r2.stdout).code, 'USAGE');
});
