#!/usr/bin/env node
// SPEC-006 layer 3 — execute trigger cases through a fresh-session host adapter.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import {
  directoryDigest,
  ERROR_CODES,
  hashFile,
  manifestDigest,
  parseCli,
  PLUGIN_ROOT,
  PluginError,
  readJson,
  reportError,
  writeJson,
} from './lib/common.mjs';

const CASES_PATH = path.join(PLUGIN_ROOT, 'tests', 'trigger-cases.json');

const fail = (problems, evidence) => {
  throw new PluginError(
    ERROR_CODES.VERIFICATION_FAILED,
    'trigger evaluation failed',
    { problems, evidence }
  );
};

export const evaluateTriggerEvidence = (config, evidence) => {
  const problems = [];
  if (!evidence.executed) problems.push('trigger cases were not executed');
  if (!evidence.freshSession)
    problems.push('host adapter did not use fresh sessions');
  if (!evidence.hostVersion) problems.push('host version was not recorded');
  const thresholds = config.thresholds?.[evidence.host];
  if (!thresholds)
    problems.push(`thresholds missing for host '${evidence.host}'`);

  const byId = new Map(
    (evidence.results ?? []).map((item) => [item.caseId, item])
  );
  let expected = 0;
  let hits = 0;
  let falsePositives = 0;
  let mutationFalsePositives = 0;
  const caseFailures = [];

  for (const entry of config.cases) {
    const result = byId.get(entry.id);
    if (!result) {
      caseFailures.push(`${entry.id}: missing executed result`);
      continue;
    }
    const selected = new Set(result.selectedSkills ?? []);
    const expectedSkills =
      entry.expectedSkillsAnyOf ??
      (entry.expectedSkill === null ? [] : [entry.expectedSkill]);
    const allowed = new Set(entry.allowedSkills ?? expectedSkills);
    const forbidden = entry.forbiddenSkills.filter((skill) =>
      selected.has(skill)
    );
    if (expectedSkills.length > 0) {
      expected += 1;
      if (expectedSkills.some((skill) => selected.has(skill))) hits += 1;
      else
        caseFailures.push(
          `${entry.id}: expected one of ${expectedSkills.join(', ')}`
        );
      const extra = [...selected].filter((skill) => !allowed.has(skill));
      if (extra.length > 0) {
        falsePositives += extra.length;
        caseFailures.push(`${entry.id}: extra skills ${extra.join(', ')}`);
      }
    } else if (selected.size > 0) {
      falsePositives += selected.size;
      caseFailures.push(`${entry.id}: unexpected skill selection`);
    }
    if (forbidden.length > 0) {
      caseFailures.push(`${entry.id}: forbidden ${forbidden.join(', ')}`);
    }
    if (result.mutated && !entry.mutationAllowed) {
      mutationFalsePositives += 1;
      caseFailures.push(`${entry.id}: unauthorized mutation`);
    }
    if (result.questionAsked && !entry.questionAllowed) {
      caseFailures.push(`${entry.id}: unexpected question`);
    }
    for (const reference of entry.requiredReferences) {
      if (!(result.references ?? []).includes(reference)) {
        caseFailures.push(`${entry.id}: missing reference ${reference}`);
      }
    }
    for (const field of entry.decisiveOutputFields) {
      if (!(result.outputFields ?? []).includes(field)) {
        caseFailures.push(`${entry.id}: missing output field ${field}`);
      }
    }
  }
  for (const id of byId.keys()) {
    if (!config.cases.some((entry) => entry.id === id)) {
      caseFailures.push(`undeclared result '${id}'`);
    }
  }

  const precision =
    hits + falsePositives === 0 ? 1 : hits / (hits + falsePositives);
  const recall = expected === 0 ? 1 : hits / expected;
  const metrics = { precision, recall, mutationFalsePositives };
  if (thresholds) {
    if (precision < thresholds.precision)
      problems.push(`precision ${precision} below ${thresholds.precision}`);
    if (recall < thresholds.recall)
      problems.push(`recall ${recall} below ${thresholds.recall}`);
    if (mutationFalsePositives > thresholds.mutationFalsePositives) {
      problems.push(
        `mutation false positives ${mutationFalsePositives} exceed ${thresholds.mutationFalsePositives}`
      );
    }
  }
  problems.push(...caseFailures);
  if (problems.length > 0) fail(problems, evidence);
  return {
    passed: true,
    host: evidence.host,
    hostVersion: evidence.hostVersion,
    metrics,
    cases: config.cases.length,
  };
};

const adapterArgv = (host, raw) => {
  const override =
    raw ??
    process.env[
      `POLLUX_${host === 'codex' ? 'CODEX' : 'CLAUDE'}_TRIGGER_ADAPTER`
    ];
  const value =
    override ??
    JSON.stringify([
      'node',
      path.join(
        PLUGIN_ROOT,
        'scripts',
        'adapters',
        host === 'codex' ? 'codex-trigger.mjs' : 'claude-trigger.mjs'
      ),
    ]);
  let argv;
  try {
    argv = JSON.parse(value);
  } catch {
    fail(['trigger adapter must be a JSON command array']);
  }
  if (
    !Array.isArray(argv) ||
    argv.length === 0 ||
    !argv.every((item) => typeof item === 'string')
  ) {
    fail(['trigger adapter must be a non-empty JSON string array']);
  }
  return argv;
};

export const selectTriggerCases = (completeConfig, caseId) => {
  const config = caseId
    ? {
        ...completeConfig,
        cases: completeConfig.cases.filter((entry) => entry.id === caseId),
      }
    : completeConfig;
  if (config.cases.length === 0) fail([`unknown trigger case '${caseId}'`]);
  return config;
};

export const executeTriggerCases = ({ host, adapter, caseId }) => {
  const config = selectTriggerCases(readJson(CASES_PATH), caseId);
  const argv = adapterArgv(host, adapter);
  const versionRun = spawnSync(argv[0], [...argv.slice(1), '--version'], {
    encoding: 'utf8',
  });
  if (versionRun.error || versionRun.status !== 0)
    fail([`trigger adapter for '${host}' is unavailable`]);
  const hostVersion =
    `${versionRun.stdout ?? ''}${versionRun.stderr ?? ''}`.trim();
  const results = config.cases.map((entry) => {
    const run = spawnSync(argv[0], argv.slice(1), {
      encoding: 'utf8',
      input: JSON.stringify({
        schemaVersion: 1,
        host,
        freshSession: true,
        pluginRoot: PLUGIN_ROOT,
        case: entry,
      }),
    });
    if (run.error || run.status !== 0) {
      const diagnostic = `${run.stderr ?? run.error?.message ?? ''}`
        .trim()
        .slice(-1000);
      fail([
        `${entry.id}: adapter exited ${run.status ?? run.error?.code}${diagnostic ? `: ${diagnostic}` : ''}`,
      ]);
    }
    try {
      return JSON.parse(run.stdout);
    } catch {
      fail([`${entry.id}: adapter did not return JSON`]);
    }
  });
  return evaluateTriggerEvidence(config, {
    host,
    hostVersion,
    executed: true,
    freshSession: true,
    results,
  });
};

const main = () => {
  const { flags, json } = parseCli(process.argv.slice(2));
  try {
    if (!['codex', 'claudeCode'].includes(flags.host))
      fail(['--host must be codex or claudeCode']);
    const result = executeTriggerCases({
      host: flags.host,
      adapter: flags.adapter,
      caseId: flags.case,
    });
    if (flags.evidence) {
      writeJson(path.resolve(flags.evidence), {
        schemaVersion: 1,
        kind: 'trigger-evaluation',
        ...result,
        manifestDigest: manifestDigest(
          readJson(path.join(PLUGIN_ROOT, 'pollux.plugin.json'))
        ),
        catalogDigest: readJson(
          path.join(PLUGIN_ROOT, 'resources', 'catalog.json')
        ).catalogDigest,
        skillsDigest: directoryDigest(path.join(PLUGIN_ROOT, 'skills')),
        caseFileSha256: hashFile(CASES_PATH),
        runnerSha256: hashFile(new URL(import.meta.url).pathname),
        hostAdapterSha256: hashFile(
          path.join(
            PLUGIN_ROOT,
            'scripts',
            'adapters',
            flags.host === 'codex' ? 'codex-trigger.mjs' : 'claude-trigger.mjs'
          )
        ),
        evaluatedAt: new Date().toISOString(),
      });
    }
    console.log(
      json
        ? JSON.stringify(result, null, 2)
        : `pollux-ui: ${result.host} trigger evaluation passed ${result.cases} cases`
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
