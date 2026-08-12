#!/usr/bin/env node
// SPEC-007 — prove a generated workspace has NO dependency on this source
// checkout. Zero-dependency Node script; also invoked by the workspace
// matrix harness (scripts/pollux/test/workspace-matrix.mjs).
//
// Checks, in order:
//   1. import escape  — every relative import/require/@import specifier in
//      workspace source files must resolve inside the workspace root;
//   2. absolute paths — no source file may contain the absolute path of this
//      repository checkout (or any absolute path into it);
//   3. lockfile       — pnpm-lock.yaml must exist and must not carry `link:`
//      protocols or `file:` specifiers that reach outside the workspace.
//
// Usage:
//   node scripts/pollux/test/no-source-dependency.mjs --workspace <path> [--json]
//
// Exit 0 when clean; exit 1 with a violation list otherwise.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, '../../..');

/** Directories that are build output / dependency caches, never sources. */
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.next',
  '.astro',
  '.react-router',
  '.tanstack',
  '.nitro',
  '.output',
  '.wrangler',
  '.turbo',
  '.cache',
  'build',
  'dist',
  'out',
]);

/** Extensions scanned for import specifiers. */
const CODE_EXTS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.mts',
  '.cts',
  '.astro',
]);

/** Extensions scanned for absolute-path leakage (code + config + styles). */
const TEXT_EXTS = new Set([
  ...CODE_EXTS,
  '.css',
  '.json',
  '.jsonc',
  '.yaml',
  '.yml',
  '.md',
  '.env',
  '.example',
]);

// import x from '..'; export ... from '..'; import('..'); require('..')
const IMPORT_PATTERNS = [
  /\bimport\s+[^'"()]*?from\s*['"]([^'"]+)['"]/g,
  /\bexport\s+[^'"()]*?from\s*['"]([^'"]+)['"]/g,
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\bimport\s*['"]([^'"]+)['"]/g, // bare side-effect import
  /@import\s+(?:url\(\s*)?['"]([^'"]+)['"]/g, // CSS
];

const isWithin = (parent, candidate) => {
  const rel = path.relative(parent, candidate);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
};

function* walk(dir, rel = '') {
  const entries = fs
    .readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue; // resolved separately below
    const childRel = rel === '' ? entry.name : `${rel}/${entry.name}`;
    const childAbs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      yield* walk(childAbs, childRel);
    } else if (entry.isFile()) {
      yield { rel: childRel, abs: childAbs };
    }
  }
}

const specifiersIn = (content) => {
  const found = new Set();
  for (const pattern of IMPORT_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of content.matchAll(pattern)) {
      found.add(match[1]);
    }
  }
  return [...found];
};

/**
 * Scan one workspace. Pure: returns { ok, violations, scannedFiles }.
 * @param {string} workspace absolute workspace root
 * @param {string} [repoRoot] source checkout root to hunt for in file bytes
 */
export function scanWorkspace(workspace, repoRoot = REPO_ROOT) {
  const violations = [];
  let scannedFiles = 0;
  const workspaceReal = fs.realpathSync(workspace);

  for (const { rel, abs } of walk(workspaceReal)) {
    const ext = path.extname(rel).toLowerCase();
    const base = path.basename(rel);
    const isLockfile = base === 'pnpm-lock.yaml';
    if (!TEXT_EXTS.has(ext) && !isLockfile && base !== '.env.example') continue;
    scannedFiles += 1;
    const content = fs.readFileSync(abs, 'utf8');

    // 2. absolute source-checkout paths embedded in any scanned file.
    if (content.includes(repoRoot)) {
      violations.push({
        file: rel,
        kind: 'absolute-repo-path',
        detail: `contains the source checkout path '${repoRoot}'`,
      });
    }

    // 1. relative import specifiers escaping the workspace.
    if (CODE_EXTS.has(ext) || ext === '.css') {
      for (const spec of specifiersIn(content)) {
        if (spec.startsWith('./') || spec.startsWith('../')) {
          const resolved = path.resolve(path.dirname(abs), spec);
          if (!isWithin(workspaceReal, resolved)) {
            violations.push({
              file: rel,
              kind: 'import-escape',
              detail: `relative import '${spec}' resolves outside the workspace (${resolved})`,
            });
          }
        } else if (path.isAbsolute(spec)) {
          violations.push({
            file: rel,
            kind: 'absolute-import',
            detail: `absolute import specifier '${spec}'`,
          });
        }
      }
    }

    // 3. lockfile integrity: no link:, no escaping/absolute file: specifiers.
    if (isLockfile) {
      for (const [index, line] of content.split('\n').entries()) {
        if (/(?:^|[\s'"(:])link:/.test(line)) {
          violations.push({
            file: rel,
            kind: 'lockfile-link',
            detail: `line ${index + 1}: 'link:' protocol in lockfile — resolves outside the committed dependency graph`,
          });
        }
        const fileSpec = line.match(/file:([^'",\s)]+)/);
        if (fileSpec) {
          const target = fileSpec[1];
          if (target.startsWith('..') || path.isAbsolute(target)) {
            violations.push({
              file: rel,
              kind: 'lockfile-file-escape',
              detail: `line ${index + 1}: 'file:${target}' escapes the workspace`,
            });
          }
        }
      }
    }
  }

  // Escaping symlinks anywhere in the tree (excluding skipped dirs).
  const checkSymlinks = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) {
        const abs = path.join(dir, entry.name);
        let target;
        try {
          target = fs.realpathSync(abs);
        } catch {
          continue; // broken symlink cannot resolve into the checkout
        }
        if (!isWithin(workspaceReal, target)) {
          violations.push({
            file: path.relative(workspaceReal, abs),
            kind: 'symlink-escape',
            detail: `symlink resolves outside the workspace (${target})`,
          });
        }
      } else if (entry.isDirectory() && !SKIP_DIRS.has(entry.name)) {
        checkSymlinks(path.join(dir, entry.name));
      }
    }
  };
  checkSymlinks(workspaceReal);

  if (!fs.existsSync(path.join(workspaceReal, 'pnpm-lock.yaml'))) {
    violations.push({
      file: 'pnpm-lock.yaml',
      kind: 'lockfile-missing',
      detail:
        'workspace has no committed pnpm-lock.yaml — builds are not reproducible',
    });
  }

  return { ok: violations.length === 0, violations, scannedFiles };
}

// ------------------------------------------------------------------- CLI

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const wsIndex = args.findIndex((a) => a === '--workspace');
  const inline = args.find((a) => a.startsWith('--workspace='));
  const workspace = inline
    ? inline.slice('--workspace='.length)
    : wsIndex !== -1
      ? args[wsIndex + 1]
      : undefined;
  if (!workspace) {
    console.error(
      'usage: node scripts/pollux/test/no-source-dependency.mjs --workspace <path> [--json]'
    );
    process.exit(2);
  }
  const result = scanWorkspace(path.resolve(workspace));
  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else if (result.ok) {
    console.log(
      `no-source-dependency: OK (${result.scannedFiles} files scanned, no checkout dependency)`
    );
  } else {
    console.error(
      `no-source-dependency: ${result.violations.length} violation(s):`
    );
    for (const v of result.violations) {
      console.error(`  [${v.kind}] ${v.file}: ${v.detail}`);
    }
  }
  process.exit(result.ok ? 0 : 1);
}
