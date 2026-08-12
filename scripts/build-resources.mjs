#!/usr/bin/env node
// SPEC-002 — build the hash-addressed plugin resource snapshot.
//
// Steps (per SPEC-002 "Snapshot construction"):
//   1. resolve and validate every declared source path;
//   2. reject absolute paths, traversal, escaping symlinks, build artifacts,
//      credentials, and generated application output;
//   3. copy into a staging plugin tree (sibling of resources/);
//   4. normalize ordering without changing source bytes;
//   5. calculate file and tree digests;
//   6. write resources/catalog.json last;
//   7. atomically publish the snapshot (rename).
//
// Usage:
//   node plugins/pollux-ui/scripts/build-resources.mjs [--json]
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  assertNoEscapingSymlinks,
  assertRepoRelativePath,
  ERROR_CODES,
  gitRevision,
  hashFile,
  listFilesRecursive,
  parseCli,
  PLUGIN_ROOT,
  PluginError,
  readJson,
  REPO_ROOT,
  reportError,
  treeDigest,
  writeJson,
} from './lib/common.mjs';
import { validateSchema } from './lib/json-schema.mjs';
import { RESOURCE_DECLARATIONS } from './resources.config.mjs';

const RESOURCES_DIR = path.join(PLUGIN_ROOT, 'resources');
const CATALOG_SCHEMA_PATH = path.join(RESOURCES_DIR, 'catalog.schema.json');

// Path segments that must never enter the snapshot.
const DENIED_SEGMENTS = new Set([
  'node_modules',
  '.git',
  '.next',
  '.astro',
  '.react-router',
  '.wrangler',
  '.turbo',
  '.cache',
  'dist',
  'build',
  'out',
  'coverage',
  '.output',
]);

const DENIED_FILES = new Set([
  '.env',
  '.env.local',
  '.env.development',
  '.env.production',
  'pnpm-lock.yaml',
  'package-lock.json',
  'yarn.lock',
]);

const CREDENTIAL_RE = /(secret|credential|private[-_]?key|id_rsa|\.pem$)/i;

// Generated application output is never a plugin resource (SPEC-002).
const DENIED_ROOTS = [
  'generated/',
  'src/app/(private)/generated/',
  'src/routes/generated',
  '.output/',
  'test-results/',
  'playwright-report/',
];

const assertSafeSourcePath = (rel) => {
  assertRepoRelativePath(rel, ERROR_CODES.PATH_UNSAFE);
  const segments = rel.split('/');
  for (const seg of segments) {
    if (DENIED_SEGMENTS.has(seg)) {
      throw new PluginError(
        ERROR_CODES.PATH_UNSAFE,
        `denied path segment '${seg}' in '${rel}'`,
        { path: rel }
      );
    }
  }
  const base = segments[segments.length - 1];
  if (DENIED_FILES.has(base) || CREDENTIAL_RE.test(base)) {
    throw new PluginError(
      ERROR_CODES.PATH_UNSAFE,
      `denied file '${rel}' (artifact, lockfile, or credential pattern)`,
      { path: rel }
    );
  }
  for (const root of DENIED_ROOTS) {
    if (rel === root.slice(0, -1) || rel.startsWith(root)) {
      throw new PluginError(
        ERROR_CODES.PATH_UNSAFE,
        `generated/build output is not a plugin resource: '${rel}'`,
        { path: rel }
      );
    }
  }
};

// Resolve one declared source path to a sorted file list (repo-relative).
const resolveSource = (rel) => {
  assertSafeSourcePath(rel);
  const abs = path.resolve(REPO_ROOT, rel);
  if (!fs.existsSync(abs)) {
    throw new PluginError(
      ERROR_CODES.RESOURCE_CATALOG_INVALID,
      `declared source path does not exist: '${rel}'`,
      { path: rel }
    );
  }
  assertNoEscapingSymlinks(abs, REPO_ROOT);
  const stat = fs.statSync(abs);
  if (stat.isFile()) return [rel];
  if (stat.isDirectory()) {
    return listFilesRecursive(abs).map((f) => {
      const r = path.relative(REPO_ROOT, f).split(path.sep).join('/');
      assertSafeSourcePath(r);
      return r;
    });
  }
  throw new PluginError(
    ERROR_CODES.PATH_UNSAFE,
    `unsupported file type at '${rel}'`,
    { path: rel }
  );
};

const copyResource = (decl, stagingRoot) => {
  const files = resolveSource(decl.sourcePaths[0]);
  for (const extra of decl.sourcePaths.slice(1)) {
    files.push(...resolveSource(extra));
  }
  files.sort();

  // Resource digest is always over source-relative paths + content hashes so
  // verify-source-drift.mjs can recompute it without the packaged tree.
  const sourceDigest = treeDigest(
    files.map((rel) => ({
      path: rel,
      sha256: hashFile(path.join(REPO_ROOT, rel)),
    }))
  );

  const entries = [];
  if (decl.packagePath !== null) {
    // packagePath is plugin-root-relative ('./resources/...'); stagingRoot
    // already represents resources/, so strip that prefix.
    const relPackage = decl.packagePath.replace(/^\.\/resources\//, '');
    const destRoot = path.join(stagingRoot, relPackage);
    const singleFile =
      decl.sourcePaths.length === 1 &&
      !fs.statSync(path.join(REPO_ROOT, decl.sourcePaths[0])).isDirectory();

    for (const rel of files) {
      const src = path.join(REPO_ROOT, rel);
      let dest;
      if (singleFile) {
        // exact file mapping: source file -> packagePath (a file path)
        dest = destRoot;
      } else {
        // directory mapping: preserve path relative to the resource root,
        // which is the longest common declared source directory
        const rootRel = commonSourceRoot(decl.sourcePaths, rel);
        dest = path.join(destRoot, rootRel);
      }
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
      entries.push({
        sourcePath: rel,
        path: path.relative(stagingRoot, dest).split(path.sep).join('/'),
        sha256: hashFile(src),
        bytes: fs.statSync(src).size,
      });
    }
    entries.sort((a, b) => a.path.localeCompare(b.path));
  }
  return { entries, sourceDigest };
};

// For directory-mapped resources, keep the file path relative to the
// declared source path it came from (basename collision-safe).
const commonSourceRoot = (sourcePaths, rel) => {
  for (const src of sourcePaths) {
    if (rel === src) return path.basename(src);
    if (rel.startsWith(`${src}/`)) {
      return path.join(path.basename(src), rel.slice(src.length + 1));
    }
  }
  return path.basename(rel);
};

export const buildResources = ({
  declarations = RESOURCE_DECLARATIONS,
  resourcesDir = RESOURCES_DIR,
  stagingDir,
  catalogSchemaPath = CATALOG_SCHEMA_PATH,
  renameSync = fs.renameSync,
} = {}) => {
  const revision = gitRevision();
  const transactionId = randomUUID();
  const actualStagingDir =
    stagingDir ??
    path.join(
      path.dirname(resourcesDir),
      `.resources.staging-${transactionId}`
    );
  if (fs.existsSync(actualStagingDir)) {
    throw new PluginError(
      ERROR_CODES.RESOURCE_CATALOG_INVALID,
      `resource staging path already exists: '${actualStagingDir}'`
    );
  }
  fs.mkdirSync(actualStagingDir, { recursive: true });

  try {
    // Preserve the schema inside the snapshot root (it lives in resources/).
    if (fs.existsSync(catalogSchemaPath)) {
      fs.copyFileSync(
        catalogSchemaPath,
        path.join(actualStagingDir, 'catalog.schema.json')
      );
    }

    const resources = declarations.map((decl) => {
      const { entries: files, sourceDigest } = copyResource(
        decl,
        actualStagingDir
      );
      if (decl.packagePath !== null && files.length === 0) {
        throw new PluginError(
          ERROR_CODES.RESOURCE_CATALOG_INVALID,
          `resource '${decl.id}' resolved to zero files`,
          { resource: decl.id }
        );
      }
      return {
        id: decl.id,
        kind: decl.kind,
        sourcePaths: [...decl.sourcePaths].sort(),
        packagePath: decl.packagePath,
        sha256: sourceDigest,
        sourceRevision: revision,
        ownership: decl.ownership,
        mutationPolicy: decl.mutationPolicy,
        generatorSurfaces: decl.generatorSurfaces,
        frameworkTargets: decl.frameworkTargets,
        supportStatus: decl.supportStatus,
        dependencies: decl.dependencies,
        entrypoints: decl.entrypoints,
        verification: decl.verification,
        ...(decl.packagePath !== null ? { files } : {}),
      };
    });

    const catalogCore = {
      schemaVersion: 1,
      version: readJson(path.join(PLUGIN_ROOT, 'manifest.config.json'))
        .compatibility.resourceCatalog,
      sourceRevision: revision,
      resources,
    };
    const catalog = {
      ...catalogCore,
      catalogDigest: treeDigest(
        resources.map((r) => ({ path: r.id, sha256: r.sha256 }))
      ),
    };

    const problems = validateSchema(catalog, readJson(catalogSchemaPath));
    if (problems.length > 0) {
      throw new PluginError(
        ERROR_CODES.RESOURCE_CATALOG_INVALID,
        'generated catalog failed schema validation',
        { problems }
      );
    }

    // 6. catalog.json is written last inside staging, then 7. atomic publish.
    writeJson(path.join(actualStagingDir, 'catalog.json'), catalog);

    const backup = `${resourcesDir}.previous-${transactionId}`;
    const hadExisting = fs.existsSync(resourcesDir);
    try {
      if (hadExisting) renameSync(resourcesDir, backup);
      renameSync(actualStagingDir, resourcesDir);
      if (hadExisting) fs.rmSync(backup, { recursive: true, force: true });
    } catch (cause) {
      if (
        hadExisting &&
        fs.existsSync(backup) &&
        !fs.existsSync(resourcesDir)
      ) {
        try {
          renameSync(backup, resourcesDir);
        } catch (restoreCause) {
          throw new PluginError(
            ERROR_CODES.RESOURCE_CATALOG_INVALID,
            'atomic resource publication failed and automatic restore failed',
            {
              problems: [
                `publish: ${cause.message}`,
                `restore: ${restoreCause.message}`,
                `original snapshot retained at '${backup}'`,
              ],
            }
          );
        }
      }
      throw new PluginError(
        ERROR_CODES.RESOURCE_CATALOG_INVALID,
        'atomic resource publication failed; original snapshot restored',
        { problems: [cause.message] }
      );
    }
    return catalog;
  } finally {
    fs.rmSync(actualStagingDir, { recursive: true, force: true });
  }
};

// Exported for path/symlink safety fixtures (SPEC-005 verification).
export { assertSafeSourcePath };

const main = () => {
  const { json } = parseCli(process.argv.slice(2));
  try {
    const catalog = buildResources();
    const payload = {
      ok: true,
      resources: catalog.resources.length,
      catalogDigest: catalog.catalogDigest,
      sourceRevision: catalog.sourceRevision,
    };
    if (json) console.log(JSON.stringify(payload, null, 2));
    else {
      console.log(
        `pollux-ui: snapshot built — ${catalog.resources.length} resources, digest ${catalog.catalogDigest.slice(0, 12)}…`
      );
    }
  } catch (err) {
    reportError(err, { json });
  }
};

const invokedAsScript =
  process.argv[1] &&
  fs.realpathSync(process.argv[1]) ===
    fs.realpathSync(new URL(import.meta.url).pathname);
if (invokedAsScript) main();
