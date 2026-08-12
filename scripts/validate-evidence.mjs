#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

import { validateCrossModelEvidence } from './build-release.mjs';
import {
  ERROR_CODES,
  parseCli,
  PLUGIN_ROOT,
  PluginError,
  readJson,
  reportError,
} from './lib/common.mjs';

const main = () => {
  const { flags, json } = parseCli(process.argv.slice(2));
  try {
    if (!flags['evidence-dir']) {
      throw new PluginError(
        ERROR_CODES.USAGE,
        '--evidence-dir=<path> is required'
      );
    }
    const evidence = validateCrossModelEvidence(
      path.resolve(flags['evidence-dir']),
      readJson(path.join(PLUGIN_ROOT, 'pollux.plugin.json'))
    );
    const result = {
      ok: true,
      stage: 'cross-model-experimental',
      reports: Object.keys(evidence).length,
    };
    console.log(
      json
        ? JSON.stringify(result, null, 2)
        : `pollux-ui: ${result.reports} current evidence reports validate for Stage 4`
    );
  } catch (error) {
    reportError(error, { json });
  }
};

const invokedAsScript =
  process.argv[1] &&
  fs.realpathSync(process.argv[1]) ===
    fs.realpathSync(new URL(import.meta.url).pathname);
if (invokedAsScript) main();
