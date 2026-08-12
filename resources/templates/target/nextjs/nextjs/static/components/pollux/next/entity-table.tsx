'use client';

// SPEC-004 Next.js adapter — client wrapper around the shared DataTable.
// The URL is the single source of truth: query changes push the canonical
// search string and let the Server Component page re-fetch. Mutations go
// through the same-origin BFF proxy; one idempotency key per logical delete
// confirmation, reused across retries.
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useMemo, useRef, useState } from 'react';

import type {
  EntityCapabilities,
  EntitySpec,
  WireRecord,
} from '@/lib/pollux/runtime/api-types';
import {
  createEntityClient,
  newIdempotencyKey,
} from '@/lib/pollux/runtime/client';
import { displayValue } from '@/lib/pollux/runtime/codecs';
import { uiLabels } from '@/lib/pollux/runtime/errors-pt';
import type { ListQueryState } from '@/lib/pollux/runtime/query';
import { listQueryString } from '@/lib/pollux/runtime/query';

import { CapabilityGate } from '@/components/pollux/capability-gate';
import { DataTable } from '@/components/pollux/data-table';
import { DeleteConfirm } from '@/components/pollux/delete-confirm';

/** Same-origin BFF proxy base (app/api/pollux/[...path]/route.ts). */
const PROXY_BASE = '/api/pollux';

export type EntityTableProps = {
  spec: EntitySpec;
  listHref: string;
  rows: WireRecord[];
  totalRows: number;
  capabilities: EntityCapabilities;
  query: ListQueryState;
};

export function EntityTable({
  spec,
  listHref,
  rows,
  totalRows,
  capabilities,
  query,
}: EntityTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const client = useMemo(
    () =>
      createEntityClient<WireRecord>(spec, {
        baseUrl: PROXY_BASE,
        entity: spec.id,
        // Browser client of the BFF: CSRF header on mutations + one
        // refresh-then-retry on an expired access cookie.
        bffAuth: true,
      }),
    [spec]
  );
  const [pendingDelete, setPendingDelete] = useState<{
    id: string;
    subject: string;
  } | null>(null);
  const deleteKey = useRef('');

  const pkField = spec.fields.find((f) => f.primaryKey)?.codeName ?? 'id';
  const subjectField = spec.fields.find(
    (f) =>
      f.visibility.list &&
      (f.scalarType === 'string' ||
        f.scalarType === 'varchar' ||
        f.scalarType === 'text')
  );

  const onQueryChange = (next: ListQueryState) => {
    router.push(`${pathname}${listQueryString(next, spec)}`, {
      scroll: false,
    });
  };

  return (
    <>
      <DataTable
        spec={spec}
        rows={rows}
        totalRows={totalRows}
        query={query}
        onQueryChange={onQueryChange}
        capabilities={capabilities}
        toolbarActions={
          <CapabilityGate capabilities={capabilities} require="create">
            <Link
              href={`${listHref}/new`}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {uiLabels.create}
            </Link>
          </CapabilityGate>
        }
        renderRowActions={(row) => {
          const id = String(row[pkField]);
          const subject = subjectField
            ? displayValue(subjectField, row[subjectField.codeName] ?? null)
            : id;
          return (
            <div className="flex items-center justify-end gap-3">
              <CapabilityGate capabilities={capabilities} require="update">
                <Link
                  href={`${listHref}/${encodeURIComponent(id)}/edit`}
                  className="text-sm font-medium text-foreground underline-offset-2 hover:underline"
                >
                  {uiLabels.edit}
                </Link>
              </CapabilityGate>
              <CapabilityGate capabilities={capabilities} require="delete">
                <button
                  type="button"
                  onClick={() => {
                    deleteKey.current = newIdempotencyKey();
                    setPendingDelete({ id, subject });
                  }}
                  className="text-sm font-medium text-destructive underline-offset-2 hover:underline"
                >
                  {uiLabels.delete}
                </button>
              </CapabilityGate>
            </div>
          );
        }}
      />
      <DeleteConfirm
        open={pendingDelete !== null}
        subject={pendingDelete?.subject}
        onConfirm={async () => {
          if (pendingDelete === null) return null;
          const result = await client.remove(pendingDelete.id, {
            idempotencyKey: deleteKey.current,
          });
          return result.ok ? null : result.error;
        }}
        onCancel={() => setPendingDelete(null)}
        onDeleted={() => {
          setPendingDelete(null);
          router.refresh();
        }}
      />
    </>
  );
}
