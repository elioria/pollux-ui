import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import {
  directoryDigest,
  hashFile,
  manifestDigest,
  PLUGIN_ROOT,
  REPO_ROOT,
} from '../scripts/lib/common.mjs';
import { RESOURCE_DECLARATIONS } from '../scripts/resources.config.mjs';

const copyPath = (from, to) => {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.cpSync(from, to, {
    recursive: true,
    filter(source) {
      const name = path.basename(source);
      return (
        name !== 'dist' &&
        name !== 'release.json' &&
        !name.startsWith('.resources.staging-') &&
        !name.startsWith('resources.previous-')
      );
    },
  });
};

const git = (cwd, args) =>
  execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' });

const makeCommittedFixture = (root) => {
  copyPath(PLUGIN_ROOT, path.join(root, 'plugins', 'pollux-ui'));
  const sources = new Set(
    RESOURCE_DECLARATIONS.flatMap((resource) => resource.sourcePaths)
  );
  for (const rel of sources) {
    copyPath(path.join(REPO_ROOT, rel), path.join(root, rel));
  }
  git(root, ['init', '-q']);
  git(root, ['config', 'user.email', 'release-test@example.invalid']);
  git(root, ['config', 'user.name', 'Release Test']);
  git(root, ['add', '-A']);
  git(root, ['commit', '-qm', 'release fixture']);
};

const runRelease = (root, evidenceDir) => {
  const script = path.join(
    root,
    'plugins',
    'pollux-ui',
    'scripts',
    'build-release.mjs'
  );
  execFileSync(
    process.execPath,
    [
      script,
      '--json',
      ...(evidenceDir ? [`--evidence-dir=${evidenceDir}`] : []),
    ],
    {
      cwd: root,
      encoding: 'utf8',
    }
  );
  return path.join(
    root,
    'plugins',
    'pollux-ui',
    'dist',
    'pollux-ui-0.1.0.tar.gz'
  );
};

const makeEvidence = (root, evidenceDir) => {
  fs.mkdirSync(evidenceDir, { recursive: true });
  const plugin = path.join(root, 'plugins', 'pollux-ui');
  const manifestPath = path.join(plugin, 'pollux.plugin.json');
  const originalManifest = fs.readFileSync(manifestPath);
  execFileSync(
    process.execPath,
    [path.join(plugin, 'scripts', 'build-manifest.mjs'), '--release'],
    { cwd: root, encoding: 'utf8' }
  );
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  fs.writeFileSync(manifestPath, originalManifest);
  const common = {
    schemaVersion: 1,
    passed: true,
    manifestDigest: manifestDigest(manifest),
    catalogDigest: JSON.parse(
      fs.readFileSync(path.join(plugin, 'resources', 'catalog.json'), 'utf8')
    ).catalogDigest,
    skillsDigest: directoryDigest(path.join(plugin, 'skills')),
    evaluatedAt: '2026-08-11T12:00:00.000Z',
  };
  const triggerHash = hashFile(
    path.join(plugin, 'tests', 'trigger-cases.json')
  );
  const workflowHash = hashFile(
    path.join(plugin, 'tests', 'workflow-cases.json')
  );
  const artifactHash = hashFile(
    path.join(plugin, 'scripts', 'adapters', 'workflow-artifacts.mjs')
  );
  for (const [host, filename, version] of [
    ['codex', 'codex', 'codex-cli 0.147.0'],
    ['claudeCode', 'claude', '2.1.220 (Claude Code)'],
  ]) {
    fs.writeFileSync(
      path.join(evidenceDir, `${filename}-trigger.json`),
      `${JSON.stringify({
        ...common,
        kind: 'trigger-evaluation',
        host,
        hostVersion: version,
        cases: 17,
        caseFileSha256: triggerHash,
        runnerSha256: hashFile(
          path.join(plugin, 'scripts', 'evaluate-triggers.mjs')
        ),
        hostAdapterSha256: hashFile(
          path.join(plugin, 'scripts', 'adapters', `${filename}-trigger.mjs`)
        ),
        metrics: { precision: 1, recall: 1, mutationFalsePositives: 0 },
      })}\n`
    );
    fs.writeFileSync(
      path.join(evidenceDir, `${filename}-workflow.json`),
      `${JSON.stringify({
        ...common,
        kind: 'workflow-evaluation',
        host,
        hostVersion: version,
        cases: 9,
        caseFileSha256: workflowHash,
        artifactAdapterSha256: artifactHash,
        runnerSha256: hashFile(
          path.join(plugin, 'scripts', 'evaluate-workflows.mjs')
        ),
        hostAdapterSha256: hashFile(
          path.join(plugin, 'scripts', 'adapters', `${filename}-workflow.mjs`)
        ),
      })}\n`
    );
  }
};

test('release: identical clean revisions produce byte-identical installable archives', () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'pollux-release-test-'));
  try {
    const base = path.join(parent, 'base');
    const first = path.join(parent, 'first');
    const second = path.join(parent, 'second');
    fs.mkdirSync(base);
    makeCommittedFixture(base);
    fs.cpSync(base, first, { recursive: true });
    fs.cpSync(base, second, { recursive: true });

    const firstArchive = runRelease(first);
    const secondArchive = runRelease(second);
    assert.equal(hashFile(firstArchive), hashFile(secondArchive));
    assert.deepEqual(
      fs.readFileSync(firstArchive),
      fs.readFileSync(secondArchive)
    );

    for (const [archive, name] of [
      [firstArchive, 'installed-a'],
      [secondArchive, 'installed-b'],
    ]) {
      const installed = path.join(parent, name);
      fs.mkdirSync(installed);
      execFileSync('tar', ['-xzf', archive, '-C', installed]);
      const output = execFileSync(
        process.execPath,
        [path.join(installed, 'scripts', 'validate-package.mjs')],
        { cwd: installed, encoding: 'utf8' }
      );
      assert.match(
        output,
        /package valid — 5 skills, 5 capabilities, 17 resources/
      );
    }
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test('release: complete current evidence promotes only to cross-model experimental', () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'pollux-stage4-test-'));
  try {
    const root = path.join(parent, 'repo');
    const evidenceDir = path.join(parent, 'evidence');
    fs.mkdirSync(root);
    makeCommittedFixture(root);
    makeEvidence(root, evidenceDir);
    runRelease(root, evidenceDir);
    const release = JSON.parse(
      fs.readFileSync(
        path.join(root, 'plugins', 'pollux-ui', 'release.json'),
        'utf8'
      )
    );
    assert.equal(release.validation.stage, 'cross-model-experimental');
    assert.equal(release.validation.hostValidators.codex.status, 'passed');
    assert.equal(release.validation.hostValidators.claudeCode.status, 'passed');
    assert.notEqual(release.validation.stage, 'supported-local-release');
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});
