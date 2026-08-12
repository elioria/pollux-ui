// Skeleton smoke tests (run with `pnpm test`, node:test — no framework deps).
// Guard the SPEC-005 readiness invariants that don't need an install/build:
// canonical verification order, server-only environment contract, and the
// handwritten route/nav aggregators that generated fragments plug into.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { polluxRouteDescriptors } from '../app/pollux-routes.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

test('package declares the canonical typecheck order and Node range', () => {
  const pkg = JSON.parse(read('package.json'));
  // React Router type generation MUST run before tsc (SPEC-005).
  assert.equal(pkg.scripts.typecheck, 'react-router typegen && tsc --noEmit');
  assert.ok(pkg.scripts.test);
  assert.ok(pkg.scripts.start);
  assert.equal(pkg.engines.node, '>=20 <25');
  for (const dep of [
    'react',
    'react-dom',
    'react-router',
    '@react-router/serve',
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
  const shell = read('app/root.tsx');
  assert.match(shell, /import\.meta\.glob/);
  assert.match(shell, /generated\/pollux\/nav/);
});

test('route config spreads the Pollux route descriptors', () => {
  const routes = read('app/routes.ts');
  assert.match(routes, /polluxRouteDescriptors/);
  assert.match(routes, /routes\/pollux\//);
  assert.match(routes, /api\.pollux\.\$\.ts/);
});

test('fresh skeleton enumerates zero generated routes', () => {
  const described = polluxRouteDescriptors(path.join(root, 'app'));
  assert.deepEqual(described, {
    entityPages: [],
    hasProxy: false,
    hasAuthStub: false,
  });
});

test('enumeration discovers complete entity dirs + resource routes, sorted', () => {
  const appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pollux-routes-'));
  try {
    const make = (rel) => {
      const abs = path.join(appDir, rel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, '// stub\n');
    };
    for (const slug of ['zetas', 'amostras']) {
      for (const file of ['index.tsx', 'new.tsx', 'edit.tsx']) {
        make(`routes/pollux/${slug}/${file}`);
      }
    }
    // Incomplete dir (missing edit.tsx) is skipped.
    make('routes/pollux/parciais/index.tsx');
    make('routes/pollux/parciais/new.tsx');
    make('routes/api.pollux.$.ts');
    make('routes/api.pollux.auth.ts');

    const described = polluxRouteDescriptors(appDir);
    assert.deepEqual(
      described.entityPages.map((p) => p.slug),
      ['amostras', 'zetas']
    );
    assert.equal(described.hasProxy, true);
    assert.equal(described.hasAuthStub, true);
  } finally {
    fs.rmSync(appDir, { recursive: true, force: true });
  }
});
