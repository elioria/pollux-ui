#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { executeArtifactCase } from './workflow-artifacts.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const SCHEMA = JSON.parse(
  fs.readFileSync(
    path.resolve(HERE, '..', '..', 'tests', 'workflow-decision.schema.json'),
    'utf8'
  )
);
const { $schema: _schemaDialect, ...CLAUDE_SCHEMA } = SCHEMA;

const main = () => {
  if (process.argv.includes('--version')) {
    const version = spawnSync('claude', ['--version'], { encoding: 'utf8' });
    process.stdout.write(version.stdout ?? version.stderr ?? '');
    process.exit(version.status ?? 1);
  }
  const request = JSON.parse(fs.readFileSync(0, 'utf8'));
  const modelRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'pollux-claude-workflow-')
  );
  try {
    spawnSync('git', ['init', '-q'], { cwd: modelRoot });
    const prompt = [
      'Select the one Pollux skill and neutral capability that should execute this workflow.',
      'Do not run shell commands or mutate files. Return only the required JSON.',
      'selectedSkill must be one exact ID from pollux-inspect, pollux-create-workspace, pollux-apply-layout, pollux-generate-crud, pollux-verify.',
      'capability must be one exact ID from pollux.inspect, pollux.workspace.create, pollux.layout.apply, pollux.crud.generate, pollux.verify.',
      `Workflow: ${request.case.prompt}`,
      `Declared steps: ${JSON.stringify(request.case.steps)}`,
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
        prompt,
      ],
      { cwd: modelRoot, encoding: 'utf8' }
    );
    if (run.error || run.status !== 0) {
      process.stderr.write(run.stderr ?? run.error?.message ?? 'Claude failed');
      process.exit(run.status ?? 1);
    }
    const decision = JSON.parse(run.stdout).structured_output;
    const expectedDecisions = request.case.expectedDecisions ?? [
      {
        selectedSkill: request.case.expectedSkill,
        capability: request.case.capability,
      },
    ];
    if (
      !expectedDecisions.some(
        (expected) =>
          decision?.selectedSkill === expected.selectedSkill &&
          decision?.capability === expected.capability
      )
    ) {
      throw new Error(
        `Claude selected ${decision?.selectedSkill}/${decision?.capability}`
      );
    }
    process.stdout.write(
      `${JSON.stringify({ ...executeArtifactCase(request), modelDecision: decision })}\n`
    );
  } finally {
    fs.rmSync(modelRoot, { recursive: true, force: true });
  }
};

main();
