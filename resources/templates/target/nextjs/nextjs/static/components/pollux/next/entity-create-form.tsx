'use client';

// SPEC-004 Next.js adapter — client wrapper around the shared EntityForm
// for the create operation. Mutations go through the same-origin BFF proxy;
// ONE idempotency key per logical submission, reused across retries (a new
// key is minted only after a successful create).
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

export function EntityCreateForm({
  spec,
  listHref,
}: {
  spec: EntitySpec;
  listHref: string;
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
      operation="create"
      onSubmit={async (values: WireRecord) => {
        const result = await client.create(values, {
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
