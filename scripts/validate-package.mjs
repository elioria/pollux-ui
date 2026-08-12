#!/usr/bin/env node
// SPEC-006 layer 1 — neutral package validation. Proves manifest schema and
// semantics, catalog integrity (schema, hashes, packaged bytes, path
// containment), skill frontmatter portability, and host projection parity.
//
// Usage:
//   node plugins/pollux-ui/scripts/validate-package.mjs [--json]
import fs from 'node:fs';
import path from 'node:path';

import { buildProjections } from './build-projections.mjs';
import {
  ERROR_CODES,
  hashFile,
  isSemver,
  isSemverRange,
  manifestDigest,
  parseCli,
  PLUGIN_ROOT,
  PluginError,
  readJson,
  reportError,
  resolvePackagePath,
  sha256Hex,
} from './lib/common.mjs';
import { validateSchema } from './lib/json-schema.mjs';

const MANIFEST_PATH = path.join(PLUGIN_ROOT, 'pollux.plugin.json');
const CATALOG_PATH = path.join(PLUGIN_ROOT, 'resources', 'catalog.json');
const RESOURCES_DIR = path.join(PLUGIN_ROOT, 'resources');

const SKILL_NAME_RE = /^pollux-[a-z0-9-]+$/;
const PORTABLE_FRONTMATTER_KEYS = new Set(['name', 'description']);

const parseYamlScalar = (raw, file, key) => {
  const value = raw.trim();
  if (value.startsWith('"')) {
    try {
      return JSON.parse(value);
    } catch {
      throw new PluginError(
        ERROR_CODES.PLUGIN_MANIFEST_INVALID,
        `${file}: invalid quoted YAML scalar for '${key}'`
      );
    }
  }
  if (value.startsWith("'")) {
    if (!value.endsWith("'") || value.length < 2) {
      throw new PluginError(
        ERROR_CODES.PLUGIN_MANIFEST_INVALID,
        `${file}: invalid quoted YAML scalar for '${key}'`
      );
    }
    return value.slice(1, -1).replaceAll("''", "'");
  }
  if (/:(?:\s|$)/.test(value)) {
    throw new PluginError(
      ERROR_CODES.PLUGIN_MANIFEST_INVALID,
      `${file}: invalid YAML scalar for '${key}'; quote values containing colon-space`
    );
  }
  return value;
};

export const parseFrontmatter = (text, file) => {
  const m = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) {
    throw new PluginError(
      ERROR_CODES.PLUGIN_MANIFEST_INVALID,
      `${file}: missing YAML frontmatter`
    );
  }
  const out = {};
  for (const line of m[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    out[key] = parseYamlScalar(line.slice(idx + 1), file, key);
  }
  return out;
};

const validateManifest = (problems) => {
  if (!fs.existsSync(MANIFEST_PATH)) {
    problems.push('pollux.plugin.json missing — run build-manifest.mjs');
    return null;
  }
  const manifest = readJson(MANIFEST_PATH);
  problems.push(
    ...validateSchema(
      manifest,
      readJson(path.join(PLUGIN_ROOT, 'pollux.plugin.schema.json'))
    ).map((p) => `manifest ${p}`)
  );
  if (manifest.version && !isSemver(manifest.version)) {
    problems.push(`manifest version '${manifest.version}' is not semver`);
  }
  const capIds = manifest.capabilities?.map((c) => c.id) ?? [];
  const skillIds = manifest.skills?.map((s) => s.id) ?? [];
  for (const id of capIds.filter((v, i) => capIds.indexOf(v) !== i)) {
    problems.push(`duplicate capability id '${id}'`);
  }
  for (const id of skillIds.filter((v, i) => skillIds.indexOf(v) !== i)) {
    problems.push(`duplicate skill id '${id}'`);
  }
  for (const [key, value] of [
    ['polluxCli', manifest.compatibility?.polluxCli],
    ['hosts.codex', manifest.compatibility?.hosts?.codex],
    ['hosts.claudeCode', manifest.compatibility?.hosts?.claudeCode],
  ]) {
    if (value !== undefined && !isSemverRange(value)) {
      problems.push(`compatibility.${key} is not an explicit range`);
    }
  }
  return manifest;
};

const validateCatalog = (manifest, problems) => {
  if (!fs.existsSync(CATALOG_PATH)) {
    problems.push('resources/catalog.json missing — run build-resources.mjs');
    return null;
  }
  const catalog = readJson(CATALOG_PATH);
  problems.push(
    ...validateSchema(
      catalog,
      readJson(path.join(RESOURCES_DIR, 'catalog.schema.json'))
    ).map((p) => `catalog ${p}`)
  );

  const ids = new Set();
  for (const res of catalog.resources ?? []) {
    if (ids.has(res.id)) problems.push(`duplicate resource id '${res.id}'`);
    ids.add(res.id);
    for (const dep of res.dependencies ?? []) {
      // dependencies validated after all ids are known (below)
      void dep;
    }
    if (res.packagePath !== null) {
      try {
        resolvePackagePath(res.packagePath);
      } catch {
        problems.push(`resource '${res.id}' packagePath escapes plugin root`);
      }
      // packaged bytes must match recorded hashes
      for (const f of res.files ?? []) {
        const abs = path.join(RESOURCES_DIR, f.path);
        if (!abs.startsWith(RESOURCES_DIR + path.sep)) {
          problems.push(`resource '${res.id}' file path escapes resources/`);
          continue;
        }
        if (!fs.existsSync(abs)) {
          problems.push(`resource '${res.id}' missing packaged file ${f.path}`);
          continue;
        }
        if (hashFile(abs) !== f.sha256) {
          problems.push(`resource '${res.id}' hash mismatch at ${f.path}`);
        }
      }
    } else if (res.ownership !== 'invoke-only') {
      problems.push(
        `resource '${res.id}' has null packagePath but is not invoke-only`
      );
    }
  }
  for (const res of catalog.resources ?? []) {
    for (const dep of res.dependencies ?? []) {
      if (!ids.has(dep)) {
        problems.push(`resource '${res.id}' depends on unknown '${dep}'`);
      }
    }
  }

  // every capability resource reference must resolve
  for (const cap of manifest?.capabilities ?? []) {
    for (const rid of cap.resources ?? []) {
      if (!ids.has(rid)) {
        problems.push(
          `capability '${cap.id}' requires unknown resource '${rid}'`
        );
      }
    }
  }

  // catalog digest must match the recorded resources
  const recomputed = sha256Hex(
    Buffer.from(
      (catalog.resources ?? []).map((r) => `${r.id}  ${r.sha256}`).join('\n'),
      'utf8'
    )
  );
  if (catalog.catalogDigest && catalog.catalogDigest !== recomputed) {
    problems.push('catalogDigest does not match recorded resources');
  }
  return catalog;
};

const validateSkills = (manifest, problems) => {
  for (const skill of manifest?.skills ?? []) {
    let abs;
    try {
      abs = resolvePackagePath(skill.path);
    } catch {
      problems.push(`skill '${skill.id}' path escapes plugin root`);
      continue;
    }
    if (!fs.existsSync(abs)) {
      problems.push(`skill '${skill.id}' missing ${skill.path}`);
      continue;
    }
    const text = fs.readFileSync(abs, 'utf8');
    const fm = parseFrontmatter(text, skill.path);
    for (const key of Object.keys(fm)) {
      if (!PORTABLE_FRONTMATTER_KEYS.has(key)) {
        problems.push(
          `skill '${skill.id}' uses non-portable frontmatter key '${key}'`
        );
      }
    }
    if (fm.name !== skill.id) {
      problems.push(
        `skill '${skill.id}' frontmatter name '${fm.name}' does not match manifest id`
      );
    }
    if (fm.name && (!SKILL_NAME_RE.test(fm.name) || fm.name.length > 64)) {
      problems.push(
        `skill '${skill.id}' name is not lowercase hyphen-case <=64`
      );
    }
    if (fm.description !== skill.description) {
      problems.push(`skill '${skill.id}' description differs from manifest`);
    }
    if (text.split('\n').length > 500) {
      problems.push(`skill '${skill.id}' exceeds 500 lines`);
    }
  }
};

const validateProjections = (manifest, problems) => {
  let fresh;
  try {
    fresh = buildProjections();
  } catch (err) {
    problems.push(`projection rebuild failed: ${err.message}`);
    return;
  }
  for (const [abs, content] of fresh) {
    const rel = path.relative(PLUGIN_ROOT, abs);
    if (!fs.existsSync(abs)) {
      problems.push(`missing projection ${rel}`);
      continue;
    }
    if (sha256Hex(fs.readFileSync(abs)) !== sha256Hex(Buffer.from(content))) {
      problems.push(`projection drift at ${rel} — run build-projections.mjs`);
    }
  }
  // shared identity fields must match exactly
  for (const key of ['codex', 'claudeCode']) {
    const rel = manifest?.projections?.[key];
    if (!rel) continue;
    const abs = path.join(PLUGIN_ROOT, rel);
    if (!fs.existsSync(abs)) continue;
    const proj = readJson(abs);
    for (const field of ['name', 'version', 'description']) {
      if (proj[field] !== manifest[field]) {
        problems.push(`${rel}: ${field} does not match neutral manifest`);
      }
    }
    if (proj.skills !== './skills/') {
      problems.push(`${rel}: skills must be './skills/'`);
    }
  }
};

export const validatePackage = () => {
  const problems = [];
  const manifest = validateManifest(problems);
  const catalog = validateCatalog(manifest, problems);
  validateSkills(manifest, problems);
  validateProjections(manifest, problems);
  if (problems.length > 0) {
    throw new PluginError(
      ERROR_CODES.VERIFICATION_FAILED,
      'plugin package validation failed',
      { problems }
    );
  }
  return {
    skills: manifest.skills.length,
    capabilities: manifest.capabilities.length,
    resources: catalog.resources.length,
    manifestDigest: manifestDigest(manifest),
    catalogDigest: catalog.catalogDigest,
  };
};

const main = () => {
  const { json } = parseCli(process.argv.slice(2));
  try {
    const summary = validatePackage();
    const payload = { ok: true, ...summary };
    if (json) console.log(JSON.stringify(payload, null, 2));
    else {
      console.log(
        `pollux-ui: package valid — ${summary.skills} skills, ${summary.capabilities} capabilities, ${summary.resources} resources`
      );
      console.log(`pollux-ui: manifest digest ${summary.manifestDigest}`);
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
