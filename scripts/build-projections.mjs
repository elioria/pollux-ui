#!/usr/bin/env node
// SPEC-004 — project the neutral pollux.plugin.json into native host
// manifests (.codex-plugin/plugin.json, .claude-plugin/plugin.json) and the
// Codex agents/openai.yaml UI metadata per skill.
//
// Native manifests carry discovery/presentation metadata only — never Pollux
// workflow logic. Projection-only fields are allowlisted; unknown neutral
// fields fail generation.
//
// Usage:
//   node plugins/pollux-ui/scripts/build-projections.mjs [--check] [--json]
//
// --check verifies the on-disk projections match a fresh build (drift gate)
// without writing.
import fs from 'node:fs';
import path from 'node:path';

import {
  ERROR_CODES,
  parseCli,
  PLUGIN_ROOT,
  PluginError,
  readJson,
  reportError,
  sha256Hex,
  stableStringify,
} from './lib/common.mjs';
import { validateSchema } from './lib/json-schema.mjs';

const MANIFEST_PATH = path.join(PLUGIN_ROOT, 'pollux.plugin.json');
const CONFIG_PATH = path.join(PLUGIN_ROOT, 'manifest.config.json');

const CODEX_DIR = path.join(PLUGIN_ROOT, '.codex-plugin');
const CLAUDE_DIR = path.join(PLUGIN_ROOT, '.claude-plugin');

// Neutral manifest keys a projection is allowed to consume.
const ALLOWED_NEUTRAL_KEYS = new Set([
  'schemaVersion',
  'name',
  'version',
  'description',
  'publisher',
  'license',
  'source',
  'compatibility',
  'capabilities',
  'skills',
  'resourceCatalog',
  'projections',
]);

const yamlEscape = (s) => s.replaceAll('"', '\\"');

const renderOpenaiYaml = (meta) => `interface:
  display_name: "${yamlEscape(meta.displayName)}"
  short_description: "${yamlEscape(meta.shortDescription)}"
  default_prompt: "${yamlEscape(meta.defaultPrompt)}"
`;

// Deterministic per-skill Codex UI metadata derived from shared skill meaning.
const skillUiMeta = (config, skill) => {
  const cfg = (config.skillUi ?? {})[skill.id] ?? {};
  const displayName =
    cfg.displayName ??
    skill.id
      .split('-')
      .map((w) => w[0].toUpperCase() + w.slice(1))
      .join(' ');
  const shortDescription = cfg.shortDescription ?? skill.description;
  if (shortDescription.length < 25 || shortDescription.length > 64) {
    throw new PluginError(
      ERROR_CODES.HOST_PROJECTION_INVALID,
      `skill '${skill.id}': openai short_description must be 25-64 chars (got ${shortDescription.length}) — set manifest.config.json skillUi.${skill.id}.shortDescription`,
      { skill: skill.id }
    );
  }
  const defaultPrompt =
    cfg.defaultPrompt ??
    `Use $${skill.id} to ${skill.description.split('.')[0].toLowerCase()}.`;
  if (!defaultPrompt.includes(`$${skill.id}`)) {
    throw new PluginError(
      ERROR_CODES.HOST_PROJECTION_INVALID,
      `skill '${skill.id}': default_prompt must mention $${skill.id}`,
      { skill: skill.id }
    );
  }
  return { displayName, shortDescription, defaultPrompt };
};

const buildCodexManifest = (manifest, config) => {
  const publisherName = manifest.publisher?.name ?? config.publisher?.name;
  if (!publisherName) {
    throw new PluginError(
      ERROR_CODES.PUBLISHER_METADATA_REQUIRED,
      'codex projection requires a real publisher name — set publisher.name in manifest.config.json'
    );
  }
  const iface = config.interface;
  if (!iface?.displayName || !iface?.category || !iface?.developerName) {
    throw new PluginError(
      ERROR_CODES.PUBLISHER_METADATA_REQUIRED,
      'codex projection requires interface.displayName, interface.category, and interface.developerName in manifest.config.json'
    );
  }
  return {
    name: manifest.name,
    version: manifest.version,
    description: manifest.description,
    skills: './skills/',
    author: { name: publisherName },
    interface: {
      displayName: iface.displayName,
      shortDescription: iface.shortDescription,
      longDescription: iface.longDescription ?? manifest.description,
      category: iface.category,
      developerName: iface.developerName,
      capabilities: manifest.capabilities.map((c) => c.id),
      defaultPrompt: iface.defaultPrompt ?? [manifest.description],
    },
    repository: manifest.source.repository,
    license: manifest.license,
  };
};

const buildClaudeManifest = (manifest) => ({
  name: manifest.name,
  displayName: 'Pollux UI',
  version: manifest.version,
  description: manifest.description,
  author: manifest.publisher,
  skills: './skills/',
  license: manifest.license,
});

export const buildProjections = () => {
  if (!fs.existsSync(MANIFEST_PATH)) {
    throw new PluginError(
      ERROR_CODES.PLUGIN_MANIFEST_INVALID,
      'pollux.plugin.json is missing — run build-manifest.mjs first'
    );
  }
  const manifest = readJson(MANIFEST_PATH);
  const config = readJson(CONFIG_PATH);

  const problems = validateSchema(
    manifest,
    readJson(path.join(PLUGIN_ROOT, 'pollux.plugin.schema.json'))
  );
  if (problems.length > 0) {
    throw new PluginError(
      ERROR_CODES.PLUGIN_MANIFEST_INVALID,
      'neutral manifest failed schema validation',
      { problems }
    );
  }
  for (const key of Object.keys(manifest)) {
    if (!ALLOWED_NEUTRAL_KEYS.has(key)) {
      throw new PluginError(
        ERROR_CODES.PLUGIN_MANIFEST_INVALID,
        `neutral manifest contains non-allowlisted key '${key}'`
      );
    }
  }

  const outputs = new Map();
  outputs.set(
    path.join(CODEX_DIR, 'plugin.json'),
    stableStringify(buildCodexManifest(manifest, config))
  );
  outputs.set(
    path.join(CLAUDE_DIR, 'plugin.json'),
    stableStringify(buildClaudeManifest(manifest))
  );
  for (const skill of manifest.skills) {
    const meta = skillUiMeta(config, skill);
    outputs.set(
      path.join(PLUGIN_ROOT, 'skills', skill.id, 'agents', 'openai.yaml'),
      renderOpenaiYaml(meta)
    );
  }
  return outputs;
};

const main = () => {
  const { flags, json } = parseCli(process.argv.slice(2));
  try {
    const outputs = buildProjections();
    if (flags.check) {
      const problems = [];
      for (const [abs, content] of outputs) {
        if (!fs.existsSync(abs)) {
          problems.push(
            `missing projection: ${path.relative(PLUGIN_ROOT, abs)}`
          );
          continue;
        }
        const actual = fs.readFileSync(abs);
        if (sha256Hex(actual) !== sha256Hex(Buffer.from(content, 'utf8'))) {
          problems.push(
            `projection drift: ${path.relative(PLUGIN_ROOT, abs)} (rebuild with build-projections.mjs)`
          );
        }
      }
      if (problems.length > 0) {
        throw new PluginError(
          ERROR_CODES.HOST_PROJECTION_INVALID,
          'host projections are stale or hand-edited',
          { problems }
        );
      }
      const payload = { ok: true, projections: outputs.size };
      if (json) console.log(JSON.stringify(payload, null, 2));
      else console.log(`pollux-ui: ${outputs.size} projections in sync`);
      return;
    }
    for (const [abs, content] of outputs) {
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, content);
    }
    const payload = {
      ok: true,
      written: [...outputs.keys()].map((p) => path.relative(PLUGIN_ROOT, p)),
    };
    if (json) console.log(JSON.stringify(payload, null, 2));
    else {
      console.log(`pollux-ui: wrote ${outputs.size} host projections:`);
      for (const rel of payload.written) console.log(`  - ${rel}`);
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
