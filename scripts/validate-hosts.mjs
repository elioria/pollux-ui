#!/usr/bin/env node
// SPEC-004/006 — run current native host validators and fail closed.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  ERROR_CODES,
  parseCli,
  PLUGIN_ROOT,
  PluginError,
  readJson,
  reportError,
} from './lib/common.mjs';

export const runHostCommand = (command, args, { spawn = spawnSync } = {}) => {
  const result = spawn(command, args, { encoding: 'utf8' });
  return {
    status:
      result.error?.code === 'ENOENT'
        ? 'missing'
        : result.status === 0
          ? 'passed'
          : 'failed',
    exitCode: result.status,
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`.trim(),
  };
};

const run = runHostCommand;

const versionNumber = (value) =>
  value?.match(/\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?/)?.[0] ?? null;

const compareVersions = (a, b) => {
  const parts = (value) => value.split(/[.-]/).slice(0, 3).map(Number);
  const av = parts(a);
  const bv = parts(b);
  for (let i = 0; i < 3; i += 1) {
    if (av[i] !== bv[i]) return av[i] - bv[i];
  }
  return 0;
};

export const normalizeHostResult = (host, result) => ({
  host,
  status: result.status,
  version: result.version ?? null,
  discoveredSkills: [...(result.discoveredSkills ?? [])].sort(),
  warnings: [...(result.warnings ?? [])],
  validators: [...(result.validators ?? [])],
});

export const assertHostEvidence = (
  result,
  declaredSkills,
  warningAllowlist = []
) => {
  const problems = [];
  if (result.status !== 'passed') {
    problems.push(`${result.host} validator status is '${result.status}'`);
  }
  if (!result.version) problems.push(`${result.host} version was not recorded`);
  const declared = [...declaredSkills].sort();
  if (JSON.stringify(result.discoveredSkills) !== JSON.stringify(declared)) {
    problems.push(
      `${result.host} discovered skills ${JSON.stringify(result.discoveredSkills)}; expected ${JSON.stringify(declared)}`
    );
  }
  for (const warning of result.warnings) {
    const allowed = warningAllowlist.some((entry) => {
      if (!entry.reason || !entry.expiresAfterVersion) return false;
      if (!warning.includes(entry.pattern)) return false;
      return (
        result.version !== null &&
        compareVersions(result.version, entry.expiresAfterVersion) <= 0
      );
    });
    if (!allowed) problems.push(`${result.host} warning: ${warning}`);
  }
  if (problems.length > 0) {
    throw new PluginError(
      ERROR_CODES.HOST_PROJECTION_INVALID,
      'native host validation failed',
      { problems }
    );
  }
  return result;
};

const declaredSkills = () =>
  readJson(path.join(PLUGIN_ROOT, 'pollux.plugin.json')).skills.map(
    (skill) => skill.id
  );

const warningLines = (output) =>
  output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /(?:warning|⚠)/i.test(line));

const codexValidatorPaths = () => {
  const home = os.homedir();
  const installedPluginValidator = path.join(
    home,
    '.codex/skills/.system/plugin-creator/scripts/validate_plugin.py'
  );
  return {
    plugin:
      process.env.CODEX_PLUGIN_VALIDATOR ??
      (fs.existsSync(installedPluginValidator)
        ? installedPluginValidator
        : path.join(PLUGIN_ROOT, 'scripts', 'validate-codex-plugin.mjs')),
    skill:
      process.env.CODEX_SKILL_VALIDATOR ??
      path.join(
        home,
        '.codex/skills/.system/skill-creator/scripts/quick_validate.py'
      ),
  };
};

const runValidator = (validator, target) =>
  validator.endsWith('.mjs')
    ? run('node', [validator])
    : run('python3', [validator, target]);

export const validateCodex = (skills = declaredSkills()) => {
  const cliVersion = run('codex', ['--version']);
  const validators = codexValidatorPaths();
  if (
    cliVersion.status === 'missing' ||
    !fs.existsSync(validators.plugin) ||
    !fs.existsSync(validators.skill)
  ) {
    return normalizeHostResult('codex', {
      status: 'missing',
      version: versionNumber(cliVersion.output),
      discoveredSkills: [],
      warnings: [],
      validators: [validators.plugin, validators.skill],
    });
  }
  const pluginResult = runValidator(validators.plugin, PLUGIN_ROOT);
  const skillResults = skills.map((skill) => ({
    skill,
    result: run('python3', [
      validators.skill,
      path.join(PLUGIN_ROOT, 'skills', skill),
    ]),
  }));
  const outputs = [pluginResult, ...skillResults.map(({ result }) => result)];
  return normalizeHostResult('codex', {
    status: outputs.every((result) => result.status === 'passed')
      ? 'passed'
      : 'failed',
    version: versionNumber(cliVersion.output),
    discoveredSkills: skillResults
      .filter(({ result }) => result.status === 'passed')
      .map(({ skill }) => skill),
    warnings: outputs.flatMap((result) => warningLines(result.output)),
    validators: [
      `codex ${versionNumber(cliVersion.output) ?? 'unknown'}`,
      validators.plugin,
      validators.skill,
    ],
  });
};

export const validateClaude = (skills = declaredSkills()) => {
  const cliVersion = run('claude', ['--version']);
  if (cliVersion.status === 'missing') {
    return normalizeHostResult('claudeCode', {
      status: 'missing',
      version: null,
      discoveredSkills: [],
      warnings: [],
      validators: ['claude plugin validate --strict'],
    });
  }
  const validation = run('claude', [
    'plugin',
    'validate',
    '--strict',
    PLUGIN_ROOT,
  ]);
  return normalizeHostResult('claudeCode', {
    status: validation.status,
    version: versionNumber(cliVersion.output),
    discoveredSkills: validation.status === 'passed' ? skills : [],
    warnings: warningLines(validation.output),
    validators: [
      `claude ${versionNumber(cliVersion.output) ?? 'unknown'}`,
      'claude plugin validate --strict',
    ],
  });
};

export const validateHosts = ({ hosts = ['codex', 'claudeCode'] } = {}) => {
  const skills = declaredSkills();
  const results = hosts.map((host) =>
    host === 'codex' ? validateCodex(skills) : validateClaude(skills)
  );
  const problems = [];
  for (const result of results) {
    try {
      assertHostEvidence(result, skills);
    } catch (err) {
      problems.push(...(err.details?.problems ?? [err.message]));
    }
  }
  if (problems.length > 0) {
    throw new PluginError(
      ERROR_CODES.HOST_PROJECTION_INVALID,
      'native host validation failed',
      { problems, results }
    );
  }
  return { ok: true, skills: skills.length, hosts: results };
};

const main = () => {
  const { flags, json } = parseCli(process.argv.slice(2));
  try {
    if (flags.host && !['codex', 'claudeCode'].includes(flags.host)) {
      throw new PluginError(
        ERROR_CODES.USAGE,
        '--host must be codex or claudeCode'
      );
    }
    const result = validateHosts({
      hosts: flags.host ? [flags.host] : ['codex', 'claudeCode'],
    });
    if (json) console.log(JSON.stringify(result, null, 2));
    else {
      for (const host of result.hosts) {
        console.log(
          `pollux-ui: ${host.host} ${host.version} validated ${host.discoveredSkills.length} skills`
        );
      }
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
