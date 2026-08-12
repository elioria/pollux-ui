// Hydrated CRUD island for entity '__ENTITY__' (SPEC-006 astro-react).
//
// Astro owns page/layout composition and the server shell; EVERYTHING
// interactive lives here, hydrated with `client:load` only on the three CRUD
// pages. The island owns URL search-param synchronization: the URL is the
// single source of truth for page/pageSize/sort/q/filters (shared query
// contract), written with history.pushState and re-read on popstate, so
// copied/reloaded URLs and browser navigation reproduce the same list.
// Mutations require JavaScript (documented); the server shell renders page
// metadata plus an accessible loading/error placeholder before hydration.
import { useCallback, useEffect, useRef, useState } from 'react';

import { CapabilityGate } from '../../../components/pollux/capability-gate';
import { DataTable } from '../../../components/pollux/data-table';
import { DeleteConfirm } from '../../../components/pollux/delete-confirm';
import { EntityForm } from '../../../components/pollux/entity-form';
import {
  ErrorState,
  ForbiddenState,
  LoadingState,
  UnauthenticatedState,
} from '../../../components/pollux/states';
import type {
  ApiErrorShape,
  ListResponse,
  WireRecord,
} from '../../../lib/pollux/runtime/api-types';
import { noCapabilities } from '../../../lib/pollux/runtime/api-types';
import {
  createEntityClient,
  newIdempotencyKey,
} from '../../../lib/pollux/runtime/client';
import { uiLabels } from '../../../lib/pollux/runtime/errors-pt';
import type { ListQueryState } from '../../../lib/pollux/runtime/query';
import {
  listQueryString,
  parseListQuery,
} from '../../../lib/pollux/runtime/query';
import { __ENTITY__Spec } from './spec';
import type { __PASCAL__Row } from './spec';

const LIST_HREF = '/manager/__PLURAL__';

// Same-origin proxy only: the browser never sees the upstream URL or any
// credential (they stay server-side in the Astro endpoint).
const client = createEntityClient<__PASCAL__Row>(__ENTITY__Spec, {
  baseUrl: '/api/pollux',
  entity: '__ENTITY__',
  // Browser client of the BFF: CSRF header on mutations + one
  // refresh-then-retry on an expired access cookie.
  bffAuth: true,
});

const loginHref = () =>
  `/api/pollux/auth/login?returnTo=${encodeURIComponent(
    window.location.pathname + window.location.search
  )}`;

function BlockingError({
  error,
  onRetry,
}: {
  error: ApiErrorShape;
  onRetry: () => void;
}) {
  if (error.code === 'UNAUTHENTICATED') {
    return (
      <UnauthenticatedState
        onLogin={() => window.location.assign(loginHref())}
      />
    );
  }
  if (error.code === 'FORBIDDEN') return <ForbiddenState />;
  return <ErrorState error={error} onRetry={onRetry} />;
}

export function __PASCAL__ListIsland({
  initialQuery,
}: {
  initialQuery: ListQueryState;
}) {
  const [query, setQuery] = useState<ListQueryState>(initialQuery);
  const [data, setData] = useState<ListResponse<__PASCAL__Row> | null>(null);
  const [error, setError] = useState<ApiErrorShape | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<__PASCAL__Row | null>(
    null
  );
  const abortRef = useRef<AbortController | null>(null);
  // One idempotency key per delete confirmation, reused across retries.
  const deleteKeyRef = useRef<string>('');

  const load = useCallback(async (state: ListQueryState) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setRefreshing(true);
    try {
      const result = await client.list(state, { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (result.ok) {
        setData(result.data);
        setError(null);
      } else {
        setError(result.error);
      }
      setRefreshing(false);
    } catch {
      // Aborted by a newer navigation: drop the stale load silently.
    }
  }, []);

  // URL -> state: initial load + browser navigation (back/forward).
  useEffect(() => {
    void load(query);
    const onPopState = () => {
      const next = parseListQuery(
        new URLSearchParams(window.location.search),
        __ENTITY__Spec
      );
      setQuery(next);
      void load(next);
    };
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, []);

  // State -> URL: the island writes the canonical query string and reloads.
  const onQueryChange = useCallback(
    (next: ListQueryState) => {
      const qs = listQueryString(next, __ENTITY__Spec);
      const target = `${window.location.pathname}${qs}`;
      const current = `${window.location.pathname}${window.location.search}`;
      if (target !== current) {
        window.history.pushState(null, '', target);
      }
      setQuery(next);
      void load(next);
    },
    [load]
  );

  if (error && !data) {
    return <BlockingError error={error} onRetry={() => void load(query)} />;
  }
  if (!data) return <LoadingState />;

  const capabilities = data.capabilities ?? noCapabilities;

  return (
    <>
      {error ? (
        <div className="mb-3">
          <BlockingError error={error} onRetry={() => void load(query)} />
        </div>
      ) : null}
      <DataTable<__PASCAL__Row>
        spec={__ENTITY__Spec}
        rows={data.rows}
        totalRows={data.totalRows}
        query={query}
        onQueryChange={onQueryChange}
        capabilities={capabilities}
        refreshing={refreshing}
        toolbarActions={
          <CapabilityGate capabilities={capabilities} require="create">
            <a
              href={`${LIST_HREF}/new`}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {uiLabels.create}
            </a>
          </CapabilityGate>
        }
        renderRowActions={(row) => (
          <span className="inline-flex items-center gap-2">
            <CapabilityGate capabilities={capabilities} require="update">
              <a
                href={`${LIST_HREF}/${encodeURIComponent(String(row.__PK__))}/edit`}
                className="text-sm text-foreground underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {uiLabels.edit}
              </a>
            </CapabilityGate>
            <CapabilityGate capabilities={capabilities} require="delete">
              <button
                type="button"
                onClick={() => {
                  deleteKeyRef.current = newIdempotencyKey();
                  setPendingDelete(row);
                }}
                className="text-sm text-destructive underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {uiLabels.delete}
              </button>
            </CapabilityGate>
          </span>
        )}
      />
      <DeleteConfirm
        open={pendingDelete !== null}
        subject={pendingDelete ? String(pendingDelete.__SUBJECT_FIELD__ ?? pendingDelete.__PK__) : undefined}
        onConfirm={async () => {
          if (!pendingDelete) return null;
          const result = await client.remove(String(pendingDelete.__PK__), {
            idempotencyKey: deleteKeyRef.current,
          });
          return result.ok ? null : result.error;
        }}
        onCancel={() => setPendingDelete(null)}
        onDeleted={() => {
          setPendingDelete(null);
          void load(query);
        }}
      />
    </>
  );
}

function useSubmission() {
  // One idempotency key per logical submission: reused while the user
  // retries a retryable failure, regenerated when the submission can change
  // (a definitive failure lets the user edit the body).
  const keyRef = useRef<string>('');
  return (retryableFailure: boolean) => {
    if (!keyRef.current || !retryableFailure) {
      keyRef.current = newIdempotencyKey();
    }
    return keyRef.current;
  };
}

export function __PASCAL__CreateIsland() {
  const lastRetryable = useRef(false);
  const nextKey = useSubmission();
  return (
    <EntityForm
      spec={__ENTITY__Spec}
      operation="create"
      onSubmit={async (values) => {
        const key = nextKey(lastRetryable.current);
        const result = await client.create(values as Partial<__PASCAL__Row>, {
          idempotencyKey: key,
        });
        if (result.ok) {
          window.location.assign(LIST_HREF);
          return null;
        }
        lastRetryable.current = result.error.retryable;
        return result.error;
      }}
      onCancel={() => window.location.assign(LIST_HREF)}
    />
  );
}

export function __PASCAL__EditIsland({ id }: { id: string }) {
  const [record, setRecord] = useState<__PASCAL__Row | null>(null);
  const [error, setError] = useState<ApiErrorShape | null>(null);
  const lastRetryable = useRef(false);
  const nextKey = useSubmission();

  const loadRecord = useCallback(async () => {
    setError(null);
    const result = await client.get(id);
    if (result.ok) setRecord(result.data);
    else setError(result.error);
  }, [id]);

  useEffect(() => {
    void loadRecord();
  }, [loadRecord]);

  if (error) {
    return <BlockingError error={error} onRetry={() => void loadRecord()} />;
  }
  if (!record) return <LoadingState />;

  return (
    <EntityForm
      spec={__ENTITY__Spec}
      operation="update"
      initial={record as WireRecord}
      onSubmit={async (values) => {
        const key = nextKey(lastRetryable.current);
        const result = await client.update(
          id,
          values as Partial<__PASCAL__Row>,
          { idempotencyKey: key }
        );
        if (result.ok) {
          window.location.assign(LIST_HREF);
          return null;
        }
        lastRetryable.current = result.error.retryable;
        return result.error;
      }}
      onCancel={() => window.location.assign(LIST_HREF)}
    />
  );
}
