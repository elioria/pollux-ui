import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { parseClaudeTriggerResult } from '../scripts/adapters/claude-trigger.mjs';
import { parseCodexTriggerResult } from '../scripts/adapters/codex-trigger.mjs';
import {
  evaluateTriggerEvidence,
  selectTriggerCases,
} from '../scripts/evaluate-triggers.mjs';
import {
  evaluateWorkflowEvidence,
  selectWorkflowCases,
} from '../scripts/evaluate-workflows.mjs';
import {
  ERROR_CODES,
  PLUGIN_ROOT,
  PluginError,
} from '../scripts/lib/common.mjs';

const read = (name) =>
  JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, 'tests', name), 'utf8'));

test('trigger eval: thresholds are declared per host', () => {
  const config = read('trigger-cases.json');
  for (const host of ['codex', 'claudeCode']) {
    assert.deepEqual(config.thresholds[host], {
      precision: 1,
      recall: 1,
      mutationFalsePositives: 0,
    });
  }
});

test('trigger eval: focused case selection preserves thresholds and rejects unknown IDs', () => {
  const config = read('trigger-cases.json');
  const focused = selectTriggerCases(config, 'apply-layout-positive');
  assert.equal(focused.cases.length, 1);
  assert.equal(focused.cases[0].id, 'apply-layout-positive');
  assert.deepEqual(focused.thresholds, config.thresholds);
  assert.throws(
    () => selectTriggerCases(config, 'missing-case'),
    (error) => error.code === ERROR_CODES.VERIFICATION_FAILED
  );
});

test('trigger eval: schema-only or skipped evidence fails closed', () => {
  const config = read('trigger-cases.json');
  assert.throws(
    () =>
      evaluateTriggerEvidence(config, {
        host: 'codex',
        hostVersion: '0.147.0',
        executed: false,
        freshSession: false,
        results: [],
      }),
    (err) =>
      err instanceof PluginError && err.code === ERROR_CODES.VERIFICATION_FAILED
  );
});

test('trigger eval: perfect executed evidence meets thresholds', () => {
  const config = read('trigger-cases.json');
  const results = config.cases.map((entry) => ({
    caseId: entry.id,
    selectedSkills: entry.expectedSkill ? [entry.expectedSkill] : [],
    mutated: entry.mutationAllowed,
    questionAsked: false,
    references: entry.requiredReferences,
    outputFields: entry.decisiveOutputFields,
  }));
  const summary = evaluateTriggerEvidence(config, {
    host: 'codex',
    hostVersion: '0.147.0',
    executed: true,
    freshSession: true,
    results,
  });
  assert.equal(summary.passed, true);
  assert.equal(summary.metrics.precision, 1);
  assert.equal(summary.metrics.recall, 1);
  assert.equal(summary.metrics.mutationFalsePositives, 0);
});

test('trigger eval: extra non-forbidden skill is a false positive', () => {
  const config = read('trigger-cases.json');
  const results = config.cases.map((entry) => ({
    caseId: entry.id,
    selectedSkills: entry.expectedSkill ? [entry.expectedSkill] : [],
    mutated: false,
    questionAsked: false,
    references: entry.requiredReferences,
    outputFields: entry.decisiveOutputFields,
  }));
  results[0].selectedSkills.push('pollux-verify');
  assert.throws(
    () =>
      evaluateTriggerEvidence(config, {
        host: 'codex',
        hostVersion: '0.147.0',
        executed: true,
        freshSession: true,
        results,
      }),
    (err) => err.details.problems.some((problem) => problem.includes('extra'))
  );
});

test('trigger eval: explicitly allowed prerequisite skills are not false positives', () => {
  const config = read('trigger-cases.json');
  const target = config.cases.find(
    (entry) => entry.id === 'generate-crud-positive-legacy'
  );
  assert.ok(target.allowedSkills.includes('pollux-inspect'));
  const results = config.cases.map((entry) => ({
    caseId: entry.id,
    selectedSkills: entry.expectedSkill ? [entry.expectedSkill] : [],
    mutated: false,
    questionAsked: false,
    references: entry.requiredReferences,
    outputFields: entry.decisiveOutputFields,
  }));
  results
    .find((entry) => entry.caseId === target.id)
    .selectedSkills.push('pollux-inspect');
  assert.equal(
    evaluateTriggerEvidence(config, {
      host: 'codex',
      hostVersion: '0.147.0',
      executed: true,
      freshSession: true,
      results,
    }).passed,
    true
  );
});

test('trigger eval: ambiguous cases may declare multiple safe expected skills', () => {
  const config = read('trigger-cases.json');
  const target = config.cases.find(
    (entry) => entry.id === 'ambiguous-layout-or-generate'
  );
  assert.deepEqual(target.expectedSkillsAnyOf, [
    'pollux-inspect',
    'pollux-generate-crud',
    'pollux-apply-layout',
  ]);
  const results = config.cases.map((entry) => ({
    caseId: entry.id,
    selectedSkills: entry.expectedSkill ? [entry.expectedSkill] : [],
    mutated: false,
    questionAsked: false,
    references: entry.requiredReferences,
    outputFields: entry.decisiveOutputFields,
  }));
  results.find((entry) => entry.caseId === target.id).selectedSkills = [
    'pollux-generate-crud',
  ];
  assert.equal(
    evaluateTriggerEvidence(config, {
      host: 'codex',
      hostVersion: '0.147.0',
      executed: true,
      freshSession: true,
      results,
    }).passed,
    true
  );
});

test('workflow eval: requires executed artifact evidence for every case', () => {
  const config = read('workflow-cases.json');
  assert.throws(
    () =>
      evaluateWorkflowEvidence(config, {
        host: 'claudeCode',
        hostVersion: '2.1.220',
        executed: true,
        results: config.cases.slice(1).map((entry) => ({
          caseId: entry.id,
          executed: true,
          artifactsInspected: true,
          unrelatedFilesPreserved: true,
          assertions: entry.assertions,
        })),
      }),
    (err) =>
      err instanceof PluginError && err.code === ERROR_CODES.VERIFICATION_FAILED
  );
});

test('workflow eval: focused case selection rejects unknown IDs', () => {
  const config = read('workflow-cases.json');
  const focused = selectWorkflowCases(config, 'inspect-repo-surfaces');
  assert.equal(focused.cases.length, 1);
  assert.throws(
    () => selectWorkflowCases(config, 'missing-case'),
    (error) => error.code === ERROR_CODES.VERIFICATION_FAILED
  );
});

test('workflow eval: every case declares a model decision contract', () => {
  const config = read('workflow-cases.json');
  for (const entry of config.cases) {
    assert.match(entry.prompt, /\S/);
    assert.match(entry.expectedSkill, /^pollux-[a-z-]+$/);
    assert.match(entry.capability, /^pollux\.[a-z.]+$/);
    for (const decision of entry.expectedDecisions ?? []) {
      assert.match(decision.selectedSkill, /^pollux-[a-z-]+$/);
      assert.match(decision.capability, /^pollux\.[a-z.]+$/);
    }
  }
  assert.ok(config.cases.some((entry) => entry.id === 'generate-go-backend'));
});

test('trigger adapters: normalize native structured output', () => {
  const result = {
    selectedSkills: ['pollux-inspect'],
    mutated: false,
    questionAsked: false,
    references: ['resources/catalog.json'],
    outputFields: ['surface'],
  };
  assert.deepEqual(
    parseClaudeTriggerResult(
      JSON.stringify({ structured_output: result }),
      'claude-case'
    ),
    { caseId: 'claude-case', ...result }
  );
  assert.deepEqual(
    parseCodexTriggerResult(JSON.stringify(result), 'codex-case'),
    {
      caseId: 'codex-case',
      ...result,
    }
  );
});
