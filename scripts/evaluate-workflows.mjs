#!/usr/bin/env node
// SPEC-006 layer 4 — verify host workflow runs with artifact evidence.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
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

const CASES_PATH = path.join(PLUGIN_ROOT, 'tests', 'workflow-cases.json');

const fail = (problems, evidence) => {
  throw new PluginError(
    ERROR_CODES.VERIFICATION_FAILED,
    'workflow evaluation failed',
    { problems, evidence }
  );
};

export const evaluateWorkflowEvidence = (config, evidence) => {
  const problems = [];
  if (!evidence.executed) problems.push('workflow cases were not executed');
  if (!evidence.hostVersion) problems.push('host version was not recorded');
  const byId = new Map(
    (evidence.results ?? []).map((item) => [item.caseId, item])
  );
  for (const entry of config.cases) {
    const result = byId.get(entry.id);
    if (!result) {
      problems.push(`${entry.id}: missing executed result`);
      continue;
    }
    if (!result.executed) problems.push(`${entry.id}: not executed`);
    if (!result.artifactsInspected)
      problems.push(`${entry.id}: artifacts not inspected`);
    if (!result.unrelatedFilesPreserved)
      problems.push(`${entry.id}: unrelated files changed`);
    for (const assertion of entry.assertions) {
      if (!(result.assertions ?? []).includes(assertion)) {
        problems.push(`${entry.id}: missing assertion evidence '${assertion}'`);
      }
    }
  }
  for (const id of byId.keys()) {
    if (!config.cases.some((entry) => entry.id === id))
      problems.push(`undeclared result '${id}'`);
  }
  if (problems.length > 0) fail(problems, evidence);
  return {
    passed: true,
    host: evidence.host,
    hostVersion: evidence.hostVersion,
    cases: config.cases.length,
  };
};

const adapterArgv = (host, raw) => {
  const override =
    raw ??
    process.env[
      `POLLUX_${host === 'codex' ? 'CODEX' : 'CLAUDE'}_WORKFLOW_ADAPTER`
    ];
  const value =
    override ??
    JSON.stringify([
      'node',
      path.join(
        PLUGIN_ROOT,
        'scripts',
        'adapters',
        host === 'codex' ? 'codex-workflow.mjs' : 'claude-workflow.mjs'
      ),
    ]);
  try {
    const argv = JSON.parse(value);
    if (
      Array.isArray(argv) &&
      argv.length > 0 &&
      argv.every((item) => typeof item === 'string')
    )
      return argv;
  } catch {
    // Report one stable contract error below.
  }
  fail(['workflow adapter must be a non-empty JSON string array']);
};

export const selectWorkflowCases = (completeConfig, caseId) => {
  const config = caseId
    ? {
        ...completeConfig,
        cases: completeConfig.cases.filter((entry) => entry.id === caseId),
      }
    : completeConfig;
  if (config.cases.length === 0) fail([`unknown workflow case '${caseId}'`]);
  return config;
};

export const executeWorkflowCases = ({ host, adapter, caseId }) => {
  const config = selectWorkflowCases(readJson(CASES_PATH), caseId);
  const argv = adapterArgv(host, adapter);
  const versionRun = spawnSync(argv[0], [...argv.slice(1), '--version'], {
    encoding: 'utf8',
  });
  if (versionRun.error || versionRun.status !== 0)
    fail([`workflow adapter for '${host}' is unavailable`]);
  const hostVersion =
    `${versionRun.stdout ?? ''}${versionRun.stderr ?? ''}`.trim();
  const results = config.cases.map((entry) => {
    const fixtureRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), `pollux-workflow-${entry.id}-`)
    );
    const sentinel = path.join(fixtureRoot, 'unrelated.sentinel');
    fs.writeFileSync(sentinel, 'preserve-me\n');
    const before = hashFile(sentinel);
    try {
      const run = spawnSync(argv[0], argv.slice(1), {
        encoding: 'utf8',
        input: JSON.stringify({
          schemaVersion: 1,
          host,
          freshSession: true,
          pluginRoot: PLUGIN_ROOT,
          fixtureRoot,
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
      const result = JSON.parse(run.stdout);
      return {
        ...result,
        unrelatedFilesPreserved:
          fs.existsSync(sentinel) &&
          hashFile(sentinel) === before &&
          result.unrelatedFilesPreserved !== false,
      };
    } catch (err) {
      if (err instanceof PluginError) throw err;
      fail([`${entry.id}: adapter did not return valid JSON`]);
    } finally {
      fs.rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });
  return evaluateWorkflowEvidence(config, {
    host,
    hostVersion,
    executed: true,
    results,
  });
};

const main = () => {
  const { flags, json } = parseCli(process.argv.slice(2));
  try {
    if (!['codex', 'claudeCode'].includes(flags.host))
      fail(['--host must be codex or claudeCode']);
    const result = executeWorkflowCases({
      host: flags.host,
      adapter: flags.adapter,
      caseId: flags.case,
    });
    if (flags.evidence) {
      writeJson(path.resolve(flags.evidence), {
        schemaVersion: 1,
        kind: 'workflow-evaluation',
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
            flags.host === 'codex'
              ? 'codex-workflow.mjs'
              : 'claude-workflow.mjs'
          )
        ),
        artifactAdapterSha256: hashFile(
          path.join(
            PLUGIN_ROOT,
            'scripts',
            'adapters',
            'workflow-artifacts.mjs'
          )
        ),
        evaluatedAt: new Date().toISOString(),
      });
    }
    console.log(
      json
        ? JSON.stringify(result, null, 2)
        : `pollux-ui: ${result.host} workflow evaluation passed ${result.cases} cases`
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
