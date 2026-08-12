// Shared zero-dependency helpers for the pollux-ui plugin build/validate
// scripts. Implements the SPEC-005 stable plugin error codes, path/symlink
// safety, hashing, and deterministic JSON serialization.
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const PLUGIN_ROOT = path.resolve(HERE, '..', '..');
export const REPO_ROOT = path.resolve(PLUGIN_ROOT, '..', '..');

export const ERROR_CODES = Object.freeze({
  PLUGIN_MANIFEST_INVALID: 'PLUGIN_MANIFEST_INVALID',
  RESOURCE_CATALOG_INVALID: 'RESOURCE_CATALOG_INVALID',
  RESOURCE_DRIFT: 'RESOURCE_DRIFT',
  HOST_PROJECTION_INVALID: 'HOST_PROJECTION_INVALID',
  CAPABILITY_UNSUPPORTED: 'CAPABILITY_UNSUPPORTED',
  TARGET_EXPERIMENTAL: 'TARGET_EXPERIMENTAL',
  PATH_UNSAFE: 'PATH_UNSAFE',
  SOURCE_DIRTY: 'SOURCE_DIRTY',
  GENERATED_PATH_DIRTY: 'GENERATED_PATH_DIRTY',
  WORKFLOW_PRECONDITION_FAILED: 'WORKFLOW_PRECONDITION_FAILED',
  VERIFICATION_FAILED: 'VERIFICATION_FAILED',
  PUBLISHER_METADATA_REQUIRED: 'PUBLISHER_METADATA_REQUIRED',
  USAGE: 'USAGE',
  INTERNAL: 'INTERNAL',
});

export class PluginError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = 'PluginError';
    this.code = code;
    this.details = details;
  }
  toJSON() {
    return {
      ok: false,
      code: this.code,
      message: this.message,
      ...(this.details ? { details: this.details } : {}),
    };
  }
}

export const isPluginError = (err) => err instanceof PluginError;

const JSON_FLAG = '--json';

export const parseCli = (argv) => {
  const flags = {};
  const rest = [];
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === JSON_FLAG) {
      flags.json = true;
      continue;
    }
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq > 2) {
        flags[a.slice(2, eq)] = a.slice(eq + 1);
      } else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
        flags[a.slice(2)] = argv[i + 1];
        i += 1;
      } else {
        flags[a.slice(2)] = true;
      }
      continue;
    }
    rest.push(a);
  }
  return { flags, rest, json: Boolean(flags.json) };
};

export const reportError = (err, { json = false } = {}) => {
  const normalized = isPluginError(err)
    ? err
    : new PluginError(ERROR_CODES.INTERNAL, err?.message ?? String(err));
  if (json) {
    console.log(JSON.stringify(normalized.toJSON(), null, 2));
  } else {
    console.error(`pollux-ui: [${normalized.code}] ${normalized.message}`);
    for (const p of normalized.details?.problems ?? []) {
      console.error(`  - ${p}`);
    }
  }
  process.exit(1);
};

// ---------------------------------------------------------------- semver

const SEMVER_RE =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

export const isSemver = (v) => typeof v === 'string' && SEMVER_RE.test(v);

const IDENTIFIER_RE = /^(0|[1-9]\d*|[0-9A-Za-z-]+)$/;

// Explicit range syntax: "^1.2.3", "~1.2.3", ">=1.0.0 <2.0.0", exact "1.2.3".
export const isSemverRange = (v) => {
  if (typeof v !== 'string' || v.trim() === '') return false;
  return v
    .trim()
    .split(/\s+/)
    .every((part) => {
      const m = part.match(/^(>=|<=|>|<|\^|~)?(.+)$/);
      if (!m) return false;
      const core = m[2];
      if (SEMVER_RE.test(core)) return true;
      // allow partial versions inside ranges (e.g. ^0, >=1.2)
      return core.split('.').every((seg) => IDENTIFIER_RE.test(seg));
    });
};

// ---------------------------------------------------------------- hashing

export const sha256Hex = (buf) =>
  crypto.createHash('sha256').update(buf).digest('hex');

export const hashFile = (absPath) => sha256Hex(fs.readFileSync(absPath));

// Deterministic JSON: sorted keys, trailing newline.
export const stableStringify = (value) =>
  `${JSON.stringify(sortKeysDeep(value), null, 2)}\n`;

const sortKeysDeep = (value) => {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, sortKeysDeep(value[k])])
    );
  }
  return value;
};

export const writeJson = (absPath, value) => {
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, stableStringify(value));
};

export const readJson = (absPath) =>
  JSON.parse(fs.readFileSync(absPath, 'utf8'));

// Normalized manifest digest: excludes the declared builtAt timestamp.
export const manifestDigest = (manifest) => {
  const { source, ...rest } = manifest;
  const normalizedSource = source ? { ...source, builtAt: undefined } : source;
  const normalized = { ...rest, source: normalizedSource };
  return sha256Hex(Buffer.from(stableStringify(normalized), 'utf8'));
};

// Tree digest over sorted relative paths + per-file hashes.
export const treeDigest = (entries) =>
  sha256Hex(
    Buffer.from(entries.map((e) => `${e.path}  ${e.sha256}`).join('\n'), 'utf8')
  );

export const directoryDigest = (root) => {
  const entries = [];
  const walk = (dir) => {
    for (const entry of fs
      .readdirSync(dir, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) {
        entries.push({
          path: path.relative(root, full).split(path.sep).join('/'),
          sha256: hashFile(full),
        });
      }
    }
  };
  walk(root);
  return treeDigest(entries);
};

// ---------------------------------------------------------------- paths

const REPO_RELATIVE_RE = /^[A-Za-z0-9_][A-Za-z0-9._/()-]*$/;

export const assertRepoRelativePath = (p, code = ERROR_CODES.PATH_UNSAFE) => {
  if (
    typeof p !== 'string' ||
    p === '' ||
    path.isAbsolute(p) ||
    p.includes('..') ||
    p.includes('\\') ||
    !REPO_RELATIVE_RE.test(p)
  ) {
    throw new PluginError(code, `unsafe repository-relative path: '${p}'`, {
      path: p,
    });
  }
};

// Package paths must be plugin-relative, start with ./, and resolve inside
// the plugin root.
export const resolvePackagePath = (p, pluginRoot = PLUGIN_ROOT) => {
  if (typeof p !== 'string' || !p.startsWith('./')) {
    throw new PluginError(
      ERROR_CODES.PATH_UNSAFE,
      `package path must start with './': '${p}'`,
      { path: p }
    );
  }
  const resolved = path.resolve(pluginRoot, p);
  const rel = path.relative(pluginRoot, resolved);
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new PluginError(
      ERROR_CODES.PATH_UNSAFE,
      `package path escapes plugin root: '${p}'`,
      { path: p }
    );
  }
  return resolved;
};

// Reject symlinks whose real path escapes the allowed root.
export const assertNoEscapingSymlinks = (absPath, allowedRoot) => {
  const real = fs.realpathSync(absPath);
  const rel = path.relative(allowedRoot, real);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new PluginError(
      ERROR_CODES.PATH_UNSAFE,
      `symlink escapes allowed root: ${absPath}`,
      { path: absPath, real }
    );
  }
  return real;
};

// ---------------------------------------------------------------- git

const git = (args, repoRoot = REPO_ROOT) =>
  execFileSync('git', ['-C', repoRoot, ...args], { encoding: 'utf8' });

export const gitRevision = () => git(['rev-parse', 'HEAD']).trim();

export const reproducibleTimestamp = ({
  sourceDateEpoch = process.env.SOURCE_DATE_EPOCH,
  repoRoot = REPO_ROOT,
} = {}) => {
  const raw =
    sourceDateEpoch === undefined || sourceDateEpoch === ''
      ? git(['log', '-1', '--format=%ct'], repoRoot).trim()
      : sourceDateEpoch;
  if (!/^(0|[1-9]\d*)$/.test(raw)) {
    throw new PluginError(
      ERROR_CODES.PLUGIN_MANIFEST_INVALID,
      `SOURCE_DATE_EPOCH must be a non-negative integer, got '${raw}'`
    );
  }
  return new Date(Number(raw) * 1000).toISOString();
};

export const gitDirtyPaths = (repoRoot = REPO_ROOT) => {
  const records = git(
    ['status', '--porcelain=v1', '-z', '--untracked-files=all'],
    repoRoot
  ).split('\0');
  const paths = [];
  for (let i = 0; i < records.length; i += 1) {
    const record = records[i];
    if (!record) continue;
    const status = record.slice(0, 2);
    paths.push(record.slice(3));
    if (status.includes('R') || status.includes('C')) i += 1;
  }
  return paths;
};

// Dirty state restricted to a set of repo-relative source roots.
export const dirtyWithin = (roots, repoRoot = REPO_ROOT) =>
  gitDirtyPaths(repoRoot).filter((p) =>
    roots.some((root) => p === root || p.startsWith(`${root}/`))
  );

// ---------------------------------------------------------------- misc

export const listFilesRecursive = (absDir) => {
  const out = [];
  const walk = (dir) => {
    for (const entry of fs
      .readdirSync(dir, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() || entry.isSymbolicLink()) out.push(full);
    }
  };
  walk(absDir);
  return out;
};

export const PLUGIN_VERSION_FIELDS = Object.freeze([
  'plugin',
  'resourceCatalog',
  'skillContract',
]);
