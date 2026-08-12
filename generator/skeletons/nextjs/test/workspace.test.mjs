// Adapter-agnostic workspace smoke tests (run with `pnpm test`).
// Framework-free on purpose (node:test only): they validate the workspace
// contract every Pollux target relies on — shell files, scripts, and the
// server-only environment example — without needing node_modules beyond
// what the skeleton ships.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

test('shell entrypoints exist', () => {
  for (const rel of [
    'app/layout.tsx',
    'app/globals.css',
    'app/page.tsx',
    'components/sidebar.tsx',
    'components/pollux-nav.tsx',
    'lib/pollux/registry.ts',
  ]) {
    assert.ok(fs.existsSync(path.join(root, rel)), `missing ${rel}`);
  }
});

test('package scripts contract', () => {
  const pkg = JSON.parse(read('package.json'));
  for (const script of ['dev', 'build', 'start', 'typecheck', 'lint', 'test']) {
    assert.equal(typeof pkg.scripts[script], 'string', `missing ${script}`);
  }
});

test('.env.example documents the SPEC-003 server env without secrets', () => {
  const env = read('.env.example');
  for (const key of [
    'POLLUX_API_URL',
    'POLLUX_API_TIMEOUT_MS',
    'POLLUX_DEV_BEARER',
  ]) {
    assert.ok(env.includes(`${key}=`), `missing ${key}`);
  }
  // The bearer placeholder must stay empty — no example secrets.
  assert.match(env, /^POLLUX_DEV_BEARER=$/m);
});

test('handwritten shell reads the generated registry fragments', () => {
  const sidebar = read('components/sidebar.tsx');
  assert.ok(sidebar.includes('PolluxNav'));
  const nav = read('components/pollux-nav.tsx');
  assert.ok(nav.includes('readPolluxRegistry'));
});
