import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ERROR_CODES, PluginError } from '../scripts/lib/common.mjs';
import { validateCodexPlugin } from '../scripts/validate-codex-plugin.mjs';
import {
  assertHostEvidence,
  normalizeHostResult,
  runHostCommand,
} from '../scripts/validate-hosts.mjs';

const skills = [
  'pollux-apply-layout',
  'pollux-create-workspace',
  'pollux-generate-crud',
  'pollux-inspect',
  'pollux-verify',
];

test('host validation: missing validator fails closed', () => {
  assert.throws(
    () =>
      assertHostEvidence(
        normalizeHostResult('codex', {
          status: 'missing',
          version: null,
          discoveredSkills: [],
          warnings: [],
        }),
        skills
      ),
    (err) =>
      err instanceof PluginError &&
      err.code === ERROR_CODES.HOST_PROJECTION_INVALID
  );
});

test('host validation: warnings fail unless explicitly allowlisted', () => {
  const result = normalizeHostResult('claudeCode', {
    status: 'passed',
    version: '2.1.220',
    discoveredSkills: skills,
    warnings: ['unknown manifest field'],
  });
  assert.throws(() => assertHostEvidence(result, skills));
  assert.doesNotThrow(() =>
    assertHostEvidence(result, skills, [
      {
        pattern: 'unknown manifest field',
        reason: 'host bug tracked upstream',
        expiresAfterVersion: '2.1.220',
      },
    ])
  );
});

test('host validation: exact declared skill discovery is required', () => {
  const result = normalizeHostResult('codex', {
    status: 'passed',
    version: '0.147.0',
    discoveredSkills: skills.slice(0, -1),
    warnings: [],
  });
  assert.throws(
    () => assertHostEvidence(result, skills),
    (err) => err.details.problems.some((problem) => problem.includes('skills'))
  );
});

test('host validation: repository Codex compatibility validator accepts projection', () => {
  assert.deepEqual(validateCodexPlugin(), { skills: 5 });
});

test('host validation: nonzero validator exit is failed evidence', () => {
  assert.deepEqual(
    runHostCommand('validator', ['--strict'], {
      spawn() {
        return { status: 2, stdout: '', stderr: 'invalid manifest' };
      },
    }),
    {
      status: 'failed',
      exitCode: 2,
      output: 'invalid manifest',
    }
  );
});
