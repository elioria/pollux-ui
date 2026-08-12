#!/usr/bin/env node
// SPEC-007 — workspace matrix harness (zero-dependency Node).
//
// For one experimental standalone target, in an EMPTY temporary parent
// directory:
//
//   1. pollux new-workspace <skeleton> --dir=<tmp>/workspace
//   2. pnpm install --frozen-lockfile      (committed skeleton lockfile)
//      + fresh-skeleton test suite (pre-generation state)
//   3. pollux generate --entity rich-valid --metadata-dir test-fixtures/pollux/entities
//   4. pollux check-generated (owned files clean, no pending journals)
//   5. no-source-dependency scan (scripts/pollux/test/no-source-dependency.mjs)
//   6. typecheck / test / build over the generated workspace
//      (all offline: no POLLUX_* env; remix skips the post-generation test
//      re-run — its skeleton suite asserts the fresh-skeleton state)
//      + client-bundle secret scan (server-only env names — POLLUX_API_URL,
//      POLLUX_AUTH_CLIENT_SECRET, POLLUX_SESSION_SECRET, POLLUX_DEV_BEARER —
//      must never appear in browser-shipped build output)
//   7. runtime contract smoke: boot the mock v2 API
//      (test-fixtures/pollux/api/mock-server.mjs) + the app
//      (next start / react-router-serve for built output; astro dev server —
//      the astro build is a Cloudflare Worker and does not run under plain
//      Node) and assert:
//        a. SSR list page  GET /manager/amostras            -> 200 + title
//        b. proxied v2 API GET /api/pollux/api/generated/v2/amostra
//                                                           -> 200, 7 rows
//        c. auth-strip: the same request with a bogus client
//           Authorization + Cookie still succeeds (the proxy strips client
//           credentials and injects the server-side bearer) and the response
//           never leaks the server bearer value.
//        d. BFF auth endpoints: with no POLLUX_AUTH_* env the fixed
//           endpoints answer a safe 503 envelope (dev-bearer mode is the
//           documented offline fallback), unknown actions 404, and a
//           cross-origin mutation is refused 403 by the proxy defense.
//
// Machine-readable summary: the LAST stdout line is one JSON object
// { ok, target, skeleton, adapter, workspace, steps: [...], totalMs }.
// Non-zero exit on any failure.
//
// Usage:
//   node scripts/pollux/test/workspace-matrix.mjs --target nextjs|remix|astro
//     [--keep]            keep the temporary workspace on exit
//     [--tmp-parent=DIR]  parent for the temp dir (default: os.tmpdir())
//
// Target aliases: react-router -> remix, astro-react -> astro.

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../../..');
const CLI = path.join(REPO_ROOT, 'scripts/pollux/cli.mjs');
const METADATA_DIR = 'test-fixtures/pollux/entities';
const ENTITY = 'rich-valid'; // metadata fixture; entity id 'amostra'
const LIST_PATH = '/manager/amostras';
const PROXY_PATH = '/api/pollux/api/generated/v2/amostra';
const SERVER_BEARER = 'token-admin';

const TARGETS = {
  nextjs: {
    skeleton: 'nextjs',
    adapter: 'nextjs',
    // built output smoke: `next start` honors PORT
    boot: (port) => ({
      cmd: 'pnpm',
      args: ['start'],
      env: { PORT: String(port) },
    }),
    bootMode: 'built',
    clientBundleDirs: ['.next/static'],
  },
  remix: {
    skeleton: 'remix',
    adapter: 'react-router',
    // built output smoke: react-router-serve honors PORT
    boot: (port) => ({
      cmd: 'pnpm',
      args: ['start'],
      env: { PORT: String(port) },
    }),
    bootMode: 'built',
    clientBundleDirs: ['build/client'],
    // skeletons/remix/test/skeleton.test.mjs asserts the FRESH-skeleton route
    // enumeration (zero generated routes); it is not valid after generation.
    skipPostGenerateTest:
      'remix skeleton suite asserts fresh-skeleton route enumeration; covered by the pre-generation test step',
  },
  astro: {
    skeleton: 'astro',
    adapter: 'astro-react',
    // dev-server smoke: `astro build` emits a Cloudflare Worker (dist/_worker.js)
    // that plain Node cannot execute; the proxy + SSR contract is exercised
    // through `astro dev` instead (documented SPEC-006 limitation).
    boot: (port) => ({
      cmd: 'pnpm',
      args: [
        'exec',
        'astro',
        'dev',
        '--port',
        String(port),
        '--host',
        '127.0.0.1',
      ],
      env: {},
    }),
    bootMode: 'dev-server',
    // dist/_worker.js is the SERVER worker bundle; everything else under
    // dist/ ships to the browser.
    clientBundleDirs: ['dist'],
    clientBundleExclude: /(^|\/)_worker\.js(\/|$)/,
  },
  'tanstack-start': {
    skeleton: 'tanstack-start',
    adapter: 'tanstack-start',
    // built output smoke: the nitro Node server honors PORT
    boot: (port) => ({
      cmd: 'pnpm',
      args: ['start'],
      env: { PORT: String(port) },
    }),
    bootMode: 'built',
    clientBundleDirs: ['.output/public'],
    // skeletons/tanstack-start/test/skeleton.test.mjs asserts the
    // FRESH-skeleton state (zero generated routes); not valid after
    // generation.
    skipPostGenerateTest:
      'tanstack-start skeleton suite asserts fresh-skeleton state; covered by the pre-generation test step',
  },
};
const ALIASES = { 'react-router': 'remix', 'astro-react': 'astro' };

// ------------------------------------------------------------------ helpers

const args = process.argv.slice(2);
const flag = (name) => {
  const inline = args.find((a) => a.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const i = args.indexOf(`--${name}`);
  if (i !== -1 && args[i + 1] && !args[i + 1].startsWith('--')) {
    return args[i + 1];
  }
  return undefined;
};
const keep = args.includes('--keep');

/** Child env with all POLLUX_* stripped (offline steps must not see them). */
const scrubbedEnv = (extra = {}) => {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith('POLLUX_')) delete env[key];
  }
  return { ...env, CI: env.CI ?? 'true', ...extra };
};

const runStep = (steps, name, fn) => {
  const startedAt = Date.now();
  process.stderr.write(`[matrix] ${name} ...\n`);
  try {
    const detail = fn();
    steps.push({
      name,
      ok: true,
      ms: Date.now() - startedAt,
      ...(detail ? { detail } : {}),
    });
    return true;
  } catch (err) {
    steps.push({
      name,
      ok: false,
      ms: Date.now() - startedAt,
      error: String(err?.message ?? err).slice(0, 4000),
    });
    return false;
  }
};

const sh = (cmd, cmdArgs, { cwd, env, timeoutMs = 15 * 60 * 1000 } = {}) => {
  const result = spawnSync(cmd, cmdArgs, {
    cwd: cwd ?? REPO_ROOT,
    env: env ?? scrubbedEnv(),
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 64 * 1024 * 1024,
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${cmd} ${cmdArgs.join(' ')} exited ${result.status}\n--- stdout\n${result.stdout?.slice(-3000)}\n--- stderr\n${result.stderr?.slice(-3000)}`
    );
  }
  return result;
};

const cliJson = (cliArgs, opts) => {
  const result = sh('node', [CLI, ...cliArgs, '--json'], opts);
  const parsed = JSON.parse(result.stdout.trim());
  if (parsed.ok !== true) {
    throw new Error(`pollux ${cliArgs[0]} failed: ${JSON.stringify(parsed)}`);
  }
  return parsed;
};

const freePort = () =>
  new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const fetchWithTimeout = async (url, options = {}, timeoutMs = 30_000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
      redirect: 'manual',
    });
  } finally {
    clearTimeout(timer);
  }
};

// -------------------------------------------------------------------- main

const requested = flag('target');
const targetKey = ALIASES[requested] ?? requested;
const target = TARGETS[targetKey];
if (!target) {
  console.error(
    'usage: node scripts/pollux/test/workspace-matrix.mjs --target nextjs|remix|astro [--keep] [--tmp-parent=DIR]'
  );
  process.exit(2);
}

const tmpParentBase = flag('tmp-parent') ?? os.tmpdir();
fs.mkdirSync(tmpParentBase, { recursive: true });
const tmpParent = fs.mkdtempSync(
  path.join(tmpParentBase, `pollux-matrix-${targetKey}-`)
);
const workspace = path.join(tmpParent, 'workspace');

const steps = [];
const startedAt = Date.now();
let appProc = null;
let mockServer = null;

const teardown = async () => {
  if (appProc && appProc.pid && appProc.exitCode === null) {
    try {
      process.kill(-appProc.pid, 'SIGTERM');
    } catch {
      try {
        appProc.kill('SIGTERM');
      } catch {}
    }
    await sleep(500);
    try {
      process.kill(-appProc.pid, 'SIGKILL');
    } catch {}
  }
  if (mockServer) {
    try {
      await mockServer.close();
    } catch {}
  }
  if (!keep) fs.rmSync(tmpParent, { recursive: true, force: true });
};

const finish = async (ok) => {
  await teardown();
  const summary = {
    ok,
    target: targetKey,
    skeleton: target.skeleton,
    adapter: target.adapter,
    workspace: keep ? workspace : null,
    bootMode: target.bootMode,
    steps,
    totalMs: Date.now() - startedAt,
  };
  console.log(JSON.stringify(summary));
  process.exit(ok ? 0 : 1);
};

let ok = true;

// 1. new-workspace into the empty temp parent
ok =
  ok &&
  runStep(steps, 'new-workspace', () => {
    const result = cliJson([
      'new-workspace',
      target.skeleton,
      `--dir=${workspace}`,
    ]);
    return { package: result.package, dirty: result.dirty };
  });

// 2. install from the committed lockfile, then run the FRESH-skeleton test
//    suite (some skeleton suites assert the pre-generation state).
ok =
  ok &&
  runStep(steps, 'pnpm-install-frozen-lockfile', () => {
    sh('pnpm', ['install', '--frozen-lockfile'], { cwd: workspace });
  });
ok =
  ok &&
  runStep(steps, 'test-fresh-skeleton', () => {
    sh('pnpm', ['run', 'test'], { cwd: workspace });
  });

// 3. generate the rich-valid fixture entity
ok =
  ok &&
  runStep(steps, 'generate', () => {
    const result = cliJson([
      'generate',
      `--workspace=${workspace}`,
      `--entity=${ENTITY}`,
      `--metadata-dir=${METADATA_DIR}`,
    ]);
    return {
      target: result.target,
      entities: result.entities.map((e) => e.entity),
    };
  });

// 4. generated state is clean (ownership manifest, no pending journals)
ok =
  ok &&
  runStep(steps, 'check-generated', () => {
    cliJson(['check-generated', `--workspace=${workspace}`]);
  });

// 5. no dependency on this source checkout
ok =
  ok &&
  runStep(steps, 'no-source-dependency', () => {
    const result = sh('node', [
      path.join(HERE, 'no-source-dependency.mjs'),
      '--workspace',
      workspace,
      '--json',
    ]);
    const parsed = JSON.parse(result.stdout);
    return { scannedFiles: parsed.scannedFiles };
  });

// 6. offline gates over the GENERATED workspace — typecheck, test, build
//    (no POLLUX_* env, no API running: builds must be possible offline).
ok =
  ok &&
  runStep(steps, 'typecheck', () => {
    sh('pnpm', ['run', 'typecheck'], { cwd: workspace });
  });
ok =
  ok &&
  runStep(steps, 'test-post-generate', () => {
    if (target.skipPostGenerateTest) {
      return { skipped: target.skipPostGenerateTest };
    }
    sh('pnpm', ['run', 'test'], { cwd: workspace });
  });
ok =
  ok &&
  runStep(steps, 'build', () => {
    sh('pnpm', ['run', 'build'], { cwd: workspace });
  });

// 6b. client-bundle secret scan: server-only env names (upstream URL, BFF
//     client secret, session secret, dev bearer) must never appear in any
//     browser-shipped build artifact.
ok =
  ok &&
  runStep(steps, 'client-bundle-secret-scan', () => {
    const FORBIDDEN = [
      'POLLUX_API_URL',
      'POLLUX_AUTH_CLIENT_SECRET',
      'POLLUX_SESSION_SECRET',
      'POLLUX_DEV_BEARER',
    ];
    const leaks = [];
    let scanned = 0;
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const abs = path.join(dir, entry.name);
        const rel = path.relative(workspace, abs).split(path.sep).join('/');
        if (target.clientBundleExclude?.test(rel)) continue;
        if (entry.isDirectory()) {
          walk(abs);
          continue;
        }
        if (!entry.isFile()) continue;
        scanned += 1;
        const content = fs.readFileSync(abs, 'latin1');
        for (const token of FORBIDDEN) {
          if (content.includes(token)) leaks.push(`${token} in ${rel}`);
        }
      }
    };
    for (const rel of target.clientBundleDirs) {
      const abs = path.join(workspace, rel);
      if (!fs.existsSync(abs)) {
        throw new Error(`client bundle dir missing after build: ${rel}`);
      }
      walk(abs);
    }
    if (leaks.length > 0) {
      throw new Error(
        `server-only env names leaked into client output:\n${leaks.join('\n')}`
      );
    }
    return { scannedFiles: scanned };
  });

// 7. runtime contract smoke: mock v2 API + booted app
if (ok) {
  const { start } = await import(
    pathToFileURL(
      path.join(REPO_ROOT, 'test-fixtures/pollux/api/mock-server.mjs')
    ).href
  );
  let appPort;
  ok = await (async () => {
    let stepOk = true;
    const push = (name, fn) => {
      const stepStart = Date.now();
      process.stderr.write(`[matrix] ${name} ...\n`);
      return fn()
        .then((detail) => {
          steps.push({
            name,
            ok: true,
            ms: Date.now() - stepStart,
            ...(detail ? { detail } : {}),
          });
          return true;
        })
        .catch((err) => {
          steps.push({
            name,
            ok: false,
            ms: Date.now() - stepStart,
            error: String(err?.message ?? err).slice(0, 4000),
          });
          return false;
        });
    };

    stepOk = await push('boot-mock-api-and-app', async () => {
      mockServer = await start({ port: 0 });
      appPort = await freePort();
      const boot = target.boot(appPort);
      appProc = spawn(boot.cmd, boot.args, {
        cwd: workspace,
        env: scrubbedEnv({
          ...boot.env,
          POLLUX_API_URL: mockServer.url,
          POLLUX_DEV_BEARER: SERVER_BEARER,
        }),
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let appLog = '';
      appProc.stdout.on('data', (d) => (appLog = (appLog + d).slice(-8000)));
      appProc.stderr.on('data', (d) => (appLog = (appLog + d).slice(-8000)));
      const deadline = Date.now() + 180_000;
      // readiness: any HTTP answer from the app root
      for (;;) {
        if (appProc.exitCode !== null) {
          throw new Error(
            `app exited ${appProc.exitCode} before ready:\n${appLog}`
          );
        }
        try {
          const res = await fetchWithTimeout(
            `http://127.0.0.1:${appPort}/`,
            {},
            5000
          );
          if (res.status < 500) break;
        } catch {}
        if (Date.now() > deadline) {
          throw new Error(
            `app not ready on :${appPort} after 180s:\n${appLog}`
          );
        }
        await sleep(750);
      }
      return { mockApi: mockServer.url, appPort, bootMode: target.bootMode };
    });

    if (stepOk) {
      stepOk = await push('smoke-ssr-list', async () => {
        const res = await fetchWithTimeout(
          `http://127.0.0.1:${appPort}${LIST_PATH}`,
          {},
          60_000
        );
        const body = await res.text();
        if (res.status !== 200) {
          throw new Error(
            `GET ${LIST_PATH} -> ${res.status}\n${body.slice(0, 2000)}`
          );
        }
        if (!/Amostras/.test(body)) {
          throw new Error(
            `GET ${LIST_PATH} 200 but SSR body lacks the entity title 'Amostras'`
          );
        }
        return { status: res.status };
      });
    }

    if (stepOk) {
      stepOk = await push('smoke-proxied-v2-list', async () => {
        const res = await fetchWithTimeout(
          `http://127.0.0.1:${appPort}${PROXY_PATH}`,
          {},
          60_000
        );
        const body = await res.json();
        if (res.status !== 200 || body.ok !== true) {
          throw new Error(
            `GET ${PROXY_PATH} -> ${res.status} ${JSON.stringify(body).slice(0, 1000)}`
          );
        }
        if (!Array.isArray(body.data?.rows) || body.data.totalRows !== 7) {
          throw new Error(
            `proxied list shape unexpected: totalRows=${body.data?.totalRows}`
          );
        }
        return { totalRows: body.data.totalRows };
      });
    }

    if (stepOk) {
      stepOk = await push('smoke-auth-strip', async () => {
        // A bogus client credential + cookie must be STRIPPED by the proxy:
        // the request still succeeds via the server-side bearer. If the
        // client Authorization were forwarded, the mock would answer 401.
        const res = await fetchWithTimeout(
          `http://127.0.0.1:${appPort}${PROXY_PATH}`,
          {
            headers: {
              Authorization: 'Bearer token-none-client-supplied',
              Cookie: 'session=client-cookie',
            },
          },
          60_000
        );
        const text = await res.text();
        if (res.status !== 200) {
          throw new Error(
            `client Authorization was not stripped: GET ${PROXY_PATH} -> ${res.status} ${text.slice(0, 500)}`
          );
        }
        const body = JSON.parse(text);
        if (body.ok !== true)
          throw new Error(`unexpected body: ${text.slice(0, 500)}`);
        if (text.includes(SERVER_BEARER)) {
          throw new Error('response leaked the server-side bearer value');
        }
        return { status: res.status };
      });
    }

    if (stepOk) {
      stepOk = await push('smoke-bff-auth-endpoints', async () => {
        // Matrix runs WITHOUT the POLLUX_AUTH_* env: the BFF endpoints must
        // answer a safe 503 envelope (never a redirect, never a 501 stub),
        // and unknown actions must 404.
        const login = await fetchWithTimeout(
          `http://127.0.0.1:${appPort}/api/pollux/auth/login?returnTo=%2Fmanager%2Famostras`,
          {},
          60_000
        );
        const loginBody = await login.json();
        if (login.status !== 503 || loginBody.ok !== false) {
          throw new Error(
            `unconfigured login expected 503 envelope, got ${login.status} ${JSON.stringify(loginBody).slice(0, 300)}`
          );
        }
        if (loginBody.code !== 'SERVICE_UNAVAILABLE') {
          throw new Error(`unexpected login code: ${loginBody.code}`);
        }
        const unknown = await fetchWithTimeout(
          `http://127.0.0.1:${appPort}/api/pollux/auth/does-not-exist`,
          {},
          60_000
        );
        if (unknown.status !== 404) {
          throw new Error(
            `unknown auth action expected 404, got ${unknown.status}`
          );
        }
        // Cross-origin mutation is refused by the proxy defense even in
        // dev-bearer mode (cheap same-origin check).
        const crossOrigin = await fetchWithTimeout(
          `http://127.0.0.1:${appPort}${PROXY_PATH}`,
          {
            method: 'POST',
            headers: {
              Origin: 'https://evil.example',
              'Content-Type': 'application/json',
            },
            body: '{}',
          },
          60_000
        );
        if (crossOrigin.status !== 403) {
          throw new Error(
            `cross-origin mutation expected 403, got ${crossOrigin.status}`
          );
        }
        return {
          login: login.status,
          unknown: unknown.status,
          crossOrigin: 403,
        };
      });
    }

    return stepOk;
  })();
}

await finish(ok);
