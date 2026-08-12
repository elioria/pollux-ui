#!/usr/bin/env node
// SPEC-007 — build the reproducible local release artifact for pollux-ui.
//
// Refuses dirty canonical sources, rebuilds manifest/resources/projections,
// runs package validation, records release.json (all hashes, versions,
// provenance, validation results, support matrix), and emits one tarball.
//
// Usage:
//   node plugins/pollux-ui/scripts/build-release.mjs [--json]
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { buildManifest } from './build-manifest.mjs';
import { buildProjections } from './build-projections.mjs';
import { buildResources } from './build-resources.mjs';
import {
  directoryDigest,
  dirtyWithin,
  ERROR_CODES,
  gitRevision,
  hashFile,
  manifestDigest,
  parseCli,
  PLUGIN_ROOT,
  PluginError,
  readJson,
  reportError,
  reproducibleTimestamp,
  writeJson,
} from './lib/common.mjs';
import { validatePackage } from './validate-package.mjs';
import { verifyDrift } from './verify-source-drift.mjs';

const RELEASE_ROOT = path.join(PLUGIN_ROOT, 'dist');
const EVIDENCE_FILES = {
  codexTrigger: ['codex-trigger.json', 'trigger-evaluation', 'codex', 17],
  claudeTrigger: [
    'claude-trigger.json',
    'trigger-evaluation',
    'claudeCode',
    17,
  ],
  codexWorkflow: ['codex-workflow.json', 'workflow-evaluation', 'codex', 9],
  claudeWorkflow: [
    'claude-workflow.json',
    'workflow-evaluation',
    'claudeCode',
    9,
  ],
};

export const validateCrossModelEvidence = (evidenceDir, manifest) => {
  const problems = [];
  const evidence = {};
  const expectedManifestDigest = manifestDigest(manifest);
  const expectedCatalogDigest = readJson(
    path.join(PLUGIN_ROOT, 'resources', 'catalog.json')
  ).catalogDigest;
  const expectedSkillsDigest = directoryDigest(
    path.join(PLUGIN_ROOT, 'skills')
  );
  for (const [key, [filename, kind, host, cases]] of Object.entries(
    EVIDENCE_FILES
  )) {
    const file = path.join(evidenceDir, filename);
    if (!fs.existsSync(file)) {
      problems.push(`${filename}: missing`);
      continue;
    }
    const item = readJson(file);
    evidence[key] = item;
    if (item.schemaVersion !== 1) problems.push(`${filename}: schemaVersion`);
    if (item.kind !== kind) problems.push(`${filename}: kind`);
    if (item.host !== host) problems.push(`${filename}: host`);
    if (item.passed !== true) problems.push(`${filename}: not passed`);
    if (item.cases !== cases)
      problems.push(`${filename}: expected ${cases} cases`);
    if (item.manifestDigest !== expectedManifestDigest)
      problems.push(`${filename}: manifest digest mismatch`);
    if (item.catalogDigest !== expectedCatalogDigest)
      problems.push(`${filename}: catalog digest mismatch`);
    if (item.skillsDigest !== expectedSkillsDigest)
      problems.push(`${filename}: skills digest mismatch`);
    if (!item.hostVersion) problems.push(`${filename}: host version missing`);
    if (!Number.isFinite(Date.parse(item.evaluatedAt)))
      problems.push(`${filename}: invalid evaluatedAt`);
    const expectedCaseHash = hashFile(
      path.join(
        PLUGIN_ROOT,
        'tests',
        kind === 'trigger-evaluation'
          ? 'trigger-cases.json'
          : 'workflow-cases.json'
      )
    );
    if (item.caseFileSha256 !== expectedCaseHash)
      problems.push(`${filename}: case file digest mismatch`);
    const kindPrefix = kind === 'trigger-evaluation' ? 'trigger' : 'workflow';
    if (
      item.runnerSha256 !==
      hashFile(path.join(PLUGIN_ROOT, 'scripts', `evaluate-${kindPrefix}s.mjs`))
    ) {
      problems.push(`${filename}: runner digest mismatch`);
    }
    if (
      item.hostAdapterSha256 !==
      hashFile(
        path.join(
          PLUGIN_ROOT,
          'scripts',
          'adapters',
          `${host === 'codex' ? 'codex' : 'claude'}-${kindPrefix}.mjs`
        )
      )
    ) {
      problems.push(`${filename}: host adapter digest mismatch`);
    }
    if (
      kind === 'trigger-evaluation' &&
      (item.metrics?.precision !== 1 ||
        item.metrics?.recall !== 1 ||
        item.metrics?.mutationFalsePositives !== 0)
    ) {
      problems.push(`${filename}: trigger thresholds not met`);
    }
    if (
      kind === 'workflow-evaluation' &&
      item.artifactAdapterSha256 !==
        hashFile(
          path.join(
            PLUGIN_ROOT,
            'scripts',
            'adapters',
            'workflow-artifacts.mjs'
          )
        )
    ) {
      problems.push(`${filename}: artifact adapter digest mismatch`);
    }
  }
  if (problems.length > 0) {
    throw new PluginError(
      ERROR_CODES.VERIFICATION_FAILED,
      'cross-model evidence is incomplete or stale',
      { problems }
    );
  }
  return evidence;
};

// Canonical sources must be clean for a release even when unrelated dirty
// paths exist elsewhere (SPEC-005 "Dirty worktree behavior").
const CANONICAL_SOURCE_ROOTS = [
  '_templates/pollux',
  '_templates/pollux-targets',
  'skeletons',
  'scripts/pollux',
  'plugins/pollux-ui',
  'CLAUDE.md',
  'POLLUX-GEN-KB.md',
  'docs/operations',
];

export const buildRelease = ({ evidenceDir } = {}) => {
  const dirty = dirtyWithin(CANONICAL_SOURCE_ROOTS);
  if (dirty.length > 0) {
    throw new PluginError(
      ERROR_CODES.SOURCE_DIRTY,
      'release requires clean canonical sources',
      { problems: dirty }
    );
  }

  // Full deterministic rebuild from canonical source.
  const builtAt = reproducibleTimestamp();
  const { manifest } = buildManifest({ release: true, builtAt });
  const catalog = buildResources();
  for (const [abs, content] of buildProjections()) {
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
  const drift = verifyDrift();
  const validation = validatePackage();
  const crossModelEvidence = evidenceDir
    ? validateCrossModelEvidence(path.resolve(evidenceDir), manifest)
    : null;

  const hashTree = (relDir) => {
    const abs = path.join(PLUGIN_ROOT, relDir);
    const out = {};
    const walk = (dir) => {
      for (const e of fs
        .readdirSync(dir, { withFileTypes: true })
        .sort((a, b) => a.name.localeCompare(b.name))) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else
          out[path.relative(PLUGIN_ROOT, full).split(path.sep).join('/')] =
            hashFile(full);
      }
    };
    if (fs.existsSync(abs)) walk(abs);
    return out;
  };

  const release = {
    schemaVersion: 1,
    name: manifest.name,
    version: manifest.version,
    source: {
      repository: manifest.source.repository,
      revision: gitRevision(),
      dirty: false,
    },
    versions: {
      pluginSchema: manifest.schemaVersion,
      plugin: manifest.version,
      resourceCatalog: manifest.compatibility.resourceCatalog,
      skillContract: manifest.compatibility.skillContract,
      compatibility: manifest.compatibility,
      builder: { node: process.version },
    },
    digests: {
      manifest: manifestDigest(manifest),
      catalog: catalog.catalogDigest,
      skills: hashTree('skills'),
      projections: {
        codex: hashFile(path.join(PLUGIN_ROOT, '.codex-plugin', 'plugin.json')),
        claudeCode: hashFile(
          path.join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json')
        ),
      },
    },
    supportMatrix: {
      supported: catalog.resources
        .filter((r) => r.supportStatus === 'supported')
        .map((r) => r.id),
      experimental: catalog.resources
        .filter((r) => r.supportStatus === 'experimental')
        .map((r) => r.id),
      referenceOnly: catalog.resources
        .filter((r) => r.supportStatus === 'reference-only')
        .map((r) => r.id),
    },
    validation: {
      stage: crossModelEvidence ? 'cross-model-experimental' : 'schema-preview',
      checks: [
        {
          command: 'node plugins/pollux-ui/scripts/validate-package.mjs',
          status: 'passed',
        },
        {
          command: 'node plugins/pollux-ui/scripts/verify-source-drift.mjs',
          status: 'passed',
          result: drift,
        },
        {
          command:
            'node plugins/pollux-ui/scripts/build-projections.mjs --check',
          status: 'passed',
        },
      ],
      hostValidators: {
        codex: {
          status: crossModelEvidence ? 'passed' : 'not-run',
          requiredForStage: Boolean(crossModelEvidence),
          ...(crossModelEvidence
            ? { version: crossModelEvidence.codexTrigger.hostVersion }
            : {}),
        },
        claudeCode: {
          status: crossModelEvidence ? 'passed' : 'not-run',
          requiredForStage: Boolean(crossModelEvidence),
          ...(crossModelEvidence
            ? { version: crossModelEvidence.claudeTrigger.hostVersion }
            : {}),
        },
      },
      evaluations: crossModelEvidence
        ? {
            triggers: {
              codex: crossModelEvidence.codexTrigger,
              claudeCode: crossModelEvidence.claudeTrigger,
            },
            workflows: {
              codex: crossModelEvidence.codexWorkflow,
              claudeCode: crossModelEvidence.claudeWorkflow,
            },
          }
        : { status: 'not-run' },
    },
    builtAt,
  };

  fs.rmSync(RELEASE_ROOT, { recursive: true, force: true });
  fs.mkdirSync(RELEASE_ROOT, { recursive: true });
  writeJson(path.join(PLUGIN_ROOT, 'release.json'), release);

  // One reproducible tarball: manifests, skills, resources, scripts, tests,
  // release.json. No node_modules, caches, secrets, or generated app output.
  const archive = path.join(
    RELEASE_ROOT,
    `pollux-ui-${manifest.version}.tar.gz`
  );
  const fileListPath = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), 'pollux-release-')),
    'files.txt'
  );
  const entries = [
    'pollux.plugin.json',
    'pollux.plugin.schema.json',
    'manifest.config.json',
    'release.json',
    '.codex-plugin',
    '.claude-plugin',
    'skills',
    'resources',
    'scripts',
    'tests',
  ];
  fs.writeFileSync(fileListPath, entries.join('\n'));
  execFileSync(
    'tar',
    [
      '--sort=name',
      '--owner=0',
      '--group=0',
      '--numeric-owner',
      '--mtime=@0',
      '--use-compress-program=gzip -n',
      '-cf',
      archive,
      '-C',
      PLUGIN_ROOT,
      '-T',
      fileListPath,
    ],
    { stdio: 'pipe' }
  );

  return {
    release,
    archive: path.relative(PLUGIN_ROOT, archive),
    archiveSha256: hashFile(archive),
    validation,
  };
};

const main = () => {
  const { flags, json } = parseCli(process.argv.slice(2));
  try {
    const { release, archive, archiveSha256 } = buildRelease({
      evidenceDir: flags['evidence-dir'],
    });
    const payload = {
      ok: true,
      version: release.version,
      archive,
      archiveSha256,
      manifestDigest: release.digests.manifest,
      catalogDigest: release.digests.catalog,
      stage: release.validation.stage,
    };
    if (json) console.log(JSON.stringify(payload, null, 2));
    else {
      console.log(`pollux-ui: release ${release.version} built`);
      console.log(`  archive ${archive}`);
      console.log(`  sha256  ${archiveSha256}`);
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
