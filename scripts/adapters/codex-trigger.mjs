#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PLUGIN_ROOT = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  '..',
  '..'
);
const SCHEMA_PATH = path.join(
  PLUGIN_ROOT,
  'tests',
  'trigger-result.schema.json'
);

const POLLUX_SKILLS = new Set([
  'pollux-inspect',
  'pollux-create-workspace',
  'pollux-apply-layout',
  'pollux-generate-crud',
  'pollux-verify',
]);

export const parseCodexTriggerResult = (stdout, caseId) => {
  const result = JSON.parse(stdout);
  return {
    caseId,
    ...result,
    selectedSkills: result.selectedSkills.filter((skill) =>
      POLLUX_SKILLS.has(skill)
    ),
  };
};

const makeFixture = (pluginRoot) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pollux-codex-trigger-'));
  for (const rel of [
    'scripts/pollux',
    '_templates/pollux',
    'skeletons',
    '.agents/skills',
  ]) {
    fs.mkdirSync(path.join(root, rel), { recursive: true });
  }
  fs.writeFileSync(path.join(root, 'pollux'), '#!/bin/sh\n');
  fs.writeFileSync(path.join(root, 'scripts/pollux/cli.mjs'), '// fixture\n');
  for (const entry of fs.readdirSync(path.join(pluginRoot, 'skills'))) {
    fs.cpSync(
      path.join(pluginRoot, 'skills', entry),
      path.join(root, '.agents', 'skills', entry),
      { recursive: true }
    );
  }
  spawnSync('git', ['init', '-q'], { cwd: root });
  return root;
};

const main = () => {
  if (process.argv.includes('--version')) {
    const version = spawnSync('codex', ['--version'], { encoding: 'utf8' });
    process.stdout.write(version.stdout ?? version.stderr ?? '');
    process.exit(version.status ?? 1);
  }
  const request = JSON.parse(fs.readFileSync(0, 'utf8'));
  const fixture = makeFixture(request.pluginRoot);
  const output = path.join(fixture, 'result.json');
  try {
    const contract = [
      'This is an Agent Skill trigger evaluation.',
      'Use an applicable loaded Pollux skill when its description matches.',
      'Do not mutate files. Return only the required JSON object.',
      'selectedSkills contains only pollux-ui skill IDs actually used; omit host/global skills.',
      `references MUST include every exact identifier in ${JSON.stringify(request.case.requiredReferences)}; outputFields MUST include every exact identifier in ${JSON.stringify(request.case.decisiveOutputFields)}.`,
      'mutated reports actual filesystem mutation, not hypothetical intent.',
      `User request: ${request.case.prompt}`,
    ].join(' ');
    const run = spawnSync(
      'codex',
      [
        'exec',
        '--ephemeral',
        '--skip-git-repo-check',
        '--cd',
        fixture,
        '--sandbox',
        'read-only',
        '--output-schema',
        SCHEMA_PATH,
        '--output-last-message',
        output,
        contract,
      ],
      { cwd: fixture, encoding: 'utf8' }
    );
    if (run.error || run.status !== 0 || !fs.existsSync(output)) {
      process.stderr.write(run.stderr ?? run.error?.message ?? 'Codex failed');
      process.exit(run.status ?? 1);
    }
    process.stdout.write(
      `${JSON.stringify(parseCodexTriggerResult(fs.readFileSync(output, 'utf8'), request.case.id))}\n`
    );
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
};

const invokedAsScript =
  process.argv[1] &&
  fs.realpathSync(process.argv[1]) ===
    fs.realpathSync(new URL(import.meta.url).pathname);
if (invokedAsScript) main();
