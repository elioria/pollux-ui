#!/usr/bin/env node
// SPEC-001 — build the neutral pollux.plugin.json capability manifest from
// manifest.config.json plus live git provenance. Deterministic: two builds
// from the same clean revision produce identical bytes except `source.builtAt`.
//
// Usage:
//   node plugins/pollux-ui/scripts/build-manifest.mjs [--release] [--json]
//
// --release refuses to emit a manifest from a dirty source tree.
import fs from 'node:fs';
import path from 'node:path';

import {
  dirtyWithin,
  ERROR_CODES,
  gitRevision,
  isSemver,
  isSemverRange,
  manifestDigest,
  parseCli,
  PLUGIN_ROOT,
  PluginError,
  readJson,
  reportError,
  resolvePackagePath,
  writeJson,
} from './lib/common.mjs';
import { validateSchema } from './lib/json-schema.mjs';

const CONFIG_PATH = path.join(PLUGIN_ROOT, 'manifest.config.json');
const SCHEMA_PATH = path.join(PLUGIN_ROOT, 'pollux.plugin.schema.json');
const OUT_PATH = path.join(PLUGIN_ROOT, 'pollux.plugin.json');

// Repo-relative roots whose dirty state gates --release.
const CANONICAL_SOURCE_ROOTS = [
  '_templates/pollux',
  '_templates/pollux-targets',
  'skeletons',
  'scripts/pollux',
  'plugins/pollux-ui',
  'CLAUDE.md',
  'POLLUX-GEN-KB.md',
  'docs/operations',
];

const assert = (cond, code, message, details) => {
  if (!cond) throw new PluginError(code, message, details);
};

// Semantic + cross-reference validation beyond the JSON schema.
const validateManifest = (manifest) => {
  const schema = readJson(SCHEMA_PATH);
  const problems = validateSchema(manifest, schema);

  const capabilityIds = manifest.capabilities?.map((c) => c.id) ?? [];
  const skillIds = manifest.skills?.map((s) => s.id) ?? [];
  const dup = (arr) => arr.filter((id, i) => arr.indexOf(id) !== i);
  for (const id of dup(capabilityIds)) {
    problems.push(`duplicate capability id '${id}'`);
  }
  for (const id of dup(skillIds)) {
    problems.push(`duplicate skill id '${id}'`);
  }

  const skillSet = new Set(skillIds);
  for (const cap of manifest.capabilities ?? []) {
    for (const s of cap.skills ?? []) {
      if (!skillSet.has(s)) {
        problems.push(`capability '${cap.id}' references unknown skill '${s}'`);
      }
    }
  }

  const compat = manifest.compatibility ?? {};
  if (compat.resourceCatalog && !isSemver(compat.resourceCatalog)) {
    problems.push(`compatibility.resourceCatalog is not semver`);
  }
  if (compat.skillContract && !isSemver(compat.skillContract)) {
    problems.push(`compatibility.skillContract is not semver`);
  }
  for (const [key, value] of [
    ['polluxCli', compat.polluxCli],
    ['hosts.codex', compat.hosts?.codex],
    ['hosts.claudeCode', compat.hosts?.claudeCode],
  ]) {
    if (value !== undefined && !isSemverRange(value)) {
      problems.push(`compatibility.${key} is not an explicit semver range`);
    }
  }

  for (const ref of [
    manifest.resourceCatalog,
    manifest.projections?.codex,
    manifest.projections?.claudeCode,
    ...(manifest.skills ?? []).map((s) => s.path),
  ]) {
    if (typeof ref !== 'string') continue;
    try {
      resolvePackagePath(ref);
    } catch {
      problems.push(`path '${ref}' escapes the plugin root`);
    }
  }

  // Capabilities must not silently expand authority: only inspect/verify
  // modes may be read-only, and no capability may claim network access in
  // the first release.
  for (const cap of manifest.capabilities ?? []) {
    if (
      (cap.mode === 'inspect' || cap.mode === 'verify') &&
      cap.authority?.writesFilesystem
    ) {
      problems.push(
        `capability '${cap.id}' (${cap.mode}) must not write the filesystem`
      );
    }
    if (cap.authority?.networkAccess) {
      problems.push(`capability '${cap.id}' must not claim network access`);
    }
  }

  assert(
    problems.length === 0,
    ERROR_CODES.PLUGIN_MANIFEST_INVALID,
    'neutral manifest failed validation',
    { problems }
  );
  return manifest;
};

export const buildManifest = ({
  release = false,
  builtAt = new Date().toISOString(),
} = {}) => {
  const config = readJson(CONFIG_PATH);
  const revision = gitRevision();
  const dirtyPaths = dirtyWithin(CANONICAL_SOURCE_ROOTS);
  const dirty = dirtyPaths.length > 0;

  if (release && dirty) {
    throw new PluginError(
      ERROR_CODES.SOURCE_DIRTY,
      'refusing to build a release manifest from dirty canonical sources',
      { problems: dirtyPaths }
    );
  }

  const manifest = {
    schemaVersion: config.schemaVersion,
    name: config.name,
    version: config.version,
    description: config.description,
    ...(config.publisher ? { publisher: config.publisher } : {}),
    ...(config.license ? { license: config.license } : {}),
    source: {
      repository: config.repository,
      revision,
      dirty,
      builtAt,
    },
    compatibility: config.compatibility,
    capabilities: config.capabilities,
    skills: config.skills,
    resourceCatalog: './resources/catalog.json',
    projections: {
      codex: './.codex-plugin/plugin.json',
      claudeCode: './.claude-plugin/plugin.json',
    },
  };

  validateManifest(manifest);
  writeJson(OUT_PATH, manifest);
  return { manifest, digest: manifestDigest(manifest) };
};

const main = () => {
  const { flags, json } = parseCli(process.argv.slice(2));
  try {
    const { manifest, digest } = buildManifest({
      release: Boolean(flags.release),
    });
    const payload = {
      ok: true,
      manifest: 'pollux.plugin.json',
      version: manifest.version,
      revision: manifest.source.revision,
      dirty: manifest.source.dirty,
      digest,
    };
    if (json) console.log(JSON.stringify(payload, null, 2));
    else {
      console.log(
        `pollux-ui: built pollux.plugin.json v${manifest.version} (revision ${manifest.source.revision.slice(0, 12)}, dirty=${manifest.source.dirty})`
      );
      console.log(`pollux-ui: normalized digest ${digest}`);
    }
  } catch (err) {
    reportError(err, { json });
  }
};

const invokedAsScript =
  process.argv[1] &&
  fs.realpathSync(process.argv[1]) ===
    fs.realpathSync(new URL(import.meta.url).pathname);
if (invokedAsScript) main();
