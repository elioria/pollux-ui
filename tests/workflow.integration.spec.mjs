import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { PLUGIN_ROOT } from '../scripts/lib/common.mjs';

const adapter = path.join(
  PLUGIN_ROOT,
  'scripts',
  'adapters',
  'workflow-artifacts.mjs'
);
const config = JSON.parse(
  fs.readFileSync(
    path.join(PLUGIN_ROOT, 'tests', 'workflow-cases.json'),
    'utf8'
  )
);

for (const entry of config.cases) {
  test(`workflow artifacts: ${entry.id}`, () => {
    const fixtureRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), `pollux-workflow-integration-${entry.id}-`)
    );
    const sentinel = path.join(fixtureRoot, 'unrelated.sentinel');
    fs.writeFileSync(sentinel, 'preserve-me\n');
    try {
      const result = spawnSync(process.execPath, [adapter], {
        encoding: 'utf8',
        input: JSON.stringify({
          schemaVersion: 1,
          host: 'artifactProbe',
          freshSession: true,
          pluginRoot: PLUGIN_ROOT,
          fixtureRoot,
          case: entry,
        }),
      });
      assert.equal(result.status, 0, result.stderr || result.stdout);
      const evidence = JSON.parse(result.stdout);
      assert.equal(evidence.caseId, entry.id);
      assert.equal(evidence.executed, true);
      assert.equal(evidence.artifactsInspected, true);
      assert.deepEqual(evidence.assertions, entry.assertions);
      assert.equal(fs.readFileSync(sentinel, 'utf8'), 'preserve-me\n');
    } finally {
      fs.rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });
}
