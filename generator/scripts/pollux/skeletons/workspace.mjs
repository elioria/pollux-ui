// Staged, atomic workspace creation from a boilerplate skeleton (SPEC-001).
// Pure module: returns a result object or throws SkeletonError; never exits,
// never prints. The transaction phases are numbered to match the SPEC.
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { ERROR_CODES, SkeletonError } from './errors.mjs';
import {
  getSkeletonEntry,
  loadRegistry,
  requireValidSkeleton,
  skeletonContext,
} from './registry.mjs';
import {
  isValidNpmPackageName,
  parseCommand,
  parsePackageManagerSpec,
  PROVENANCE_SCHEMA_VERSION,
  REQUIRED_ENTRYPOINTS,
} from './schema.mjs';
import { MODEL_VERSION } from '../model/schema.mjs';

// Build/VCS artifacts never copied into a new workspace. pnpm-lock.yaml is
// deliberately NOT excluded: each boilerplate commits its lockfile and the
// copy installs with `pnpm install --frozen-lockfile`.
export const WORKSPACE_COPY_EXCLUDES = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  '.astro',
  '.react-router',
  '.tanstack',
  '.nitro',
  '.output',
  '.cache',
]);

// The normalized entity model version recorded into workspace provenance.
// Kept in lockstep with scripts/pollux/model/schema.mjs MODEL_VERSION: the
// generator (scripts/pollux/targets/protocol.mjs planEntity) rejects any
// workspace whose recorded metadataModelVersion differs from MODEL_VERSION,
// so a drift here would make every fresh workspace ungeneratable.
export const METADATA_MODEL_VERSION = MODEL_VERSION;

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

const isWithin = (parent, child) => {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
};

// Phase 2 — classify the destination.
function classifyDestination(dest) {
  let st;
  try {
    st = fs.statSync(dest);
  } catch {
    return 'absent';
  }
  if (!st.isDirectory()) return 'non-directory';
  return fs.readdirSync(dest).length === 0 ? 'empty' : 'non-empty';
}

// Phase 3 — resolve and validate every source entry before creating output.
// Returns a flat, sorted entry list; rejects symlinks escaping the skeleton.
function resolveSourceEntries(srcRoot) {
  const realRoot = fs.realpathSync(srcRoot);
  const entries = [];
  const walk = (rel) => {
    const abs = path.join(srcRoot, rel);
    for (const dirent of fs
      .readdirSync(abs, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name))) {
      const childRel = rel === '' ? dirent.name : path.join(rel, dirent.name);
      if (WORKSPACE_COPY_EXCLUDES.has(dirent.name)) continue;
      // The manifest stays behind — the copy is a plain app, not a skeleton.
      if (childRel === 'skeleton.json') continue;
      const childAbs = path.join(srcRoot, childRel);
      const lst = fs.lstatSync(childAbs);
      if (lst.isSymbolicLink()) {
        let real;
        try {
          real = fs.realpathSync(childAbs);
        } catch {
          throw new SkeletonError(
            ERROR_CODES.COPY_FAILED,
            `broken symlink in skeleton source: ${childRel}`,
            { details: { entry: childRel } }
          );
        }
        if (!isWithin(realRoot, real)) {
          throw new SkeletonError(
            ERROR_CODES.COPY_FAILED,
            `symlink escapes the skeleton root: ${childRel}`,
            {
              details: { entry: childRel },
              hint: 'skeleton sources must be self-contained; remove or inline the symlink',
            }
          );
        }
        entries.push({
          rel: childRel,
          type: 'symlink',
          linkTarget: fs.readlinkSync(childAbs),
        });
        continue;
      }
      if (lst.isDirectory()) {
        entries.push({ rel: childRel, type: 'dir' });
        walk(childRel);
      } else if (lst.isFile()) {
        entries.push({ rel: childRel, type: 'file' });
      }
      // Sockets/FIFOs/devices are silently skipped.
    }
  };
  walk('');
  return entries;
}

// Digest over registry + selected manifest + copied tree + shared files.
// Deterministic for identical content; independent of absolute paths.
function computeDigest({ ctx, entry, srcRoot, entries }) {
  const lines = [];
  const addFile = (label, absPath) => {
    lines.push(`${label} ${sha256(fs.readFileSync(absPath))}`);
  };
  addFile('registry.json', path.join(ctx.skeletonsDir, 'registry.json'));
  addFile(
    'skeleton.json',
    path.join(ctx.skeletonsDir, entry.path, 'skeleton.json')
  );
  const sharedDir = path.join(ctx.skeletonsDir, '_shared');
  if (fs.existsSync(sharedDir)) {
    for (const f of fs.readdirSync(sharedDir).sort()) {
      const abs = path.join(sharedDir, f);
      if (fs.statSync(abs).isFile()) addFile(`shared/${f}`, abs);
    }
  }
  for (const e of entries) {
    const label = `tree/${e.rel.split(path.sep).join('/')}`;
    if (e.type === 'file') addFile(label, path.join(srcRoot, e.rel));
    else if (e.type === 'symlink')
      lines.push(`${label} link:${sha256(Buffer.from(e.linkTarget))}`);
    else lines.push(`${label} dir`);
  }
  lines.sort();
  return `sha256:${sha256(Buffer.from(lines.join('\n')))}`;
}

// Source revision + dirty flag from git; tolerant of non-git fixtures.
function gitState(ctx, entry) {
  const opts = {
    cwd: ctx.repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  };
  let revision = null;
  let dirty = true;
  try {
    revision = execFileSync('git', ['rev-parse', 'HEAD'], opts).trim();
    const skelPrefix = path.relative(
      ctx.repoRoot,
      path.join(ctx.skeletonsDir, entry.path)
    );
    const registryRel = path.relative(
      ctx.repoRoot,
      path.join(ctx.skeletonsDir, 'registry.json')
    );
    const sharedRel = path.relative(
      ctx.repoRoot,
      path.join(ctx.skeletonsDir, '_shared')
    );
    const status = execFileSync(
      'git',
      ['status', '--porcelain', '--', registryRel, skelPrefix, sharedRel],
      opts
    );
    dirty = status.trim().length > 0;
  } catch {
    revision = null;
    dirty = true;
  }
  return { revision, dirty };
}

function copyEntries({ srcRoot, stagingDir, entries, hooks }) {
  for (const e of entries) {
    try {
      hooks?.onCopyEntry?.(e);
      const target = path.join(stagingDir, e.rel);
      if (e.type === 'dir') fs.mkdirSync(target, { recursive: true });
      else if (e.type === 'symlink') fs.symlinkSync(e.linkTarget, target);
      else {
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(path.join(srcRoot, e.rel), target);
      }
    } catch (err) {
      if (err instanceof SkeletonError) throw err;
      throw new SkeletonError(
        ERROR_CODES.COPY_FAILED,
        `copy failed at '${e.rel}': ${err.message}`,
        { details: { entry: e.rel } }
      );
    }
  }
}

// Phase 7 — validate the staged package before it becomes the destination.
function validateStaged({ stagingDir, manifest, pkgName }) {
  const problems = [];
  const pkgFile = path.join(stagingDir, 'package.json');
  if (!fs.existsSync(pkgFile)) {
    problems.push('staged workspace has no package.json');
  } else {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
      if (pkg.name !== pkgName)
        problems.push(
          `staged package.json name '${pkg.name}' != requested '${pkgName}'`
        );
    } catch (e) {
      problems.push(`staged package.json is invalid JSON: ${e.message}`);
    }
  }
  if (!fs.existsSync(path.join(stagingDir, 'pnpm-lock.yaml')))
    problems.push('staged workspace has no pnpm-lock.yaml');
  for (const field of REQUIRED_ENTRYPOINTS) {
    const rel = manifest.entrypoints?.[field];
    if (rel && !fs.existsSync(path.join(stagingDir, rel)))
      problems.push(`staged workspace missing entrypoints.${field}: ${rel}`);
  }
  if (!fs.existsSync(path.join(stagingDir, '.pollux/workspace.json')))
    problems.push('staged workspace missing .pollux/workspace.json provenance');
  if (problems.length > 0) {
    throw new SkeletonError(
      ERROR_CODES.POST_COPY_VALIDATION_FAILED,
      `staged workspace failed validation (${problems.length} problem${problems.length === 1 ? '' : 's'})`,
      { details: { problems } }
    );
  }
}

/**
 * Create a new workspace from a boilerplate skeleton. Staged and atomic:
 * on any failure the destination is left exactly as found and no staging
 * directory remains.
 *
 * @param {object} options
 * @param {string} options.repoRoot repository root containing skeletons/
 * @param {string} options.skeleton skeleton name
 * @param {string} options.dir destination directory (absent or empty)
 * @param {string} [options.name] npm package name (default: basename of dir)
 * @param {string} [options.cliVersion]
 * @param {() => Date} [options.now]
 * @param {{onCopyEntry?: Function, afterStage?: Function}} [options.hooks]
 *   test-only fault injection points
 */
export function createWorkspace({
  repoRoot,
  skeleton,
  dir,
  name,
  cliVersion = '0',
  now = () => new Date(),
  hooks,
}) {
  const ctx = skeletonContext(repoRoot);

  // Phase 1 — arguments, skeleton validity, package name.
  const registry = loadRegistry(ctx);
  const entry = getSkeletonEntry(registry, skeleton);
  const manifest = requireValidSkeleton(entry, ctx);
  if (manifest.status !== 'boilerplate') {
    throw new SkeletonError(
      ERROR_CODES.SKELETON_NOT_COPYABLE,
      `skeleton '${skeleton}' is a '${manifest.status}' skeleton — it lives in place and cannot be copied out`,
      {
        details: { skeleton, status: manifest.status },
        hint: 'reference skeletons are used by cloning the repository, not by new-workspace',
      }
    );
  }
  const dest = path.resolve(dir);
  const pkgName = name ?? path.basename(dest);
  if (!isValidNpmPackageName(pkgName)) {
    throw new SkeletonError(
      ERROR_CODES.PACKAGE_NAME_INVALID,
      `invalid npm package name: ${JSON.stringify(pkgName)}`,
      {
        details: { name: pkgName },
        hint: 'use a lowercase, url-safe name (e.g. my-app) via --name=<pkg>',
      }
    );
  }

  // Phase 2 — classify the destination.
  const destState = classifyDestination(dest);
  if (destState === 'non-directory') {
    throw new SkeletonError(
      ERROR_CODES.DESTINATION_NOT_DIRECTORY,
      `destination is not a directory: ${dest}`,
      {
        details: { destination: dest },
        hint: 'point --dir at an absent path or an empty directory',
      }
    );
  }
  if (destState === 'non-empty') {
    throw new SkeletonError(
      ERROR_CODES.DESTINATION_NOT_EMPTY,
      `destination not empty: ${dest}`,
      {
        details: { destination: dest },
        hint: 'choose an absent or empty directory; this command never overwrites existing files',
      }
    );
  }

  // Phase 3 — resolve and validate every source entry before any output.
  const srcRoot = path.resolve(ctx.skeletonsDir, entry.path, manifest.root);
  const entries = resolveSourceEntries(srcRoot);
  const digest = computeDigest({ ctx, entry, srcRoot, entries });
  const { revision, dirty } = gitState(ctx, entry);

  // Phase 4 — staging directory in the destination's parent (same filesystem).
  const parent = path.dirname(dest);
  fs.mkdirSync(parent, { recursive: true });
  const suffix = crypto.randomBytes(6).toString('hex');
  const stagingDir = path.join(
    parent,
    `.pollux-staging-${path.basename(dest)}-${suffix}`
  );
  let movedAside = null;

  const rollback = () => {
    fs.rmSync(stagingDir, { recursive: true, force: true });
    if (movedAside && !fs.existsSync(dest)) {
      try {
        fs.renameSync(movedAside, dest);
      } catch {
        // destination reappeared meanwhile; drop the empty backup instead
        fs.rmSync(movedAside, { recursive: true, force: true });
      }
      movedAside = null;
    } else if (movedAside) {
      fs.rmSync(movedAside, { recursive: true, force: true });
      movedAside = null;
    }
  };

  try {
    fs.mkdirSync(stagingDir);

    // Phase 5 — copy with the allow/ignore policy.
    copyEntries({ srcRoot, stagingDir, entries, hooks });

    // Phase 6 — package rename + provenance.
    try {
      const pkgFile = path.join(stagingDir, 'package.json');
      if (fs.existsSync(pkgFile)) {
        const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
        pkg.name = pkgName;
        fs.writeFileSync(pkgFile, JSON.stringify(pkg, null, 2) + '\n');
      }
      const provenance = {
        schemaVersion: PROVENANCE_SCHEMA_VERSION,
        skeleton: entry.name,
        framework: manifest.framework,
        manifestVersion: manifest.version ?? null,
        sourcePath: `skeletons/${entry.path}`,
        sourceRevision: revision,
        cliVersion,
        createdAt: now().toISOString(),
        metadataModelVersion: METADATA_MODEL_VERSION,
        digest,
        dirty,
        // 'supported' requires generatorSupport.pollux true; 'experimental'
        // is the SPEC-007 pre-promotion state (adapter declared, matrix not
        // yet required). Placeholder identities are forbidden by SPEC-001,
        // so adapter identity is null whenever no adapter is declared.
        targetStatus:
          manifest.generatorSupport?.pollux === true
            ? 'supported'
            : manifest.generatorSupport?.experimental === true &&
                manifest.generatorSupport?.targetAdapter?.id
              ? 'experimental'
              : 'unsupported',
        targetAdapter: manifest.generatorSupport?.targetAdapter?.id
          ? {
              id: manifest.generatorSupport.targetAdapter.id,
              version: manifest.generatorSupport.targetAdapter.version ?? null,
            }
          : { id: null, version: null },
      };
      const polluxDir = path.join(stagingDir, '.pollux');
      fs.mkdirSync(polluxDir, { recursive: true });
      fs.writeFileSync(
        path.join(polluxDir, 'workspace.json'),
        JSON.stringify(provenance, null, 2) + '\n'
      );
      hooks?.afterStage?.(stagingDir);

      // Phase 7 — validate the staged package.
      validateStaged({ stagingDir, manifest, pkgName });

      // Phase 8 — atomic promotion.
      if (destState === 'empty') {
        movedAside = path.join(
          parent,
          `.pollux-backup-${path.basename(dest)}-${suffix}`
        );
        fs.renameSync(dest, movedAside);
      }
      fs.renameSync(stagingDir, dest);
      if (movedAside) {
        fs.rmdirSync(movedAside);
        movedAside = null;
      }

      const pmName =
        parsePackageManagerSpec(manifest.packageManager)?.name ?? 'pnpm';
      const devCmd = parseCommand(manifest.commands.dev);
      const steps = [
        {
          cwd: dest,
          command: pmName,
          args: ['install', '--frozen-lockfile'],
        },
        { cwd: dest, command: devCmd.command, args: devCmd.args },
      ];
      const next = [
        `cd ${dest}`,
        `${pmName} install --frozen-lockfile`,
        manifest.commands.dev,
      ];
      return {
        skeleton: entry.name,
        workspace: dest,
        package: pkgName,
        provenance,
        dirty,
        next,
        steps,
      };
    } catch (err) {
      if (err instanceof SkeletonError) throw err;
      throw new SkeletonError(
        ERROR_CODES.POST_COPY_VALIDATION_FAILED,
        `post-copy staging failed: ${err.message}`,
        { details: { stage: 'post-copy' } }
      );
    }
  } catch (err) {
    // Phase 9 — full rollback: no staging leftovers, destination as found.
    rollback();
    throw err;
  }
}
