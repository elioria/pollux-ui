'use client';

// SPEC-004 Next.js adapter — client wrapper around the shared EntityForm
// for the update operation. Mutations go through the same-origin BFF proxy;
// ONE idempotency key per logical submission, reused across retries.
import { useRouter } from 'next/navigation';
import { useMemo, useRef } from 'react';

import type { EntitySpec, WireRecord } from '@/lib/pollux/runtime/api-types';
import {
  createEntityClient,
  newIdempotencyKey,
} from '@/lib/pollux/runtime/client';

import { EntityForm } from '@/components/pollux/entity-form';

/** Same-origin BFF proxy base (app/api/pollux/[...path]/route.ts). */
const PROXY_BASE = '/api/pollux';

export function EntityEditForm({
  spec,
  listHref,
  id,
  initial,
}: {
  spec: EntitySpec;
  listHref: string;
  id: string;
  initial: WireRecord;
}) {
  const router = useRouter();
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
  const idempotencyKey = useRef(newIdempotencyKey());

  return (
    <EntityForm
      spec={spec}
      operation="update"
      initial={initial}
      onSubmit={async (values: WireRecord) => {
        const result = await client.update(id, values, {
          idempotencyKey: idempotencyKey.current,
        });
        if (!result.ok) return result.error;
        idempotencyKey.current = newIdempotencyKey();
        router.push(listHref);
        router.refresh();
        return null;
      }}
      onCancel={() => router.push(listHref)}
    />
  );
}
