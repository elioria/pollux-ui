// SPEC-004 Next.js adapter — server-side data access for generated Server
// Component pages. Talks to the upstream Pollux standalone API v2 directly
// (same shared client the browser uses through the proxy), adding the
// server-held bearer and a bounded timeout. Never imported by client code.
import 'server-only';

import type {
  ApiErrorShape,
  ApiResult,
  EntitySpec,
  ListResponse,
  WireRecord,
} from '@/lib/pollux/runtime/api-types';
import { createEntityClient } from '@/lib/pollux/runtime/client';
import { errorMessages } from '@/lib/pollux/runtime/errors-pt';
import type { ListQueryState } from '@/lib/pollux/runtime/query';

import { type PolluxServerEnv, polluxServerEnv } from './env';

const unavailable = (): { ok: false; error: ApiErrorShape } => ({
  ok: false,
  error: {
    code: 'SERVICE_UNAVAILABLE',
    message: errorMessages.SERVICE_UNAVAILABLE,
    requestId: '',
    retryable: true,
  },
});

const clientFor = (spec: EntitySpec, env: PolluxServerEnv) =>
  createEntityClient<WireRecord>(spec, {
    baseUrl: env.apiUrl ?? '',
    entity: spec.id,
    // TODO SPEC-003-auth: interim dev bearer; the PKCE BFF flow replaces it.
    getHeaders: (): Record<string, string> =>
      env.devBearer === null
        ? {}
        : { Authorization: `Bearer ${env.devBearer}` },
  });

/** Server-side list fetch for the initial Server Component boundary. */
export async function serverList(
  spec: EntitySpec,
  query: ListQueryState
): Promise<ApiResult<ListResponse<WireRecord>>> {
  const env = polluxServerEnv();
  if (env.apiUrl === null) return unavailable();
  try {
    return await clientFor(spec, env).list(query, {
      signal: AbortSignal.timeout(env.timeoutMs),
    });
  } catch {
    // Timeouts/aborts rethrow through the shared client; fail safe.
    return unavailable();
  }
}

/** Server-side single-record fetch (update page initial values). */
export async function serverGet(
  spec: EntitySpec,
  id: string
): Promise<ApiResult<WireRecord>> {
  const env = polluxServerEnv();
  if (env.apiUrl === null) return unavailable();
  try {
    return await clientFor(spec, env).get(id, {
      signal: AbortSignal.timeout(env.timeoutMs),
    });
  } catch {
    return unavailable();
  }
}
