// SPEC-006 — Astro React-island target adapter ('astro-react', EXPERIMENTAL).
//
// Lifecycle per scripts/pollux/targets/protocol.mjs:
//   inspect -> plan -> render -> format -> verify
//
// Astro owns page/layout composition, page metadata and the server-rendered
// loading/error shell; ALL interactive CRUD lives in a React island hydrated
// with `client:load` on the three generated CRUD pages only. The same-origin
// proxy is an Astro server endpoint whose entity/method/query allowlist is
// built from generated registry fragments; the skeleton's Layout.astro nav
// consumes generated sidebar fragments the same way (import.meta.glob).
//
// Determinism: plans are pure functions of the frozen PolluxEntityModel plus
// the static template files under _templates/pollux-targets/{astro-react,
// shared} (read once at module load). Identical inputs plan identical bytes,
// so the protocol's plan hashes are stable.
//
// Shared-file ownership: proxy/auth/runtime/ui files are identical for every
// entity. They are planned (and therefore owned, per the protocol's
// per-entity ownership record) by the FIRST entity generated into the
// workspace; while another entity owns them this adapter skips planning them
// and the imports resolve against the owner's copies. EXPERIMENTAL
// limitation: `generate --all` over several entities plans from one shared
// pre-state — generate entities one at a time on this target.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { hasOwnershipHeader, ownerOfPath } from '../ownership.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../../../..');
const TEMPLATE_DIR = path.join(
  REPO_ROOT,
  '_templates/pollux-targets/astro-react/workspace'
);
const SHARED_DIR = path.join(REPO_ROOT, '_templates/pollux-targets/shared');

const readTemplate = (dir, name) =>
  fs.readFileSync(path.join(dir, name), 'utf8');

// Static sources, read once (module-load) for deterministic planning.
const TPL = {
  listPage: readTemplate(TEMPLATE_DIR, 'list.astro.tpl'),
  newPage: readTemplate(TEMPLATE_DIR, 'new.astro.tpl'),
  editPage: readTemplate(TEMPLATE_DIR, 'edit.astro.tpl'),
  island: readTemplate(TEMPLATE_DIR, 'island.tsx.tpl'),
  apiProxy: readTemplate(TEMPLATE_DIR, 'api-proxy.ts'),
  authStub: readTemplate(TEMPLATE_DIR, 'auth-stub.ts'),
};

const SHARED_RUNTIME_FILES = [
  'api-types.ts',
  'client.ts',
  'codecs.ts',
  'errors-pt.ts',
  'query.ts',
];
const SHARED_UI_FILES = [
  'capability-gate.tsx',
  'data-table.tsx',
  'delete-confirm.tsx',
  'entity-form.tsx',
  'states.tsx',
];

// Copies of the SPEC-003 shared templates. Runtime files keep their relative
// layout (src/lib/pollux/runtime); UI files move to src/components/pollux and
// get their runtime imports rewritten to the lib location. This is the ONLY
// transformation — field semantics stay single-sourced in the shared files.
const sharedRuntime = Object.fromEntries(
  SHARED_RUNTIME_FILES.map((name) => [
    `src/lib/pollux/runtime/${name}`,
    readTemplate(path.join(SHARED_DIR, 'runtime'), name),
  ])
);
const sharedUi = Object.fromEntries(
  SHARED_UI_FILES.map((name) => [
    `src/components/pollux/${name}`,
    readTemplate(path.join(SHARED_DIR, 'ui'), name).replaceAll(
      "'../runtime/",
      "'../../lib/pollux/runtime/"
    ),
  ])
);

/** Files identical for every entity (see ownership note above). */
const SHARED_OUTPUTS = {
  'src/pages/api/pollux/[...path].ts': TPL.apiProxy,
  'src/pages/api/pollux/auth/[action].ts': TPL.authStub,
  // Framework-neutral BFF auth core — server-only module tree, imported
  // exclusively by the API proxy and the fixed auth endpoints.
  'src/lib/pollux/server/bff-core.ts': readTemplate(
    path.join(SHARED_DIR, 'runtime'),
    'bff-core.ts'
  ),
  ...sharedRuntime,
  ...sharedUi,
};

const pascalCase = (id) =>
  id
    .split('_')
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join('');

const TS_BY_SCALAR = {
  uuid: 'string',
  string: 'string',
  varchar: 'string',
  text: 'string',
  boolean: 'boolean',
  integer: 'number',
  float: 'number',
  numeric: 'string',
  date: 'string',
  time: 'string',
  timestamp: 'string',
};

const requiredOn = (model, codeName, operation) =>
  model.validation.some(
    (entry) =>
      entry.field === codeName &&
      entry.rules.some(
        (rule) => rule.rule === 'required' && rule.on.includes(operation)
      )
  );

/** EntitySpec projection (shared runtime api-types contract). */
const buildSpecObject = (model) => ({
  id: model.entity.id,
  titles: { ...model.entity.titles },
  fields: model.fields.map((field) => ({
    codeName: field.codeName,
    label: field.label,
    scalarType: field.scalarType,
    nullable: field.nullable,
    primaryKey: field.primaryKey,
    mutability: field.mutability,
    requiredOnCreate: requiredOn(model, field.codeName, 'create'),
    requiredOnUpdate: requiredOn(model, field.codeName, 'update'),
    maxLength: field.constraints.length ?? null,
    visibility: { ...field.visibility },
  })),
  sortableFields: [...model.list.sortableFields],
  filterableFields: [...model.list.filterableFields],
  pageSizes: [...model.list.pageSizes],
  defaultPageSize: model.list.defaultPageSize,
  defaultSort: model.list.defaultSort.map((s) => ({
    id: s.field,
    desc: s.direction === 'desc',
  })),
});

const buildSpecTs = (model) => {
  const pascal = pascalCase(model.entity.id);
  const rowFields = model.fields
    .map(
      (field) =>
        `  ${field.codeName}: ${TS_BY_SCALAR[field.scalarType]}${
          field.nullable ? ' | null' : ''
        };`
    )
    .join('\n');
  const spec = JSON.stringify(buildSpecObject(model), null, 2);
  return [
    `// EntitySpec projection for '${model.entity.id}' (PolluxEntityModel v${model.modelVersion}).`,
    `// Labels/titles preserve the source metadata text (Portuguese).`,
    `import type { EntitySpec } from '../../../lib/pollux/runtime/api-types';`,
    ``,
    `export type ${pascal}Row = {`,
    rowFields,
    `};`,
    ``,
    `export const ${model.entity.id}Spec: EntitySpec = ${spec};`,
    ``,
  ].join('\n');
};

const buildNavTs = (model) =>
  [
    `// Sidebar registry fragment — consumed by src/layouts/Layout.astro via`,
    `// import.meta.glob('../generated/pollux/nav/*.ts').`,
    `export const navEntry = {`,
    `  href: ${JSON.stringify(`/manager/${model.entity.routes.plural}`)},`,
    `  label: ${JSON.stringify(model.entity.titles.list)},`,
    `} as const;`,
    ``,
  ].join('\n');

const buildRegistryTs = (model) => {
  const queryKeys = [];
  for (const codeName of model.list.filterableFields) {
    queryKeys.push(`f_${codeName}`);
    for (const op of model.list.filterOperators[codeName] ?? []) {
      queryKeys.push(`f_${codeName}__${op}`);
    }
  }
  const methods = Object.fromEntries(
    ['list', 'read', 'create', 'update', 'delete'].map((op) => [
      op,
      model.operations[op].enabled,
    ])
  );
  return [
    `// Proxy allowlist registry fragment — consumed by`,
    `// src/pages/api/pollux/[...path].ts via import.meta.glob. The proxy only`,
    `// forwards requests for entities/methods/query keys declared here.`,
    `export const registryEntry = {`,
    `  entity: ${JSON.stringify(model.entity.id)},`,
    `  methods: ${JSON.stringify(methods)},`,
    `  queryKeys: ${JSON.stringify(queryKeys)},`,
    `} as const;`,
    ``,
  ].join('\n');
};

const applyTokens = (template, tokens) => {
  let out = template;
  for (const [token, value] of Object.entries(tokens)) {
    out = out.replaceAll(token, value);
  }
  return out;
};

const FORBIDDEN_IMPORTS = [
  // Cross-framework imports must never reach Astro output (SPEC-006).
  /from\s+['"]next(\/|['"])/,
  /from\s+['"]@tanstack\//,
  /from\s+['"]react-router/,
  /from\s+['"]@remix-run\//,
];

const walkFiles = (dir, out = []) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(abs, out);
    else if (entry.isFile()) out.push(abs);
  }
  return out;
};

export const adapter = {
  id: 'astro-react',
  version: '0.1.0',
  // Capability level 'standalone-crud': entities that need report/operation
  // surfaces are rejected at plan time by the protocol capability check.
  capabilities: [],

  inspect(workspace, manifest) {
    return {
      workspace,
      provenance: manifest?.provenance ?? null,
      generated: manifest?.generated ?? null,
    };
  },

  plan(model, context) {
    const entity = model.entity.id;
    const plural = model.entity.routes.plural;
    const pascal = pascalCase(model.entity.id);
    const pk = model.fields.find((f) => f.primaryKey);
    const subject =
      model.fields.find(
        (f) =>
          !f.primaryKey &&
          f.visibility.list &&
          ['string', 'varchar', 'text'].includes(f.scalarType)
      ) ?? pk;
    const tokens = {
      __ENTITY__: entity,
      __PASCAL__: pascal,
      __PLURAL__: plural,
      __PK__: pk.codeName,
      __SUBJECT_FIELD__: subject.codeName,
    };

    const outputs = [
      {
        path: `src/pages/manager/${plural}/index.astro`,
        content: applyTokens(TPL.listPage, tokens),
      },
      {
        path: `src/pages/manager/${plural}/new.astro`,
        content: applyTokens(TPL.newPage, tokens),
      },
      {
        path: `src/pages/manager/${plural}/[id]/edit.astro`,
        content: applyTokens(TPL.editPage, tokens),
      },
      {
        path: `src/generated/pollux/${entity}/spec.ts`,
        content: buildSpecTs(model),
      },
      {
        path: `src/generated/pollux/${entity}/island.tsx`,
        content: applyTokens(TPL.island, tokens),
      },
      {
        path: `src/generated/pollux/nav/${entity}.ts`,
        content: buildNavTs(model),
      },
      {
        path: `src/generated/pollux/registry/${entity}.ts`,
        content: buildRegistryTs(model),
      },
    ];

    // Shared files: planned only while no OTHER entity owns them (see the
    // ownership note in the module header).
    for (const [relPath, content] of Object.entries(SHARED_OUTPUTS)) {
      const owner = ownerOfPath(context.generated, relPath);
      if (owner === null || owner === entity) {
        outputs.push({ path: relPath, content });
      }
    }
    return { outputs };
  },

  render(plan, staging) {
    for (const op of plan.operations) {
      if (op.action === 'remove' || op.action === 'preserve') continue;
      const file = path.join(staging, op.path);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, plan.contents.get(op.path));
    }
    return { ok: true };
  },

  // No-op BY DESIGN: emitted content is already in its final shape and the
  // protocol requires formatting to be a fixpoint of the planned bytes (the
  // plan hash must equal the staged hash). No workspace formatter runs here;
  // running one would have to be replicated at plan time anyway.
  format() {
    return { ok: true };
  },

  // Structural verification of the staged tree. A full `astro check`
  // typecheck needs an installed workspace (node_modules + astro sync) which
  // the bare staging tree does not have — the workspace-level check runs in
  // CI/e2e via `pnpm typecheck` after publication.
  verify(staging) {
    const problems = [];
    for (const abs of walkFiles(staging)) {
      const rel = path.relative(staging, abs).split(path.sep).join('/');
      const content = fs.readFileSync(abs, 'utf8');
      if (content.length === 0) {
        problems.push(`empty staged file: ${rel}`);
        continue;
      }
      const ext = path.extname(rel);
      if (['.ts', '.tsx', '.astro'].includes(ext)) {
        if (!hasOwnershipHeader(content)) {
          problems.push(`missing ownership header: ${rel}`);
        }
        for (const pattern of FORBIDDEN_IMPORTS) {
          if (pattern.test(content)) {
            problems.push(`forbidden framework import in ${rel} (${pattern})`);
          }
        }
      }
      if (ext === '.astro') {
        const isCrudPage = rel.startsWith('src/pages/manager/');
        if (isCrudPage && !content.includes('client:load')) {
          problems.push(`CRUD page without a hydrated island: ${rel}`);
        }
        if (!isCrudPage && content.includes('client:')) {
          problems.push(`hydration directive outside CRUD pages: ${rel}`);
        }
      }
    }
    return { ok: problems.length === 0, problems };
  },
};

export default adapter;
