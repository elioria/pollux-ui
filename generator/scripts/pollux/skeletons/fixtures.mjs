// Test-only fixture builders for the skeleton unit specs. Builds a minimal
// fake repository (skeletons/ + registry + one boilerplate) in a temp dir so
// tests never mutate the real skeletons.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const TOKENS_CSS =
  ':root {\n  --background: #fff;\n  --primary: #123;\n}\n';

export const baseManifest = () => ({
  schemaVersion: 1,
  version: '1.0.0',
  name: 'demo',
  displayName: 'Demo Skeleton',
  framework: 'demo-framework',
  language: 'typescript',
  status: 'boilerplate',
  root: '.',
  packageManager: 'pnpm@10.24.0',
  entrypoints: {
    layout: 'app/layout.tsx',
    globalStyles: 'app/globals.css',
    home: 'app/page.tsx',
  },
  designSystem: {
    tokens: 'app/tokens.css',
    display: 'Montserrat',
    body: 'Inter',
    tailwind: 4,
  },
  commands: { dev: 'pnpm dev', build: 'pnpm build' },
  generatorSupport: { pollux: false },
});

export const basePackageJson = () => ({
  name: 'demo-skeleton',
  version: '0.1.0',
  private: true,
  scripts: { dev: 'demo dev', build: 'demo build' },
  packageManager: 'pnpm@10.24.0',
});

export const baseRegistry = () => ({
  schemaVersion: 1,
  version: 1,
  sharedTokens: '_shared/design-tokens.css',
  skeletons: [
    {
      name: 'demo',
      path: 'demo',
      framework: 'demo-framework',
      status: 'boilerplate',
    },
  ],
});

const writeJson = (file, value) =>
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');

/**
 * Build a fake repo under os.tmpdir(). Returns { repoRoot, skeletonsDir,
 * skeletonDir }. Mutators may edit registry/manifest/package before write.
 *
 * @param {object} [opts]
 * @param {(r: object) => void} [opts.registry]
 * @param {(m: object) => void} [opts.manifest]
 * @param {(p: object) => void} [opts.pkg]
 * @param {boolean} [opts.lockfile=true]
 * @param {boolean} [opts.git=false] init a git repo and commit everything
 */
export function makeFixtureRepo(opts = {}) {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pollux-skel-'));
  const skeletonsDir = path.join(repoRoot, 'skeletons');
  const skeletonDir = path.join(skeletonsDir, 'demo');
  fs.mkdirSync(path.join(skeletonsDir, '_shared'), { recursive: true });
  fs.mkdirSync(path.join(skeletonDir, 'app'), { recursive: true });

  fs.writeFileSync(
    path.join(skeletonsDir, '_shared/design-tokens.css'),
    TOKENS_CSS
  );

  const registry = baseRegistry();
  opts.registry?.(registry);
  writeJson(path.join(skeletonsDir, 'registry.json'), registry);

  const manifest = baseManifest();
  opts.manifest?.(manifest);
  writeJson(path.join(skeletonDir, 'skeleton.json'), manifest);

  const pkg = basePackageJson();
  opts.pkg?.(pkg);
  writeJson(path.join(skeletonDir, 'package.json'), pkg);

  fs.writeFileSync(
    path.join(skeletonDir, 'app/layout.tsx'),
    'export default function Layout() {}\n'
  );
  fs.writeFileSync(
    path.join(skeletonDir, 'app/globals.css'),
    "@import 'tailwindcss';\n@import './tokens.css';\n"
  );
  fs.writeFileSync(
    path.join(skeletonDir, 'app/page.tsx'),
    'export default function Page() {}\n'
  );
  fs.writeFileSync(path.join(skeletonDir, 'app/tokens.css'), TOKENS_CSS);
  if (opts.lockfile !== false) {
    fs.writeFileSync(
      path.join(skeletonDir, 'pnpm-lock.yaml'),
      "lockfileVersion: '9.0'\n"
    );
  }
  // Artifacts that must never reach a workspace copy.
  fs.mkdirSync(path.join(skeletonDir, 'node_modules/some-dep'), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(skeletonDir, 'node_modules/some-dep/index.js'),
    '// never copied\n'
  );
  fs.mkdirSync(path.join(skeletonDir, '.next'), { recursive: true });
  fs.writeFileSync(path.join(skeletonDir, '.next/trace'), 'artifact\n');

  if (opts.git) {
    const gitEnv = {
      ...process.env,
      GIT_AUTHOR_NAME: 'test',
      GIT_AUTHOR_EMAIL: 'test@example.com',
      GIT_COMMITTER_NAME: 'test',
      GIT_COMMITTER_EMAIL: 'test@example.com',
    };
    const git = (...a) =>
      execFileSync('git', a, { cwd: repoRoot, env: gitEnv, stdio: 'pipe' });
    git('init', '-q');
    git('add', '-A');
    git('commit', '-q', '-m', 'fixture');
  }

  return { repoRoot, skeletonsDir, skeletonDir };
}

export function cleanupFixture(repoRoot) {
  fs.rmSync(repoRoot, { recursive: true, force: true });
}
