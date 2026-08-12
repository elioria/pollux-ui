#!/usr/bin/env node
// SPEC-002 — verify the packaged resource snapshot matches canonical sources.
// Fails with RESOURCE_DRIFT naming the exact resource ID and changed path.
//
// Usage:
//   node plugins/pollux-ui/scripts/verify-source-drift.mjs [--json]
import fs from 'node:fs';
import path from 'node:path';

import {
  assertNoEscapingSymlinks,
  ERROR_CODES,
  hashFile,
  listFilesRecursive,
  parseCli,
  PLUGIN_ROOT,
  PluginError,
  readJson,
  REPO_ROOT,
  reportError,
  treeDigest,
} from './lib/common.mjs';
import { RESOURCE_DECLARATIONS } from './resources.config.mjs';

const CATALOG_PATH = path.join(PLUGIN_ROOT, 'resources', 'catalog.json');

const currentSourceFiles = (decl) => {
  const files = [];
  for (const rel of decl.sourcePaths) {
    const abs = path.resolve(REPO_ROOT, rel);
    if (!fs.existsSync(abs)) {
      throw new PluginError(
        ERROR_CODES.RESOURCE_DRIFT,
        `resource '${decl.id}': declared source path is missing: '${rel}'`,
        { resource: decl.id, path: rel }
      );
    }
    assertNoEscapingSymlinks(abs, REPO_ROOT);
    if (fs.statSync(abs).isDirectory()) {
      files.push(
        ...listFilesRecursive(abs).map((f) =>
          path.relative(REPO_ROOT, f).split(path.sep).join('/')
        )
      );
    } else {
      files.push(rel);
    }
  }
  return files.sort();
};

export const diffResourceFiles = (recordedFiles, currentFiles) => {
  const recorded = new Map(
    recordedFiles.map((file) => [file.sourcePath, file.sha256])
  );
  const current = new Map(currentFiles.map((file) => [file.path, file.sha256]));
  const changes = [];
  for (const [sourcePath, sha256] of recorded) {
    if (!current.has(sourcePath)) changes.push(`deleted ${sourcePath}`);
    else if (current.get(sourcePath) !== sha256) {
      changes.push(`modified ${sourcePath}`);
    }
  }
  for (const sourcePath of current.keys()) {
    if (!recorded.has(sourcePath)) changes.push(`added ${sourcePath}`);
  }
  return changes;
};

export const verifyDrift = () => {
  if (!fs.existsSync(CATALOG_PATH)) {
    throw new PluginError(
      ERROR_CODES.RESOURCE_CATALOG_INVALID,
      'resources/catalog.json is missing — run build-resources.mjs first'
    );
  }
  const catalog = readJson(CATALOG_PATH);
  const byId = new Map(catalog.resources.map((r) => [r.id, r]));
  const problems = [];

  for (const decl of RESOURCE_DECLARATIONS) {
    const recorded = byId.get(decl.id);
    if (!recorded) {
      problems.push(`resource '${decl.id}' is missing from the catalog`);
      continue;
    }
    const files = currentSourceFiles(decl).map((rel) => ({
      path: rel,
      sha256: hashFile(path.join(REPO_ROOT, rel)),
    }));
    const actual = treeDigest(files);
    if (actual !== recorded.sha256) {
      const changed = diffResourceFiles(recorded.files ?? [], files);
      problems.push(
        `resource '${decl.id}' drifted: ${changed.slice(0, 5).join(', ')}${changed.length > 5 ? ` (+${changed.length - 5} more)` : ''}`
      );
    }
  }

  for (const id of byId.keys()) {
    if (!RESOURCE_DECLARATIONS.some((d) => d.id === id)) {
      problems.push(`catalog contains undeclared resource '${id}'`);
    }
  }

  if (problems.length > 0) {
    throw new PluginError(
      ERROR_CODES.RESOURCE_DRIFT,
      'plugin resource snapshot is stale — run build-resources.mjs and review the diff',
      { problems }
    );
  }
  return {
    resources: catalog.resources.length,
    catalogDigest: catalog.catalogDigest,
  };
};

const main = () => {
  const { json } = parseCli(process.argv.slice(2));
  try {
    const { resources, catalogDigest } = verifyDrift();
    const payload = { ok: true, resources, catalogDigest };
    if (json) console.log(JSON.stringify(payload, null, 2));
    else
      console.log(`pollux-ui: no source drift across ${resources} resources`);
  } catch (err) {
    reportError(err, { json });
  }
};

const invokedAsScript =
  process.argv[1] &&
  fs.realpathSync(process.argv[1]) ===
    fs.realpathSync(new URL(import.meta.url).pathname);
if (invokedAsScript) main();
