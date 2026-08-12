// SPEC-001 — registry/manifest schema validation. Every invalid state has a
// focused fixture and a stable error code / problem message.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, test } from 'node:test';

import { ERROR_CODES } from './errors.mjs';
import { cleanupFixture, makeFixtureRepo } from './fixtures.mjs';
import { skeletonContext, validateAllSkeletons } from './registry.mjs';
import {
  isValidNpmPackageName,
  parseCommand,
  parseRegistry,
  validateSkeleton,
} from './schema.mjs';

const fixtures = [];
const repo = (opts) => {
  const f = makeFixtureRepo(opts);
  fixtures.push(f.repoRoot);
  return f;
};
after(() => fixtures.forEach(cleanupFixture));

const ctxOf = (f) => skeletonContext(f.repoRoot);

const registryError = (f) => {
  try {
    parseRegistry(ctxOf(f));
  } catch (err) {
    return err;
  }
  return null;
};

const demoProblems = (f) => {
  const registry = JSON.parse(
    fs.readFileSync(path.join(f.skeletonsDir, 'registry.json'), 'utf8')
  );
  return validateSkeleton(registry.skeletons[0], ctxOf(f));
};

const expectProblem = (problems, substring) => {
  assert.ok(
    problems.some((p) => p.includes(substring)),
    `expected a problem containing '${substring}', got: ${JSON.stringify(problems)}`
  );
};

// ------------------------------------------------------------------ registry

test('valid fixture registry parses and skeleton validates clean', () => {
  const f = repo();
  assert.equal(registryError(f), null);
  assert.deepEqual(demoProblems(f), []);
  assert.equal(validateAllSkeletons(ctxOf(f)).ok, true);
});

test('registry: unknown schemaVersion is rejected', () => {
  const f = repo({ registry: (r) => (r.schemaVersion = 99) });
  const err = registryError(f);
  assert.equal(err.code, ERROR_CODES.REGISTRY_INVALID);
  expectProblem(err.details.problems, 'unknown registry schemaVersion');
});

test('registry: duplicate skeleton names are rejected', () => {
  const f = repo({
    registry: (r) => r.skeletons.push({ ...r.skeletons[0], path: 'demo2' }),
  });
  fs.cpSync(f.skeletonDir, path.join(f.skeletonsDir, 'demo2'), {
    recursive: true,
  });
  const err = registryError(f);
  assert.equal(err.code, ERROR_CODES.REGISTRY_INVALID);
  expectProblem(err.details.problems, "duplicate skeleton name 'demo'");
});

test('registry: duplicate skeleton paths are rejected', () => {
  const f = repo({
    registry: (r) => r.skeletons.push({ ...r.skeletons[0], name: 'demo-two' }),
  });
  const err = registryError(f);
  expectProblem(err.details.problems, "duplicate skeleton path 'demo'");
});

test('registry: non-kebab-case name is rejected', () => {
  const f = repo({ registry: (r) => (r.skeletons[0].name = 'Demo_Skeleton') });
  const err = registryError(f);
  expectProblem(err.details.problems, 'is not kebab-case');
});

test('registry: absolute entry path is rejected', () => {
  const f = repo({ registry: (r) => (r.skeletons[0].path = '/etc') });
  expectProblem(registryError(f).details.problems, 'path must be relative');
});

test("registry: '..' traversal in entry path is rejected", () => {
  const f = repo({ registry: (r) => (r.skeletons[0].path = '../outside') });
  expectProblem(registryError(f).details.problems, "must not contain '..'");
});

test('registry: missing skeleton directory is rejected', () => {
  const f = repo({ registry: (r) => (r.skeletons[0].path = 'ghost') });
  expectProblem(
    registryError(f).details.problems,
    'skeleton directory not found'
  );
});

// ------------------------------------------------------------------ manifest

test('manifest: unknown schemaVersion is rejected', () => {
  const f = repo({ manifest: (m) => (m.schemaVersion = 42) });
  expectProblem(demoProblems(f), 'unknown manifest schemaVersion');
});

test('manifest: missing version is rejected', () => {
  const f = repo({ manifest: (m) => delete m.version });
  expectProblem(demoProblems(f), "missing field 'version'");
});

test('manifest: registry/manifest name disagreement is rejected', () => {
  const f = repo({ manifest: (m) => (m.name = 'other') });
  expectProblem(demoProblems(f), "!= registry entry 'demo'");
});

test('manifest: registry/manifest framework disagreement is rejected', () => {
  const f = repo({ manifest: (m) => (m.framework = 'other-fw') });
  expectProblem(demoProblems(f), '!= registry framework');
});

test('manifest: registry/manifest status disagreement is rejected', () => {
  const f = repo({ manifest: (m) => (m.status = 'reference') });
  expectProblem(demoProblems(f), '!= registry status');
});

test('manifest: absolute root is rejected', () => {
  const f = repo({ manifest: (m) => (m.root = '/tmp') });
  expectProblem(demoProblems(f), 'root must be relative');
});

test("manifest: boilerplate root with '..' is rejected", () => {
  const f = repo({ manifest: (m) => (m.root = '../other') });
  expectProblem(demoProblems(f), "boilerplate root must not contain '..'");
});

test('manifest: boilerplate root resolving to repository root is rejected', () => {
  const f = repo();
  // Same containment shape, but the repo root IS the resolved app root.
  const registry = {
    name: 'demo',
    path: 'demo',
    framework: 'demo-framework',
    status: 'boilerplate',
  };
  const problems = validateSkeleton(registry, {
    repoRoot: f.skeletonDir,
    skeletonsDir: f.skeletonsDir,
  });
  expectProblem(problems, 'must not resolve to the repository root');
});

test('manifest: boilerplate declaring referenceRoot is rejected', () => {
  const f = repo({ manifest: (m) => (m.referenceRoot = '.') });
  expectProblem(demoProblems(f), "only allowed on 'reference' skeletons");
});

test('manifest: reference skeleton without referenceRoot is rejected', () => {
  const f = repo({
    registry: (r) => (r.skeletons[0].status = 'reference'),
    manifest: (m) => (m.status = 'reference'),
  });
  expectProblem(demoProblems(f), "explicit 'referenceRoot' contract");
});

test('manifest: reference root not matching referenceRoot is rejected', () => {
  const f = repo({
    registry: (r) => (r.skeletons[0].status = 'reference'),
    manifest: (m) => {
      m.status = 'reference';
      m.root = '.';
      m.referenceRoot = '../..';
    },
  });
  expectProblem(demoProblems(f), 'does not match declared referenceRoot');
});

test('manifest: unsupported package manager is rejected', () => {
  const f = repo({ manifest: (m) => (m.packageManager = 'npm@10.0.0') });
  expectProblem(demoProblems(f), "unsupported package manager 'npm'");
});

test('manifest: boilerplate packageManager without pinned version is rejected', () => {
  const f = repo({ manifest: (m) => (m.packageManager = 'pnpm') });
  expectProblem(demoProblems(f), 'must pin a version');
});

test('manifest: malformed command is rejected', () => {
  const f = repo({
    manifest: (m) => (m.commands.dev = 'pnpm dev && rm -rf /'),
  });
  expectProblem(demoProblems(f), 'malformed commands.dev');
});

test('manifest: missing commands.build is rejected', () => {
  const f = repo({ manifest: (m) => delete m.commands.build });
  expectProblem(demoProblems(f), 'missing commands.build');
});

test('manifest: missing entrypoint declaration is rejected', () => {
  const f = repo({ manifest: (m) => delete m.entrypoints.home });
  expectProblem(demoProblems(f), 'missing entrypoints.home');
});

test('manifest: missing entrypoint file is rejected', () => {
  const f = repo();
  fs.rmSync(path.join(f.skeletonDir, 'app/page.tsx'));
  expectProblem(demoProblems(f), 'entrypoints.home not found');
});

test('manifest: non-file entrypoint is rejected', () => {
  const f = repo({ manifest: (m) => (m.entrypoints.home = 'app') });
  expectProblem(demoProblems(f), 'entrypoints.home is not a file');
});

test('manifest: entrypoint symlink escaping the skeleton root is rejected', () => {
  const f = repo();
  const outside = path.join(f.repoRoot, 'outside.tsx');
  fs.writeFileSync(outside, 'export default 1;\n');
  fs.rmSync(path.join(f.skeletonDir, 'app/page.tsx'));
  fs.symlinkSync(outside, path.join(f.skeletonDir, 'app/page.tsx'));
  expectProblem(demoProblems(f), 'escapes the skeleton root via symlink');
});

test('manifest: missing package.json is rejected', () => {
  const f = repo();
  fs.rmSync(path.join(f.skeletonDir, 'package.json'));
  expectProblem(demoProblems(f), 'missing or invalid package.json');
});

test('manifest: packageManager mismatch with package.json is rejected', () => {
  const f = repo({ pkg: (p) => (p.packageManager = 'pnpm@9.0.0') });
  expectProblem(demoProblems(f), 'packageManager "pnpm@9.0.0" != manifest');
});

test('manifest: missing required script (build) is rejected', () => {
  const f = repo({ pkg: (p) => delete p.scripts.build });
  expectProblem(demoProblems(f), "missing required script 'build'");
});

test('manifest: invalid npm package name in package.json is rejected', () => {
  const f = repo({ pkg: (p) => (p.name = 'INVALID NAME') });
  expectProblem(demoProblems(f), 'not a valid npm package name');
});

test('manifest: missing shared tokens file is rejected', () => {
  const f = repo();
  fs.rmSync(path.join(f.skeletonDir, 'app/tokens.css'));
  expectProblem(demoProblems(f), 'designSystem.tokens not found');
});

test('manifest: token drift from _shared/design-tokens.css is rejected', () => {
  const f = repo();
  fs.appendFileSync(
    path.join(f.skeletonDir, 'app/tokens.css'),
    '/* drift */\n'
  );
  expectProblem(demoProblems(f), 'drifted from _shared/design-tokens.css');
});

test('manifest: global CSS missing the tokens import is rejected', () => {
  const f = repo();
  fs.writeFileSync(
    path.join(f.skeletonDir, 'app/globals.css'),
    "@import 'tailwindcss';\n"
  );
  expectProblem(demoProblems(f), 'does not @import designSystem.tokens');
});

test('manifest: serif display font is rejected', () => {
  const f = repo({ manifest: (m) => (m.designSystem.display = 'Fraunces') });
  expectProblem(demoProblems(f), 'serif');
});

test('manifest: non-numeric tailwind capability is rejected', () => {
  const f = repo({ manifest: (m) => (m.designSystem.tailwind = 'four') });
  expectProblem(demoProblems(f), 'designSystem.tailwind must be a number');
});

test('manifest: pollux support without targetAdapter is rejected', () => {
  const f = repo({ manifest: (m) => (m.generatorSupport = { pollux: true }) });
  expectProblem(demoProblems(f), 'no targetAdapter {id, capabilityLevel}');
});

test('manifest: pollux support with adapter id + capability level passes', () => {
  const f = repo({
    manifest: (m) =>
      (m.generatorSupport = {
        pollux: true,
        targetAdapter: { id: 'demo-adapter', capabilityLevel: 'full' },
      }),
  });
  assert.deepEqual(demoProblems(f), []);
});

// ------------------------------------------------------------------- helpers

test('npm package name validation', () => {
  assert.equal(isValidNpmPackageName('my-app'), true);
  assert.equal(isValidNpmPackageName('@scope/my-app'), true);
  assert.equal(isValidNpmPackageName('INVALID NAME'), false);
  assert.equal(isValidNpmPackageName('.hidden'), false);
  assert.equal(isValidNpmPackageName(''), false);
  assert.equal(isValidNpmPackageName('a'.repeat(215)), false);
});

test('parseCommand splits argv and rejects shell metacharacters', () => {
  assert.deepEqual(parseCommand('pnpm dev'), {
    command: 'pnpm',
    args: ['dev'],
  });
  assert.equal(parseCommand('pnpm dev; rm -rf /'), null);
  assert.equal(parseCommand(''), null);
});
