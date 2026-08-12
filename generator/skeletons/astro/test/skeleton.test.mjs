// Skeleton smoke tests (run with `pnpm test`, node:test — no framework deps).
// Guard the SPEC-006 readiness invariants that don't need an install/build:
// server output on the Cloudflare adapter, React integration, and the
// server-only environment contract.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

test('astro config declares server output on the Cloudflare adapter', () => {
  const config = read('astro.config.mjs');
  assert.match(config, /output:\s*'server'/);
  assert.match(config, /@astrojs\/cloudflare/);
  assert.match(config, /adapter:\s*cloudflare\(\)/);
  assert.match(config, /@astrojs\/react/);
});

test('package declares React island + typecheck/test scripts', () => {
  const pkg = JSON.parse(read('package.json'));
  for (const dep of [
    '@astrojs/react',
    'react',
    'react-dom',
    '@astrojs/cloudflare',
  ]) {
    assert.ok(pkg.dependencies[dep], `missing dependency ${dep}`);
  }
  for (const dep of ['@types/react', '@types/react-dom', '@astrojs/check']) {
    assert.ok(pkg.devDependencies[dep], `missing devDependency ${dep}`);
  }
  assert.equal(pkg.scripts.typecheck, 'astro check');
  assert.ok(pkg.scripts.test);
});

test('.env.example carries the server-only proxy contract (no PUBLIC_ vars)', () => {
  const env = read('.env.example');
  for (const key of [
    'POLLUX_API_URL',
    'POLLUX_API_TIMEOUT_MS',
    'POLLUX_DEV_BEARER',
  ]) {
    assert.match(env, new RegExp(`^${key}=`, 'm'), `missing ${key}`);
  }
  assert.doesNotMatch(env, /^PUBLIC_/m);
});

test('layout imports the generated sidebar registry glob', () => {
  const layout = read('src/layouts/Layout.astro');
  assert.match(layout, /import\.meta\.glob/);
  assert.match(layout, /generated\/pollux\/nav/);
});
