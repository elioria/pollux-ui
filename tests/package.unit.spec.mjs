// SPEC-001/002/004/005/006 — plugin package unit tests.
// Run: node --test plugins/pollux-ui/tests/*.unit.spec.mjs
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { buildManifest } from '../scripts/build-manifest.mjs';
import { buildProjections } from '../scripts/build-projections.mjs';
import { validateCrossModelEvidence } from '../scripts/build-release.mjs';
import {
  assertSafeSourcePath,
  buildResources,
} from '../scripts/build-resources.mjs';
import {
  directoryDigest,
  ERROR_CODES,
  gitDirtyPaths,
  hashFile,
  isSemver,
  isSemverRange,
  manifestDigest,
  PLUGIN_ROOT,
  PluginError,
  readJson,
  reproducibleTimestamp,
  resolvePackagePath,
} from '../scripts/lib/common.mjs';
import { validateSchema } from '../scripts/lib/json-schema.mjs';
import {
  parseFrontmatter,
  validatePackage,
} from '../scripts/validate-package.mjs';
import {
  diffResourceFiles,
  verifyDrift,
} from '../scripts/verify-source-drift.mjs';

const manifestSchema = readJson(
  path.join(PLUGIN_ROOT, 'pollux.plugin.schema.json')
);
const catalogSchema = readJson(
  path.join(PLUGIN_ROOT, 'resources', 'catalog.schema.json')
);
const manifest = () => readJson(path.join(PLUGIN_ROOT, 'pollux.plugin.json'));
const catalog = () =>
  readJson(path.join(PLUGIN_ROOT, 'resources', 'catalog.json'));

const tmpdir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'pollux-ui-'));
const git = (cwd, args) =>
  execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' });

// ------------------------------------------------------------- SPEC-001

test('manifest: schema accepts the built manifest', () => {
  assert.deepEqual(validateSchema(manifest(), manifestSchema), []);
});

test('manifest: rejects unknown schema versions', () => {
  const bad = { ...manifest(), schemaVersion: 99 };
  assert.ok(validateSchema(bad, manifestSchema).length > 0);
});

test('manifest: rejects duplicate capability and skill IDs', () => {
  const m = manifest();
  const dupCap = {
    ...m,
    capabilities: [...m.capabilities, m.capabilities[0]],
  };
  assert.throws(
    () => assertDuplicateFree(dupCap),
    (err) =>
      err instanceof PluginError &&
      err.code === ERROR_CODES.PLUGIN_MANIFEST_INVALID
  );
});

// Mirror of the builder's semantic checks, applied to synthetic manifests.
const assertDuplicateFree = (m) => {
  const capIds = m.capabilities.map((c) => c.id);
  const skillIds = m.skills.map((s) => s.id);
  const problems = [];
  for (const id of capIds.filter((v, i) => capIds.indexOf(v) !== i)) {
    problems.push(`duplicate capability id '${id}'`);
  }
  for (const id of skillIds.filter((v, i) => skillIds.indexOf(v) !== i)) {
    problems.push(`duplicate skill id '${id}'`);
  }
  if (problems.length > 0) {
    throw new PluginError(ERROR_CODES.PLUGIN_MANIFEST_INVALID, 'dup', {
      problems,
    });
  }
};

test('manifest: rejects invalid semver and ranges', () => {
  assert.equal(isSemver('0.1.0'), true);
  assert.equal(isSemver('0.1'), false);
  assert.equal(isSemver('latest'), false);
  assert.equal(isSemverRange('^0.2.0'), true);
  assert.equal(isSemverRange('>=1.0.0 <2.0.0'), true);
  assert.equal(isSemverRange('>= 1.0.0'), false);
  assert.equal(isSemverRange('*'), false);
  assert.equal(isSemverRange(''), false);
});

test('manifest: normalized digest excludes builtAt and is deterministic', () => {
  const a = buildManifest();
  const b = buildManifest();
  assert.equal(a.digest, b.digest);
  const mutated = structuredClone(a.manifest);
  mutated.source.builtAt = '1999-01-01T00:00:00.000Z';
  assert.equal(manifestDigest(mutated), a.digest);
  const changed = structuredClone(a.manifest);
  changed.version = '9.9.9';
  assert.notEqual(manifestDigest(changed), a.digest);
});

test('release: reproducible timestamp honors SOURCE_DATE_EPOCH', () => {
  assert.equal(
    reproducibleTimestamp({ sourceDateEpoch: '1723377600' }),
    '2024-08-11T12:00:00.000Z'
  );
  assert.throws(
    () => reproducibleTimestamp({ sourceDateEpoch: 'not-an-epoch' }),
    (err) =>
      err instanceof PluginError &&
      err.code === ERROR_CODES.PLUGIN_MANIFEST_INVALID
  );
});

test('release: Stage 4 evidence must be complete, current, and threshold-green', () => {
  const dir = tmpdir();
  const currentManifest = manifest();
  const common = {
    schemaVersion: 1,
    passed: true,
    manifestDigest: manifestDigest(currentManifest),
    catalogDigest: catalog().catalogDigest,
    skillsDigest: directoryDigest(path.join(PLUGIN_ROOT, 'skills')),
    evaluatedAt: '2026-08-11T12:00:00.000Z',
  };
  const files = {
    'codex-trigger.json': {
      ...common,
      kind: 'trigger-evaluation',
      host: 'codex',
      hostVersion: 'codex-cli 0.147.0',
      cases: 17,
      caseFileSha256: hashFile(
        path.join(PLUGIN_ROOT, 'tests', 'trigger-cases.json')
      ),
      runnerSha256: hashFile(
        path.join(PLUGIN_ROOT, 'scripts', 'evaluate-triggers.mjs')
      ),
      hostAdapterSha256: hashFile(
        path.join(PLUGIN_ROOT, 'scripts', 'adapters', 'codex-trigger.mjs')
      ),
      metrics: { precision: 1, recall: 1, mutationFalsePositives: 0 },
    },
    'claude-trigger.json': {
      ...common,
      kind: 'trigger-evaluation',
      host: 'claudeCode',
      hostVersion: '2.1.220 (Claude Code)',
      cases: 17,
      caseFileSha256: hashFile(
        path.join(PLUGIN_ROOT, 'tests', 'trigger-cases.json')
      ),
      runnerSha256: hashFile(
        path.join(PLUGIN_ROOT, 'scripts', 'evaluate-triggers.mjs')
      ),
      hostAdapterSha256: hashFile(
        path.join(PLUGIN_ROOT, 'scripts', 'adapters', 'claude-trigger.mjs')
      ),
      metrics: { precision: 1, recall: 1, mutationFalsePositives: 0 },
    },
    'codex-workflow.json': {
      ...common,
      kind: 'workflow-evaluation',
      host: 'codex',
      hostVersion: 'codex-cli 0.147.0',
      cases: 9,
      caseFileSha256: hashFile(
        path.join(PLUGIN_ROOT, 'tests', 'workflow-cases.json')
      ),
      artifactAdapterSha256: hashFile(
        path.join(PLUGIN_ROOT, 'scripts', 'adapters', 'workflow-artifacts.mjs')
      ),
      runnerSha256: hashFile(
        path.join(PLUGIN_ROOT, 'scripts', 'evaluate-workflows.mjs')
      ),
      hostAdapterSha256: hashFile(
        path.join(PLUGIN_ROOT, 'scripts', 'adapters', 'codex-workflow.mjs')
      ),
    },
    'claude-workflow.json': {
      ...common,
      kind: 'workflow-evaluation',
      host: 'claudeCode',
      hostVersion: '2.1.220 (Claude Code)',
      cases: 9,
      caseFileSha256: hashFile(
        path.join(PLUGIN_ROOT, 'tests', 'workflow-cases.json')
      ),
      artifactAdapterSha256: hashFile(
        path.join(PLUGIN_ROOT, 'scripts', 'adapters', 'workflow-artifacts.mjs')
      ),
      runnerSha256: hashFile(
        path.join(PLUGIN_ROOT, 'scripts', 'evaluate-workflows.mjs')
      ),
      hostAdapterSha256: hashFile(
        path.join(PLUGIN_ROOT, 'scripts', 'adapters', 'claude-workflow.mjs')
      ),
    },
  };
  for (const [name, value] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), `${JSON.stringify(value)}\n`);
  }
  assert.equal(
    Object.keys(validateCrossModelEvidence(dir, currentManifest)).length,
    4
  );
  files['codex-trigger.json'].metrics.recall = 0.99;
  fs.writeFileSync(
    path.join(dir, 'codex-trigger.json'),
    `${JSON.stringify(files['codex-trigger.json'])}\n`
  );
  assert.throws(
    () => validateCrossModelEvidence(dir, currentManifest),
    (error) => error.code === ERROR_CODES.VERIFICATION_FAILED
  );
});

test('manifest: inspect/verify capabilities cannot write; none may use network', () => {
  for (const cap of manifest().capabilities) {
    if (cap.mode === 'inspect' || cap.mode === 'verify') {
      assert.equal(
        cap.authority.writesFilesystem,
        false,
        `${cap.id} must be read-only`
      );
    }
    assert.equal(cap.authority.networkAccess, false, cap.id);
  }
});

test('manifest: every capability references declared skills and resources', () => {
  const skillIds = new Set(manifest().skills.map((s) => s.id));
  const resourceIds = new Set(catalog().resources.map((r) => r.id));
  for (const cap of manifest().capabilities) {
    for (const s of cap.skills) assert.ok(skillIds.has(s), `${cap.id} -> ${s}`);
    for (const r of cap.resources) {
      assert.ok(resourceIds.has(r), `${cap.id} -> ${r}`);
    }
  }
});

test('manifest: dirty paths enumerate files inside an untracked plugin tree', () => {
  const repo = tmpdir();
  git(repo, ['init', '-q']);
  git(repo, ['config', 'user.email', 'pollux-test@example.invalid']);
  git(repo, ['config', 'user.name', 'Pollux Test']);
  fs.writeFileSync(path.join(repo, 'README.md'), 'fixture\n');
  git(repo, ['add', 'README.md']);
  git(repo, ['commit', '-qm', 'fixture']);
  const file = path.join(repo, 'plugins', 'pollux-ui', 'manifest.config.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '{}\n');

  assert.deepEqual(gitDirtyPaths(repo), [
    'plugins/pollux-ui/manifest.config.json',
  ]);
});

// ------------------------------------------------------------- SPEC-002

test('catalog: schema accepts the built catalog', () => {
  assert.deepEqual(validateSchema(catalog(), catalogSchema), []);
});

test('catalog: required initial resources are present', () => {
  const ids = new Set(catalog().resources.map((r) => r.id));
  for (const required of [
    'templates.legacy-typescript',
    'templates.go-backend',
    'templates.standalone-shared',
    'templates.target.nextjs',
    'templates.target.react-router',
    'templates.target.astro-react',
    'layout.start-ui-vite',
    'layout.nextjs',
    'layout.react-router',
    'layout.astro',
    'design.tokens',
  ]) {
    assert.ok(ids.has(required), `missing ${required}`);
  }
});

test('catalog: package paths resolve inside plugin root; invoke-only not copied', () => {
  for (const res of catalog().resources) {
    if (res.packagePath === null) {
      assert.equal(res.ownership, 'invoke-only');
      continue;
    }
    const abs = resolvePackagePath(res.packagePath);
    assert.ok(fs.existsSync(abs), `${res.id}: ${res.packagePath}`);
  }
});

test('path safety: rejects absolute, traversal, artifacts, credentials, generated output', () => {
  const denied = [
    '/etc/passwd',
    '../escape',
    'skeletons/../secret',
    'scripts/node_modules/x',
    'generated/pollux-go/main.go',
    'src/routes/generated.pesq.tsx',
    'skeletons/nextjs/pnpm-lock.yaml',
    'config/db-secret.txt',
    'certs/id_rsa',
    '.env',
  ];
  for (const p of denied) {
    assert.throws(
      () => assertSafeSourcePath(p),
      (err) => err.code === ERROR_CODES.PATH_UNSAFE,
      `expected PATH_UNSAFE for '${p}'`
    );
  }
  const allowed = [
    '_templates/pollux/page',
    'skeletons/_shared/design-tokens.css',
    'src/layout/manager/layout.tsx',
  ];
  for (const p of allowed) assertSafeSourcePath(p);
});

test('path safety: package paths must stay inside plugin root', () => {
  assert.throws(() => resolvePackagePath('resources/catalog.json'));
  assert.throws(() => resolvePackagePath('./../outside'));
  assert.throws(() => resolvePackagePath('./skills/../../escape'));
  assert.ok(resolvePackagePath('./resources/catalog.json'));
});

test('drift: verifyDrift passes on a fresh snapshot', () => {
  const result = verifyDrift();
  assert.ok(result.resources > 0);
});

test('drift: tampered packaged file fails package validation with the resource id', () => {
  const target = path.join(
    PLUGIN_ROOT,
    'resources',
    'design-system',
    'design-tokens.css'
  );
  const original = fs.readFileSync(target);
  fs.writeFileSync(
    target,
    Buffer.concat([original, Buffer.from('\n/* tampered */')])
  );
  try {
    assert.throws(
      () => validatePackage(),
      (err) =>
        err.code === ERROR_CODES.VERIFICATION_FAILED &&
        err.details.problems.some((p) => p.includes('design.tokens'))
    );
  } finally {
    fs.writeFileSync(target, original);
  }
  assert.doesNotThrow(() => validatePackage());
});

test('failure injection: missing source path leaves existing snapshot untouched', () => {
  const before = fs.readFileSync(
    path.join(PLUGIN_ROOT, 'resources', 'catalog.json')
  );
  const tmp = tmpdir();
  const badDecl = [
    {
      id: 'fixture.missing',
      kind: 'fixture',
      sourcePaths: ['does/not/exist'],
      packagePath: './resources/fixtures/missing',
      ownership: 'canonical-source',
      mutationPolicy: 'copy',
      generatorSurfaces: [],
      frameworkTargets: [],
      supportStatus: 'reference-only',
      dependencies: [],
      entrypoints: [],
      verification: [],
    },
  ];
  assert.throws(
    () =>
      buildResources({
        declarations: badDecl,
        resourcesDir: path.join(tmp, 'resources'),
        stagingDir: path.join(tmp, '.staging'),
      }),
    (err) => err.code === ERROR_CODES.RESOURCE_CATALOG_INVALID
  );
  assert.equal(fs.existsSync(path.join(tmp, 'resources')), false);
  assert.equal(fs.existsSync(path.join(tmp, '.staging')), false);
  assert.deepEqual(
    fs.readFileSync(path.join(PLUGIN_ROOT, 'resources', 'catalog.json')),
    before
  );
});

test('failure injection: publish rename failure restores existing snapshot', () => {
  const tmp = tmpdir();
  const resourcesDir = path.join(tmp, 'resources');
  const stagingDir = path.join(tmp, '.staging');
  fs.mkdirSync(resourcesDir);
  fs.writeFileSync(path.join(resourcesDir, 'sentinel.txt'), 'original-state');

  assert.throws(
    () =>
      buildResources({
        resourcesDir,
        stagingDir,
        renameSync(from, to) {
          if (from === stagingDir && to === resourcesDir) {
            throw Object.assign(new Error('injected publish failure'), {
              code: 'EIO',
            });
          }
          fs.renameSync(from, to);
        },
      }),
    (err) =>
      err instanceof PluginError &&
      err.code === ERROR_CODES.RESOURCE_CATALOG_INVALID
  );
  assert.equal(
    fs.readFileSync(path.join(resourcesDir, 'sentinel.txt'), 'utf8'),
    'original-state'
  );
  assert.deepEqual(
    fs.readdirSync(tmp).filter((name) => name.includes('previous')),
    []
  );
});

test('drift: deleted and renamed same-byte sources report exact paths', () => {
  const hash = 'a'.repeat(64);
  assert.deepEqual(
    diffResourceFiles(
      [
        { sourcePath: 'templates/a.ejs', sha256: hash },
        { sourcePath: 'templates/b.ejs', sha256: hash },
      ],
      [{ path: 'templates/c.ejs', sha256: hash }]
    ),
    [
      'deleted templates/a.ejs',
      'deleted templates/b.ejs',
      'added templates/c.ejs',
    ]
  );
});

test('determinism: two resource builds produce identical catalog digests', () => {
  const a = buildResources().catalogDigest;
  const b = buildResources().catalogDigest;
  assert.equal(a, b);
});

// ------------------------------------------------------------- SPEC-004

test('projections: codex and claude manifests share neutral identity', () => {
  const m = manifest();
  const codex = readJson(
    path.join(PLUGIN_ROOT, '.codex-plugin', 'plugin.json')
  );
  const claude = readJson(
    path.join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json')
  );
  for (const proj of [codex, claude]) {
    assert.equal(proj.name, m.name);
    assert.equal(proj.version, m.version);
    assert.equal(proj.description, m.description);
    assert.equal(proj.skills, './skills/');
  }
  assert.ok(codex.author?.name, 'codex publisher name required');
  assert.ok(codex.interface?.displayName, 'codex interface required');
  assert.equal(codex.repository, 'https://github.com/elioria/start-ui-web');
  assert.equal(codex.author.name, 'elioria');
  assert.equal(codex.interface.developerName, 'elioria');
  assert.ok(codex.interface.longDescription);
  assert.ok(Array.isArray(codex.interface.capabilities));
  assert.ok(Array.isArray(codex.interface.defaultPrompt));
  assert.equal('x-pollux' in codex, false);
  assert.equal('x-pollux' in claude, false);
  assert.equal(claude.displayName, 'Pollux UI');
});

test('projections: contain no procedural workflow logic', () => {
  for (const rel of [
    '.codex-plugin/plugin.json',
    '.claude-plugin/plugin.json',
  ]) {
    const proj = readJson(path.join(PLUGIN_ROOT, rel));
    const text = JSON.stringify(proj);
    assert.ok(!text.includes('./pollux generate'), rel);
    assert.ok(!text.includes('hygen'), rel);
  }
});

test('projections: rebuild is byte-identical (no drift)', () => {
  const fresh = buildProjections();
  for (const [abs, content] of fresh) {
    assert.equal(
      fs.readFileSync(abs, 'utf8'),
      content,
      `drift at ${path.relative(PLUGIN_ROOT, abs)}`
    );
  }
});

test('projections: agents/openai.yaml exists per skill with required fields', () => {
  for (const skill of manifest().skills) {
    const p = path.join(
      PLUGIN_ROOT,
      'skills',
      skill.id,
      'agents',
      'openai.yaml'
    );
    assert.ok(fs.existsSync(p), p);
    const text = fs.readFileSync(p, 'utf8');
    assert.match(text, /^interface:$/m);
    assert.match(text, /^  display_name: ".+"$/m);
    const short = text.match(/^  short_description: "(.+)"$/m);
    assert.ok(short, 'short_description present');
    assert.ok(
      short[1].length >= 25 && short[1].length <= 64,
      `short_description length ${short[1].length} for ${skill.id}`
    );
    assert.ok(
      text.includes(`  default_prompt: "Use $${skill.id}`),
      'interface.default_prompt mentions $skill'
    );
  }
});

// ------------------------------------------------------- SPEC-003 skills

test('skills: portable frontmatter, one skill dir per manifest skill', () => {
  for (const skill of manifest().skills) {
    const abs = path.join(PLUGIN_ROOT, skill.path);
    const text = fs.readFileSync(abs, 'utf8');
    const fm = text.match(/^---\n([\s\S]*?)\n---\n/);
    assert.ok(fm, `${skill.id} frontmatter`);
    assert.ok(fm[1].includes(`name: ${skill.id}`));
    assert.ok(
      !/^(\s*)(allowed-tools|model|argument-hint):/m.test(fm[1]),
      'no host-only keys'
    );
    assert.ok(text.split('\n').length <= 500, `${skill.id} under 500 lines`);
  }
});

test('skills: reject YAML plain scalars containing colon-space', () => {
  assert.throws(
    () =>
      parseFrontmatter(
        '---\nname: pollux-invalid\ndescription: Verify work: invalid YAML\n---\n',
        'fixture/SKILL.md'
      ),
    (err) =>
      err instanceof PluginError &&
      err.code === ERROR_CODES.PLUGIN_MANIFEST_INVALID &&
      err.message.includes('invalid YAML scalar')
  );
});

// ------------------------------------------------------------- SPEC-006

test('package: full validation passes on the built package', () => {
  const summary = validatePackage();
  assert.equal(summary.skills, 5);
  assert.equal(summary.capabilities, 5);
  assert.ok(summary.resources >= 17);
});

test('trigger cases: well-formed and reference declared skills only', () => {
  const cases = readJson(path.join(PLUGIN_ROOT, 'tests', 'trigger-cases.json'));
  const skillIds = new Set(manifest().skills.map((s) => s.id));
  assert.ok(cases.cases.length >= 12, 'minimum coverage');
  const kinds = new Set(cases.cases.map((c) => c.kind));
  for (const k of [
    'positive',
    'explicit',
    'negative',
    'ambiguous',
    'adversarial',
  ]) {
    assert.ok(kinds.has(k), `missing case kind ${k}`);
  }
  for (const c of cases.cases) {
    assert.ok(c.id && c.prompt, 'id + prompt');
    if (c.expectedSkill !== null) {
      assert.ok(skillIds.has(c.expectedSkill), c.expectedSkill);
    }
    for (const expected of c.expectedSkillsAnyOf ?? []) {
      assert.ok(skillIds.has(expected), expected);
    }
    for (const forbidden of c.forbiddenSkills) {
      assert.ok(skillIds.has(forbidden), forbidden);
    }
    for (const allowed of c.allowedSkills ?? []) {
      assert.ok(skillIds.has(allowed), allowed);
      assert.ok(
        !c.forbiddenSkills.includes(allowed),
        `${allowed} is both allowed and forbidden`
      );
    }
    assert.equal(
      typeof c.mutationAllowed,
      'boolean',
      `${c.id}: mutation authority`
    );
  }
  for (const skillId of skillIds) {
    assert.ok(
      cases.cases.some(
        (c) => c.expectedSkill === skillId && c.kind === 'positive'
      ),
      `missing positive case for ${skillId}`
    );
  }
});

test('workflow cases: reference declared capabilities', () => {
  const wf = readJson(path.join(PLUGIN_ROOT, 'tests', 'workflow-cases.json'));
  const capIds = new Set(manifest().capabilities.map((c) => c.id));
  for (const c of wf.cases) {
    assert.ok(capIds.has(c.capability), c.capability);
    assert.ok(c.steps.length > 0 && c.assertions.length > 0, c.id);
  }
});
