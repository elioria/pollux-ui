// Skeleton smoke tests (run with `pnpm test`, node:test — no framework deps).
// Guard the SPEC-008 readiness invariants that don't need an install/build:
// canonical verification order, server-only environment contract, and the
// handwritten shell hooks that generated fragments plug into. These assert
// the FRESH-skeleton state (zero generated routes) — the workspace matrix
// skips this suite after generation.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

test('package declares the canonical typecheck order and Node range', () => {
  const pkg = JSON.parse(read('package.json'));
  // Route-tree generation MUST run before tsc (SPEC-008).
  assert.equal(pkg.scripts.typecheck, 'tsr generate && tsc --noEmit');
  assert.ok(pkg.scripts.test);
  assert.ok(pkg.scripts.start);
  assert.equal(pkg.engines.node, '>=20 <25');
  for (const dep of [
    'react',
    'react-dom',
    '@tanstack/react-router',
    '@tanstack/react-start',
  ]) {
    assert.ok(pkg.dependencies[dep], `missing dependency ${dep}`);
  }
});

test('.env.example carries the server-only proxy contract (no VITE_ vars)', () => {
  const env = read('.env.example');
  for (const key of [
    'POLLUX_API_URL',
    'POLLUX_API_TIMEOUT_MS',
    'POLLUX_DEV_BEARER',
  ]) {
    assert.match(env, new RegExp(`^${key}=`, 'm'), `missing ${key}`);
  }
  assert.match(env, /10000/, 'documented POLLUX_API_TIMEOUT_MS default');
  assert.doesNotMatch(env, /^VITE_/m);
});

test('root shell imports the generated sidebar registry glob', () => {
  const shell = read('src/routes/__root.tsx');
  assert.match(shell, /import\.meta\.glob/);
  assert.match(shell, /generated\/pollux\/nav/);
});

test('route-tree generator is configured for src/routes', () => {
  const tsr = JSON.parse(read('tsr.config.json'));
  assert.equal(tsr.routesDirectory, './src/routes');
  assert.equal(tsr.generatedRouteTree, './src/routeTree.gen.ts');
});

test('fresh skeleton carries zero generated routes', () => {
  assert.equal(
    fs.existsSync(path.join(root, 'src/routes/manager')),
    false,
    'src/routes/manager must not exist in the fresh skeleton'
  );
  assert.equal(
    fs.existsSync(path.join(root, 'src/routes/api')),
    false,
    'src/routes/api must not exist in the fresh skeleton'
  );
  assert.equal(
    fs.existsSync(path.join(root, 'src/generated')),
    false,
    'src/generated must not exist in the fresh skeleton'
  );
});
