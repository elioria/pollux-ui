// Rota de listagem gerada — entidade '__ENTITY__' (/manager/__PLURAL__).
//
// URL search params são a única fonte de verdade do estado da lista (página,
// tamanho, ordenação, busca e filtros): o loader relê a busca da URL a cada
// navegação e uma URL copiada/recarregada mostra a mesma lista. Durante uma
// navegação pendente o estado exibido vem da URL de destino, então digitar em
// um filtro nunca é apagado enquanto o loader roda. Mutações (exclusão)
// chamam o cliente compartilhado direto no navegador e revalidam o loader com
// router.invalidate() — sem recarregar o documento.
import { createFileRoute, Link, useRouter, useRouterState } from '@tanstack/react-router';
import { useState } from 'react';

import { CapabilityGate } from '../../../components/pollux/capability-gate';
import { DataTable } from '../../../components/pollux/data-table';
import { DeleteConfirm } from '../../../components/pollux/delete-confirm';
import {
  ErrorState,
  ForbiddenState,
  UnauthenticatedState,
} from '../../../components/pollux/states';
import { __ENTITY__Spec, type __PASCAL__Row } from '../../../generated/pollux/__ENTITY__/spec';
import { polluxBaseUrl } from '../../../lib/pollux/base-url';
import { usePolluxMutation } from '../../../lib/pollux/use-pollux-mutation';
import { createEntityClient, newIdempotencyKey } from '../../../lib/pollux/runtime/client';
import { errorMessages, uiLabels } from '../../../lib/pollux/runtime/errors-pt';
import { parseListQuery, stringifyListQuery } from '../../../lib/pollux/runtime/query';

// Loader (SSR + navegação client-side) e mutações chamam o proxy same-origin
// (src/routes/api/pollux/$.ts): tokens e URL do upstream ficam exclusivamente
// no servidor.
const entityClient = () =>
  createEntityClient<__PASCAL__Row>(__ENTITY__Spec, {
    baseUrl: polluxBaseUrl(),
    entity: '__ENTITY__',
  });

// O parser padrão do TanStack Router decodifica valores JSON-like (números,
// booleanos, o array `sort`); o contrato compartilhado trabalha com strings —
// normaliza de volta para o formato canônico da URL.
const normalizeSearch = (search: Record<string, unknown>): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(search)) {
    if (value === undefined || value === null) continue;
    out[key] = typeof value === 'string' ? value : typeof value === 'object' ? JSON.stringify(value) : String(value);
  }
  return out;
};

export const Route = createFileRoute('/manager/__PLURAL__/')({
  validateSearch: normalizeSearch,
  loaderDeps: ({ search }) => search,
  loader: ({ deps, abortController }) =>
    entityClient().list(
      parseListQuery(new URLSearchParams(deps), __ENTITY__Spec),
      { signal: abortController.signal }
    ),
  head: () => ({ meta: [{ title: __TITLE_LIST_JSON__ }] }),
  component: __PASCAL__ListPage,
  errorComponent: PageErrorBoundary,
});

const actionLinkClass =
  'rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

function __PASCAL__ListPage() {
  const result = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const router = useRouter();
  const { mutate } = usePolluxMutation();
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    subject: string;
  } | null>(null);
  const [deleteKey, setDeleteKey] = useState('');

  // Estado pendente: durante a navegação disparada por um filtro/ordenação a
  // URL de destino é a fonte de verdade — o input não "volta" ao valor antigo.
  const pendingSearch = useRouterState({
    select: (state) =>
      state.status === 'pending'
        ? (state.location.search as Record<string, unknown>)
        : null,
  });
  const refreshing = pendingSearch !== null;
  const query = parseListQuery(
    new URLSearchParams(
      pendingSearch ? normalizeSearch(pendingSearch) : search
    ),
    __ENTITY__Spec
  );

  if (!result.ok) {
    if (result.error.code === 'UNAUTHENTICATED') return <UnauthenticatedState />;
    if (result.error.code === 'FORBIDDEN') return <ForbiddenState />;
    return (
      <ErrorState
        error={result.error}
        onRetry={
          result.error.retryable ? () => void router.invalidate() : undefined
        }
      />
    );
  }
  const { rows, totalRows, capabilities } = result.data;

  return (
    <div className="space-y-4">
      <h2 className="font-display text-2xl font-semibold">
        {__ENTITY__Spec.titles.list}
      </h2>
      <DataTable
        spec={__ENTITY__Spec}
        rows={rows}
        totalRows={totalRows}
        query={query}
        onQueryChange={(next) =>
          void navigate({
            search: Object.fromEntries(
              stringifyListQuery(next, __ENTITY__Spec)
            ),
            replace: true,
          })
        }
        capabilities={capabilities}
        refreshing={refreshing}
        toolbarActions={
          <CapabilityGate capabilities={capabilities} require="create">
            <Link
              to="/manager/__PLURAL__/new"
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {uiLabels.create}
            </Link>
          </CapabilityGate>
        }
        renderRowActions={(row) => (
          <div className="flex items-center justify-end gap-2">
            <CapabilityGate capabilities={capabilities} require="update">
              <Link
                to="/manager/__PLURAL__/$id/edit"
                params={{ id: String(row.__PK__) }}
                className={actionLinkClass}
              >
                {uiLabels.edit}
              </Link>
            </CapabilityGate>
            <CapabilityGate capabilities={capabilities} require="delete">
              <button
                type="button"
                onClick={() => {
                  setDeleteTarget({
                    id: String(row.__PK__),
                    subject: String(row.__SUBJECT_FIELD__ ?? row.__PK__),
                  });
                  // Uma exclusão lógica = uma chave; retries reutilizam-na.
                  setDeleteKey(newIdempotencyKey());
                }}
                className={`${actionLinkClass} text-destructive`}
              >
                {uiLabels.delete}
              </button>
            </CapabilityGate>
          </div>
        )}
      />
      <DeleteConfirm
        open={deleteTarget !== null}
        subject={deleteTarget?.subject}
        onConfirm={() =>
          mutate(() =>
            entityClient().remove(deleteTarget?.id ?? '', {
              idempotencyKey: deleteKey,
            })
          )
        }
        onCancel={() => setDeleteTarget(null)}
        onDeleted={() => {
          setDeleteTarget(null);
          // Revalidação in-place: o loader relê a lista sem recarregar a
          // página e sem tocar nos filtros da URL.
          void router.invalidate();
        }}
      />
    </div>
  );
}

function PageErrorBoundary() {
  return (
    <div className="rounded-lg border border-border bg-card p-8">
      <h2 className="font-display text-xl font-semibold">
        {uiLabels.errorTitle}
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {errorMessages.INTERNAL}
      </p>
    </div>
  );
}
