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
const SCHEMA = JSON.parse(
  fs.readFileSync(
    path.join(PLUGIN_ROOT, 'tests', 'trigger-result.schema.json'),
    'utf8'
  )
);
const { $schema: _schemaDialect, ...CLAUDE_SCHEMA } = SCHEMA;

export const parseClaudeTriggerResult = (stdout, caseId) => {
  const payload = JSON.parse(stdout);
  const result = payload.structured_output;
  if (!result || typeof result !== 'object') {
    throw new Error('Claude did not return structured_output');
  }
  return {
    caseId,
    ...result,
    selectedSkills: result.selectedSkills.filter((skill) =>
      skill.startsWith('pollux-')
    ),
  };
};

const makeFixture = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pollux-claude-trigger-'));
  for (const rel of ['scripts/pollux', '_templates/pollux', 'skeletons']) {
    fs.mkdirSync(path.join(root, rel), { recursive: true });
  }
  fs.writeFileSync(path.join(root, 'pollux'), '#!/bin/sh\n');
  fs.writeFileSync(path.join(root, 'scripts/pollux/cli.mjs'), '// fixture\n');
  spawnSync('git', ['init', '-q'], { cwd: root });
  return root;
};

const main = () => {
  if (process.argv.includes('--version')) {
    const version = spawnSync('claude', ['--version'], { encoding: 'utf8' });
    process.stdout.write(version.stdout ?? version.stderr ?? '');
    process.exit(version.status ?? 1);
  }
  const request = JSON.parse(fs.readFileSync(0, 'utf8'));
  const fixture = makeFixture();
  try {
    const contract = [
      'This is an Agent Skill trigger evaluation.',
      'Use an applicable loaded pollux-ui Skill when its description matches.',
      'Do not run shell commands and do not mutate files; only the Skill tool is available.',
      'Return selectedSkills with only exact unnamespaced pollux-ui skill IDs actually invoked; omit host/global skills.',
      `references MUST include every exact identifier in ${JSON.stringify(request.case.requiredReferences)}; outputFields MUST include every exact identifier in ${JSON.stringify(request.case.decisiveOutputFields)}.`,
      'mutated reports actual filesystem mutation, not hypothetical future intent.',
    ].join(' ');
    const run = spawnSync(
      'claude',
      [
        '-p',
        '--plugin-dir',
        request.pluginRoot,
        '--no-session-persistence',
        '--tools',
        'Skill',
        '--output-format',
        'json',
        '--json-schema',
        JSON.stringify(CLAUDE_SCHEMA),
        '--append-system-prompt',
        contract,
        request.case.prompt,
      ],
      { cwd: fixture, encoding: 'utf8' }
    );
    if (run.error || run.status !== 0) {
      process.stderr.write(run.stderr ?? run.error?.message ?? 'Claude failed');
      process.exit(run.status ?? 1);
    }
    process.stdout.write(
      `${JSON.stringify(parseClaudeTriggerResult(run.stdout, request.case.id))}\n`
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
