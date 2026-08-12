// SPEC-004 — per-entity template functions for the Next.js target adapter.
//
// Deterministic, EJS-free string templating: every function maps a frozen
// PolluxEntityModel (scripts/pollux/model/schema.mjs, modelVersion "1") to
// the exact file content the adapter plans. All interpolated strings pass
// through JSON.stringify so metadata text (accents, quotes) can never break
// the emitted TypeScript. No I/O here — the adapter owns file placement.

/** snake_case -> camelCase (same rule as the legacy generators). */
export const toCamel = (s) =>
  s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());

/** snake_case -> PascalCase. */
export const toPascal = (s) => {
  const camel = toCamel(s);
  return camel.charAt(0).toUpperCase() + camel.slice(1);
};

const q = (value) => JSON.stringify(value);

/** Names derived from the entity model, shared by every template. */
export function entityNames(model) {
  const id = model.entity.id;
  const camel = toCamel(id);
  return {
    id,
    camel,
    pascal: toPascal(id),
    plural: model.entity.routes.plural,
    listHref: `/manager/${model.entity.routes.plural}`,
    routeDir: `app/(pollux)/manager/${model.entity.routes.plural}`,
    specModule: `@/lib/pollux/entities/${id}/spec`,
    specConst: `${camel}Spec`,
    hrefConst: `${camel}ListHref`,
  };
}

/**
 * Project the shared-runtime EntitySpec (SPEC-003 api-types.ts) from the
 * normalized model. Requiredness comes from the model's data-only validation
 * rules; maxLength from the length constraint.
 */
export function projectEntitySpec(model) {
  const requiredOn = (codeName, operation) =>
    model.validation.some(
      (entry) =>
        entry.field === codeName &&
        entry.rules.some(
          (rule) =>
            rule.rule === 'required' &&
            Array.isArray(rule.on) &&
            rule.on.includes(operation)
        )
    );
  return {
    id: model.entity.id,
    titles: {
      list: model.entity.titles.list,
      create: model.entity.titles.create,
      update: model.entity.titles.update,
    },
    fields: model.fields.map((field) => ({
      codeName: field.codeName,
      label: field.label,
      scalarType: field.scalarType,
      nullable: field.nullable,
      primaryKey: field.primaryKey,
      mutability: field.mutability,
      requiredOnCreate: requiredOn(field.codeName, 'create'),
      requiredOnUpdate: requiredOn(field.codeName, 'update'),
      maxLength: field.constraints.length,
      visibility: {
        list: field.visibility.list,
        create: field.visibility.create,
        update: field.visibility.update,
      },
    })),
    sortableFields: [...model.list.sortableFields],
    filterableFields: [...model.list.filterableFields],
    pageSizes: [...model.list.pageSizes],
    defaultPageSize: model.list.defaultPageSize,
    defaultSort: model.list.defaultSort.map((s) => ({
      id: s.field,
      desc: s.direction === 'desc',
    })),
  };
}

/**
 * Exhaustive list query-key allowlist for the API proxy: the fixed keys plus
 * every declared filter key (`f_<codeName>` shorthand and each explicit
 * `f_<codeName>__<op>` from the model's per-scalar operator table).
 */
export function listQueryKeys(model) {
  const keys = ['page', 'pageSize', 'sort', 'q'];
  for (const codeName of model.list.filterableFields) {
    const camel = toCamel(codeName);
    keys.push(`f_${camel}`);
    for (const op of model.list.filterOperators[codeName] ?? []) {
      keys.push(`f_${camel}__${op}`);
    }
  }
  return keys;
}

/** lib/pollux/registry/<entity>.json — sidebar + proxy registry fragment. */
export function renderRegistryFragment(model) {
  const names = entityNames(model);
  return (
    JSON.stringify(
      {
        entity: names.id,
        plural: names.plural,
        label: model.entity.titles.list,
        href: names.listHref,
        queryKeys: listQueryKeys(model),
      },
      null,
      2
    ) + '\n'
  );
}

/** lib/pollux/entities/<entity>/spec.ts — EntitySpec constant + row type. */
export function renderSpecModule(model) {
  const names = entityNames(model);
  const spec = projectEntitySpec(model);
  return `import type { EntitySpec, WireRecord } from '@/lib/pollux/runtime/api-types';

/**
 * Entity spec projected from the normalized Pollux model (modelVersion
 * ${q(model.modelVersion)}). Labels/titles keep the source Portuguese text.
 */
export const ${names.specConst}: EntitySpec = ${JSON.stringify(spec, null, 2)};

/** Local list route for this entity. */
export const ${names.hrefConst} = ${q(names.listHref)};

/** Canonical wire record for ${q(names.id)} rows (keyed by codeName). */
export type ${names.pascal}Row = WireRecord;
`;
}

/** app/(pollux)/manager/<plural>/page.tsx — Server Component list page. */
export function renderListPage(model) {
  const names = entityNames(model);
  return `import { EntityTable } from '@/components/pollux/next/entity-table';
import {
  ErrorState,
  ForbiddenState,
  UnauthenticatedState,
} from '@/components/pollux/states';
import { ${names.hrefConst}, ${names.specConst} } from '${names.specModule}';
import { parseListQuery } from '@/lib/pollux/runtime/query';
import { serverList } from '@/lib/pollux/server/data';

// URL search params are the source of truth; render per request.
export const dynamic = 'force-dynamic';

export const metadata = { title: ${q(model.entity.titles.list)} };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function Page({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const raw = await searchParams;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'string') params.set(key, value);
    else if (Array.isArray(value) && typeof value[0] === 'string') {
      params.set(key, value[0]);
    }
  }
  const query = parseListQuery(params, ${names.specConst});
  const result = await serverList(${names.specConst}, query);

  return (
    <section className="flex flex-col gap-4">
      <h1 className="font-display text-xl font-bold text-foreground">
        {${names.specConst}.titles.list}
      </h1>
      {result.ok ? (
        <EntityTable
          spec={${names.specConst}}
          listHref={${names.hrefConst}}
          rows={result.data.rows}
          totalRows={result.data.totalRows}
          capabilities={result.data.capabilities}
          query={query}
        />
      ) : result.error.code === 'UNAUTHENTICATED' ? (
        <UnauthenticatedState />
      ) : result.error.code === 'FORBIDDEN' ? (
        <ForbiddenState />
      ) : (
        <ErrorState error={result.error} />
      )}
    </section>
  );
}
`;
}

/** app/(pollux)/manager/<plural>/new/page.tsx — create page. */
export function renderCreatePage(model) {
  const names = entityNames(model);
  return `import { EntityCreateForm } from '@/components/pollux/next/entity-create-form';
import { ${names.hrefConst}, ${names.specConst} } from '${names.specModule}';

export const metadata = { title: ${q(model.entity.titles.create)} };

export default function Page() {
  return (
    <section className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <h1 className="font-display text-xl font-bold text-foreground">
        {${names.specConst}.titles.create}
      </h1>
      <EntityCreateForm spec={${names.specConst}} listHref={${names.hrefConst}} />
    </section>
  );
}
`;
}

/** app/(pollux)/manager/<plural>/[id]/edit/page.tsx — update page. */
export function renderEditPage(model) {
  const names = entityNames(model);
  return `import { notFound } from 'next/navigation';

import { EntityEditForm } from '@/components/pollux/next/entity-edit-form';
import {
  ErrorState,
  ForbiddenState,
  UnauthenticatedState,
} from '@/components/pollux/states';
import { ${names.hrefConst}, ${names.specConst} } from '${names.specModule}';
import { serverGet } from '@/lib/pollux/server/data';

export const dynamic = 'force-dynamic';

export const metadata = { title: ${q(model.entity.titles.update)} };

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await serverGet(${names.specConst}, id);
  if (!result.ok) {
    if (result.error.code === 'NOT_FOUND') notFound();
    if (result.error.code === 'UNAUTHENTICATED') return <UnauthenticatedState />;
    if (result.error.code === 'FORBIDDEN') return <ForbiddenState />;
    return <ErrorState error={result.error} />;
  }
  return (
    <section className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <h1 className="font-display text-xl font-bold text-foreground">
        {${names.specConst}.titles.update}
      </h1>
      <EntityEditForm
        spec={${names.specConst}}
        listHref={${names.hrefConst}}
        id={id}
        initial={result.data}
      />
    </section>
  );
}
`;
}

/** app/(pollux)/manager/<plural>/loading.tsx — pending boundary. */
export function renderLoading() {
  return `import { LoadingState } from '@/components/pollux/states';

export default function Loading() {
  return <LoadingState />;
}
`;
}

/** app/(pollux)/manager/<plural>/error.tsx — error boundary (client). */
export function renderErrorBoundary() {
  return `'use client';

import { ErrorState } from '@/components/pollux/states';
import { errorMessages } from '@/lib/pollux/runtime/errors-pt';

export default function ErrorBoundary({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorState
      error={{
        code: 'INTERNAL',
        message: errorMessages.INTERNAL,
        requestId: '',
        retryable: true,
      }}
      onRetry={reset}
    />
  );
}
`;
}

/** app/(pollux)/manager/<plural>/not-found.tsx — not-found boundary. */
export function renderNotFound(model) {
  const names = entityNames(model);
  return `import Link from 'next/link';

import { errorMessages, uiLabels } from '@/lib/pollux/runtime/errors-pt';
import { ${names.hrefConst} } from '${names.specModule}';

export default function NotFound() {
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-4 rounded-lg border border-border bg-card p-8 text-center"
    >
      <p className="text-sm font-medium text-foreground">
        {errorMessages.NOT_FOUND}
      </p>
      <Link
        href={${names.hrefConst}}
        className="rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
      >
        {uiLabels.back}
      </Link>
    </div>
  );
}
`;
}

/** Every per-entity output: workspace-relative path -> content. */
export function renderEntityOutputs(model) {
  const names = entityNames(model);
  return [
    {
      path: `lib/pollux/registry/${names.id}.json`,
      content: renderRegistryFragment(model),
    },
    {
      path: `lib/pollux/entities/${names.id}/spec.ts`,
      content: renderSpecModule(model),
    },
    { path: `${names.routeDir}/page.tsx`, content: renderListPage(model) },
    { path: `${names.routeDir}/loading.tsx`, content: renderLoading() },
    { path: `${names.routeDir}/error.tsx`, content: renderErrorBoundary() },
    { path: `${names.routeDir}/not-found.tsx`, content: renderNotFound(model) },
    {
      path: `${names.routeDir}/new/page.tsx`,
      content: renderCreatePage(model),
    },
    {
      path: `${names.routeDir}/[id]/edit/page.tsx`,
      content: renderEditPage(model),
    },
  ];
}
