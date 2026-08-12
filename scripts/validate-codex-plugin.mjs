#!/usr/bin/env node
// Codex projection compatibility validator mirrored from the installed
// plugin-creator contract. The installed validator still runs when available.
import fs from 'node:fs';
import path from 'node:path';

import {
  ERROR_CODES,
  isSemver,
  parseCli,
  PLUGIN_ROOT,
  PluginError,
  readJson,
  reportError,
} from './lib/common.mjs';
import { parseFrontmatter } from './validate-package.mjs';

const ALLOWED_KEYS = new Set([
  'id',
  'name',
  'version',
  'description',
  'skills',
  'apps',
  'mcpServers',
  'interface',
  'author',
  'homepage',
  'repository',
  'license',
  'keywords',
]);
const INTERFACE_KEYS = new Set([
  'displayName',
  'shortDescription',
  'longDescription',
  'developerName',
  'category',
  'capabilities',
  'websiteURL',
  'privacyPolicyURL',
  'termsOfServiceURL',
  'brandColor',
  'composerIcon',
  'logo',
  'logoDark',
  'screenshots',
  'defaultPrompt',
  'default_prompt',
]);

const nonEmpty = (value) => typeof value === 'string' && value.trim() !== '';

export const validateCodexPlugin = (pluginRoot = PLUGIN_ROOT) => {
  const problems = [];
  const manifestPath = path.join(pluginRoot, '.codex-plugin', 'plugin.json');
  if (!fs.existsSync(manifestPath)) {
    problems.push('missing .codex-plugin/plugin.json');
  }
  const manifest = fs.existsSync(manifestPath) ? readJson(manifestPath) : {};
  for (const key of Object.keys(manifest)) {
    if (!ALLOWED_KEYS.has(key))
      problems.push(`unsupported plugin field '${key}'`);
  }
  if (manifest.name !== path.basename(pluginRoot))
    problems.push('plugin name must match directory');
  if (!isSemver(manifest.version))
    problems.push('plugin version must be strict semver');
  if (!nonEmpty(manifest.description))
    problems.push('plugin description is required');
  if (!nonEmpty(manifest.author?.name))
    problems.push('author.name is required');
  if (manifest.skills !== './skills/')
    problems.push("skills must be './skills/'");
  const iface = manifest.interface;
  if (!iface || typeof iface !== 'object' || Array.isArray(iface)) {
    problems.push('interface object is required');
  } else {
    for (const key of Object.keys(iface)) {
      if (!INTERFACE_KEYS.has(key))
        problems.push(`unsupported interface field '${key}'`);
    }
    for (const key of [
      'displayName',
      'shortDescription',
      'longDescription',
      'developerName',
      'category',
    ]) {
      if (!nonEmpty(iface[key])) problems.push(`interface.${key} is required`);
    }
    if (
      !Array.isArray(iface.capabilities) ||
      !iface.capabilities.every(nonEmpty)
    ) {
      problems.push('interface.capabilities must be an array of strings');
    }
    if (
      !Array.isArray(iface.defaultPrompt) ||
      !iface.defaultPrompt.every(nonEmpty)
    ) {
      problems.push('interface.defaultPrompt must be an array of strings');
    }
  }

  const skillsRoot = path.join(pluginRoot, 'skills');
  const skills = fs.existsSync(skillsRoot)
    ? fs
        .readdirSync(skillsRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
        .map((entry) => entry.name)
        .sort()
    : [];
  for (const skill of skills) {
    const skillRoot = path.join(skillsRoot, skill);
    const skillPath = path.join(skillRoot, 'SKILL.md');
    const agentPath = path.join(skillRoot, 'agents', 'openai.yaml');
    if (!fs.existsSync(skillPath)) {
      problems.push(`${skill}: missing SKILL.md`);
      continue;
    }
    const frontmatter = parseFrontmatter(
      fs.readFileSync(skillPath, 'utf8'),
      skillPath
    );
    if (frontmatter.name !== skill)
      problems.push(`${skill}: frontmatter name mismatch`);
    if (!fs.existsSync(agentPath)) {
      problems.push(`${skill}: missing agents/openai.yaml`);
      continue;
    }
    const agent = fs.readFileSync(agentPath, 'utf8');
    if (!/^interface:$/m.test(agent))
      problems.push(`${skill}: missing agent interface`);
    if (!/^  display_name: ".+"$/m.test(agent))
      problems.push(`${skill}: missing display_name`);
    const short = agent.match(/^  short_description: "(.+)"$/m)?.[1];
    if (!short || short.length < 25 || short.length > 64)
      problems.push(`${skill}: short_description must be 25-64 chars`);
    if (!agent.includes(`  default_prompt: "Use $${skill}`))
      problems.push(`${skill}: default_prompt must mention $${skill}`);
  }
  if (problems.length > 0) {
    throw new PluginError(
      ERROR_CODES.HOST_PROJECTION_INVALID,
      'Codex plugin compatibility validation failed',
      { problems }
    );
  }
  return { skills: skills.length };
};

const main = () => {
  const { json } = parseCli(process.argv.slice(2));
  try {
    const result = validateCodexPlugin();
    console.log(
      json
        ? JSON.stringify({ ok: true, ...result }, null, 2)
        : `pollux-ui: Codex projection valid — ${result.skills} skills`
    );
  } catch (err) {
    reportError(err, { json });
  }
};

const invokedAsScript =
  process.argv[1] &&
  fs.realpathSync(process.argv[1]) ===
    fs.realpathSync(new URL(import.meta.url).pathname);
if (invokedAsScript) main();
