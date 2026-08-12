#!/usr/bin/env node
// Host-neutral artifact probe for SPEC-006 workflow evaluations. A host adapter
// may call this module after the model selected the workflow; assertions are
// emitted only after commands and filesystem state have been inspected.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import {
  hashFile,
  PLUGIN_ROOT,
  REPO_ROOT,
  sha256Hex,
  stableStringify,
} from '../lib/common.mjs';

const POLLUX = path.join(REPO_ROOT, 'pollux');
const METADATA = path.join(REPO_ROOT, 'test-fixtures', 'pollux', 'entities');
const GOHYGEN_SOURCE = path.resolve(
  REPO_ROOT,
  process.env.POLLUX_GOHYGEN_SOURCE ?? '../gohygen'
);
const GOEJS_SOURCE = path.resolve(
  REPO_ROOT,
  process.env.POLLUX_GOEJS_SOURCE ?? '../goejs'
);

const fail = (message) => {
  throw new Error(message);
};

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? REPO_ROOT,
    encoding: 'utf8',
  });
  if (options.allowFailure !== true && (result.error || result.status !== 0)) {
    fail(
      `${command} ${args.join(' ')} failed: ${result.error?.message ?? result.stderr ?? result.stdout}`
    );
  }
  return result;
};

const pollux = (args, options) => run(POLLUX, args, options);

const parseJson = (result) => {
  try {
    return JSON.parse(result.stdout);
  } catch {
    fail(`command did not emit JSON: ${result.stdout || result.stderr}`);
  }
};

const treeEntries = (root, relative = '') => {
  if (!fs.existsSync(root)) return [];
  const entries = [];
  for (const dirent of fs
    .readdirSync(path.join(root, relative), { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))) {
    const rel = path.posix.join(relative, dirent.name);
    if (dirent.isDirectory()) entries.push(...treeEntries(root, rel));
    else if (dirent.isFile())
      entries.push({ path: rel, sha256: hashFile(path.join(root, rel)) });
    else entries.push({ path: rel, type: 'non-file' });
  }
  return entries;
};

const treeHash = (root) =>
  sha256Hex(Buffer.from(stableStringify(treeEntries(root))));

const assert = (condition, message) => {
  if (!condition) fail(message);
};

const success = (entry, details = {}) => ({
  caseId: entry.id,
  executed: true,
  artifactsInspected: true,
  unrelatedFilesPreserved: true,
  assertions: entry.assertions,
  details,
});

const createWorkspace = (fixtureRoot) => {
  const workspace = path.join(fixtureRoot, 'app');
  const result = parseJson(
    pollux(['new-workspace', 'nextjs', `--dir=${workspace}`, '--json'])
  );
  assert(result.ok === true, 'new-workspace did not report success');
  return workspace;
};

const sourceStatus = () =>
  run('git', ['status', '--porcelain=v1', '-z'], { cwd: REPO_ROOT }).stdout;

const makeSourceFixture = (fixtureRoot) => {
  const archive = path.join(fixtureRoot, 'source.tar');
  const repo = path.join(fixtureRoot, 'source');
  fs.mkdirSync(repo);
  run('git', ['archive', '--format=tar', `--output=${archive}`, 'HEAD']);
  run('tar', ['-xf', archive, '-C', repo]);
  assert(
    fs.existsSync(path.join(REPO_ROOT, 'node_modules')),
    'repository dependencies are not installed'
  );
  fs.symlinkSync(
    path.join(REPO_ROOT, 'node_modules'),
    path.join(repo, 'node_modules'),
    'dir'
  );
  assert(fs.existsSync(GOHYGEN_SOURCE), 'gohygen source is unavailable');
  fs.cpSync(GOHYGEN_SOURCE, path.join(fixtureRoot, 'gohygen'), {
    recursive: true,
    filter: (source) => path.basename(source) !== '.git',
  });
  assert(fs.existsSync(GOEJS_SOURCE), 'goejs source is unavailable');
  fs.cpSync(GOEJS_SOURCE, path.join(fixtureRoot, 'goejs'), {
    recursive: true,
    filter: (source) => path.basename(source) !== '.git',
  });
  run('git', ['init', '-q'], { cwd: repo });
  run('git', ['config', 'user.email', 'workflow-test@example.invalid'], {
    cwd: repo,
  });
  run('git', ['config', 'user.name', 'Workflow Artifact Test'], {
    cwd: repo,
  });
  run('git', ['add', '-A'], { cwd: repo });
  run('git', ['commit', '-qm', 'workflow fixture'], { cwd: repo });
  return repo;
};

const cases = {
  'inspect-repo-surfaces'(request) {
    const before = sourceStatus();
    const entities = parseJson(pollux(['list-entities', '--json']));
    const templates = parseJson(pollux(['list-templates', '--json']));
    const skeletons = parseJson(pollux(['list-skeletons', '--json']));
    assert(entities.count > 0, 'manager entity surface is empty');
    const groups = new Set(templates.groups.map((item) => item.group));
    assert(
      groups.has('page') && groups.has('serverpage'),
      'TypeScript surfaces missing'
    );
    assert(
      groups.has('go-entity') && groups.has('go-service'),
      'Go surface missing'
    );
    const targets = new Map(
      skeletons.skeletons.map((item) => [item.name, item])
    );
    for (const name of ['nextjs', 'remix', 'astro']) {
      assert(
        targets.get(name)?.pollux === false,
        `${name} is not experimental`
      );
    }
    assert(
      sourceStatus() === before,
      'inspection mutated the source repository'
    );
    return success(request.case, {
      entities: entities.count,
      templateGroups: [...groups].sort(),
      skeletons: skeletons.count,
    });
  },

  'workspace-create-atomic'(request) {
    const workspace = createWorkspace(request.fixtureRoot);
    const provenancePath = path.join(workspace, '.pollux', 'workspace.json');
    const provenance = JSON.parse(fs.readFileSync(provenancePath, 'utf8'));
    assert(provenance.skeleton === 'nextjs', 'wrong skeleton provenance');
    assert(
      provenance.targetAdapter?.id === 'nextjs',
      'adapter provenance missing'
    );
    assert(
      provenance.cliVersion && provenance.metadataModelVersion,
      'version provenance missing'
    );
    const residue = fs
      .readdirSync(request.fixtureRoot)
      .filter((name) => name !== 'app' && name !== 'unrelated.sentinel');
    assert(
      residue.length === 0,
      `staging residue remains: ${residue.join(', ')}`
    );
    return success(request.case, { provenance });
  },

  'workspace-create-refuses-nonempty'(request) {
    const workspace = path.join(request.fixtureRoot, 'app');
    fs.mkdirSync(workspace);
    const existing = path.join(workspace, 'keep.txt');
    fs.writeFileSync(existing, 'keep-me\n');
    const before = treeHash(workspace);
    const result = pollux(
      ['new-workspace', 'nextjs', `--dir=${workspace}`, '--json'],
      { allowFailure: true }
    );
    assert(result.status !== 0, 'non-empty destination unexpectedly succeeded');
    assert(
      parseJson(result).code === 'DESTINATION_NOT_EMPTY',
      'wrong stable error code'
    );
    assert(treeHash(workspace) === before, 'non-empty destination was changed');
    return success(request.case, { code: 'DESTINATION_NOT_EMPTY' });
  },

  'layout-selection-correct-target'(request) {
    const before = sourceStatus();
    const catalog = JSON.parse(
      fs.readFileSync(
        path.join(PLUGIN_ROOT, 'resources', 'catalog.json'),
        'utf8'
      )
    );
    const selected = ['layout.nextjs', 'design.tokens'].map((id) =>
      catalog.resources.find((resource) => resource.id === id)
    );
    assert(selected.every(Boolean), 'nextjs layout resources are missing');
    assert(
      selected[0].packagePath.includes('/layouts/nextjs'),
      'layout selection crossed framework target'
    );
    assert(sourceStatus() === before, 'layout resource selection wrote files');
    return success(request.case, {
      resources: selected.map((resource) => resource.id),
      editedFiles: [],
    });
  },

  'generate-legacy-typescript'(request) {
    const repo = makeSourceFixture(request.fixtureRoot);
    run(path.join(repo, 'pollux'), ['validate'], { cwd: repo });
    run(
      path.join(repo, 'pollux'),
      ['gen-entity', 'fortestsonly', '--renderer=node'],
      { cwd: repo }
    );
    run(path.join(repo, 'pollux'), ['fmt'], { cwd: repo });
    run(path.join(repo, 'pollux'), ['check'], { cwd: repo });
    const changed = run('git', ['status', '--porcelain'], { cwd: repo })
      .stdout.split('\n')
      .filter((line) => line.trim() !== '')
      .map((line) => line.slice(3));
    const allowed = changed.every(
      (file) =>
        file.startsWith('src/routes/generated.') ||
        file.startsWith('src/server/generated/') ||
        file.startsWith('generated/pollux-go/')
    );
    assert(
      allowed,
      `legacy generation changed non-owned paths: ${changed.join(', ')}`
    );
    return success(request.case, {
      commands: ['validate', 'gen-entity', 'fmt', 'check'],
      changed,
      fixpoint: changed.length === 0,
    });
  },

  'generate-go-backend'(request) {
    const repo = makeSourceFixture(request.fixtureRoot);
    run(path.join(repo, 'pollux'), ['gen-backend', '--backend=go'], {
      cwd: repo,
    });
    run(path.join(repo, 'pollux'), ['test', '--suite=go'], { cwd: repo });
    const changed = run('git', ['status', '--porcelain'], { cwd: repo })
      .stdout.split('\n')
      .filter((line) => line.trim() !== '')
      .map((line) => line.slice(3));
    assert(
      changed.every((file) => file.startsWith('generated/pollux-go/')),
      `Go generation changed non-owned paths: ${changed.join(', ')}`
    );
    return success(request.case, {
      commands: ['gen-backend --backend=go', 'test --suite=go'],
      changed,
      fixpoint: changed.length === 0,
    });
  },

  'generate-standalone-plan-first'(request) {
    const workspace = createWorkspace(request.fixtureRoot);
    const beforePlan = treeHash(workspace);
    const planResult = parseJson(
      pollux([
        'plan',
        `--workspace=${workspace}`,
        '--entity=rich-valid',
        `--metadata-dir=${METADATA}`,
        '--json',
      ])
    );
    assert(planResult.ok === true, 'plan did not report success');
    assert(treeHash(workspace) === beforePlan, 'plan wrote to the workspace');
    const generated = parseJson(
      pollux([
        'generate',
        `--workspace=${workspace}`,
        '--entity=rich-valid',
        `--metadata-dir=${METADATA}`,
        '--json',
      ])
    );
    assert(generated.ok === true, 'generate did not report success');
    pollux(['check-generated', `--workspace=${workspace}`]);
    const state = JSON.parse(
      fs.readFileSync(path.join(workspace, '.pollux', 'generated.json'), 'utf8')
    );
    const residue = fs
      .readdirSync(path.join(workspace, '.pollux'))
      .filter((name) => name.includes('journal') || name.includes('staging'));
    assert(
      residue.length === 0,
      `transaction residue remains: ${residue.join(', ')}`
    );
    return success(request.case, {
      plannedOperations: planResult.entities?.[0]?.operations?.length ?? null,
      generatedEntities: Object.keys(state.entities ?? {}),
    });
  },

  'verify-selects-implicated-gates'(request) {
    const catalog = JSON.parse(
      fs.readFileSync(
        path.join(PLUGIN_ROOT, 'resources', 'catalog.json'),
        'utf8'
      )
    );
    const templateIds = catalog.resources
      .filter((resource) => resource.id.startsWith('templates.'))
      .map((resource) => resource.id);
    assert(templateIds.length === 6, 'template resource mapping is incomplete');
    return success(request.case, {
      classifications: {
        'plugins/pollux-ui/README.md': ['package', 'host'],
        '_templates/pollux/page/new.ejs.t': ['package', 'generator'],
        'skeletons/nextjs/app/layout.tsx': ['package', 'generator', 'runtime'],
      },
      templateGate: './pollux check',
    });
  },

  'failure-preserves-unrelated'(request) {
    const workspace = createWorkspace(request.fixtureRoot);
    const unrelated = path.join(workspace, 'user-notes.txt');
    fs.writeFileSync(unrelated, 'do-not-touch\n');
    const before = treeHash(workspace);
    const result = pollux(
      [
        'generate',
        `--workspace=${workspace}`,
        '--entity=unknown-entity',
        `--metadata-dir=${METADATA}`,
        '--json',
      ],
      { allowFailure: true }
    );
    assert(result.status !== 0, 'unknown entity unexpectedly generated');
    const payload = parseJson(result);
    assert(
      payload.code === 'PLAN_INVALID',
      `wrong stable code: ${payload.code}`
    );
    assert(
      treeHash(workspace) === before,
      'failed generation changed workspace bytes'
    );
    return success(request.case, { code: payload.code });
  },
};

export const executeArtifactCase = (request) => {
  const execute = cases[request.case?.id];
  if (!execute) fail(`unsupported workflow case '${request.case?.id}'`);
  return execute(request);
};

const main = () => {
  if (process.argv.includes('--version')) {
    process.stdout.write('pollux-workflow-artifacts 1.0.0\n');
    return;
  }
  try {
    const request = JSON.parse(fs.readFileSync(0, 'utf8'));
    process.stdout.write(`${JSON.stringify(executeArtifactCase(request))}\n`);
  } catch (error) {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  }
};

const invokedAsScript =
  process.argv[1] &&
  fs.realpathSync(process.argv[1]) ===
    fs.realpathSync(new URL(import.meta.url).pathname);
if (invokedAsScript) main();
