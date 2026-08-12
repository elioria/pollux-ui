// SPEC-003 shared runtime — typed fetch client for the standalone API v2.
//
// Framework-neutral: works against the adapter's same-origin BFF proxy (or
// the mock server in tests). It never sees tokens — authentication travels in
// HttpOnly cookies through the proxy; `getHeaders` exists so a server-side
// caller (or a test) can inject Authorization/CSRF headers.
//
// Every method accepts an AbortSignal for cancellation. Errors are always
// normalized to the safe ApiErrorShape envelope: network failures become
// retryable SERVICE_UNAVAILABLE, malformed bodies become INTERNAL, and an
// aborted request rethrows the AbortError so callers can ignore stale loads.

import type {
  ApiErrorShape,
  ApiResult,
  DeleteResponse,
  EntityCapabilities,
  EntitySpec,
  ListResponse,
  WireRecord,
} from './api-types';
import { isApiErrorShape } from './api-types';
import type { ListQueryState } from './query';
import { stringifyListQuery } from './query';

export type EntityClientOptions = {
  /** Base URL of the proxy, e.g. '' (same origin) or 'http://127.0.0.1:4310'. */
  baseUrl: string;
  /** Entity code, e.g. 'amostra'. */
  entity: string;
  /** Fetch implementation (default: globalThis.fetch). */
  fetchImpl?: typeof fetch;
  /** Extra headers per request (async allowed): auth, CSRF, request id. */
  getHeaders?: () => Promise<Record<string, string>> | Record<string, string>;
  /**
   * Enable BFF cookie-session plumbing (browser clients talking to the
   * same-origin proxy ONLY — never for server-side direct upstream access):
   * every mutation echoes the readable CSRF cookie as `X-CSRF-Token`, and an
   * UNAUTHENTICATED result triggers ONE `POST {baseUrl}/auth/refresh`
   * (server-side token rotation) followed by ONE retry of the original
   * request reusing the same Idempotency-Key, per the SPEC-003 retry rule.
   */
  bffAuth?: boolean;
};

/** Readable CSRF cookie set by the BFF callback (HMAC of the session id). */
const CSRF_COOKIE = 'pollux_csrf';

/** Read the CSRF token from document.cookie (null outside a browser). */
export const readCsrfToken = (): string | null => {
  if (typeof document === 'undefined') return null;
  for (const part of document.cookie.split(';')) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    if (part.slice(0, eq).trim() === CSRF_COOKIE) {
      const value = part.slice(eq + 1).trim();
      return value.length > 0 ? value : null;
    }
  }
  return null;
};

export type RequestOptions = { signal?: AbortSignal };

export type MutationOptions = RequestOptions & {
  /**
   * Key for exactly-once semantics. Generate it ONCE per logical user
   * submission with `newIdempotencyKey()` and reuse the same value across
   * every retry of that submission (including retry-after-refresh).
   */
  idempotencyKey: string;
  /** Optimistic-concurrency guard for update (record's ETag version). */
  ifMatch?: string;
};

/** Generate an idempotency key. One logical submission = one key, reused across retries. */
export const newIdempotencyKey = (): string => crypto.randomUUID();

const fallbackError = (
  code: ApiErrorShape['code'],
  message: string,
  retryable: boolean
): ApiErrorShape => ({ code, message, requestId: '', retryable });

export type EntityClient<Row extends WireRecord> = {
  list(
    state: ListQueryState,
    options?: RequestOptions
  ): Promise<ApiResult<ListResponse<Row>>>;
  get(id: string, options?: RequestOptions): Promise<ApiResult<Row>>;
  create(
    input: Partial<Row>,
    options: MutationOptions
  ): Promise<ApiResult<Row>>;
  update(
    id: string,
    input: Partial<Row>,
    options: MutationOptions
  ): Promise<ApiResult<Row>>;
  remove(
    id: string,
    options: MutationOptions
  ): Promise<ApiResult<DeleteResponse>>;
  capabilities(
    options?: RequestOptions
  ): Promise<ApiResult<EntityCapabilities>>;
};

export function createEntityClient<Row extends WireRecord>(
  spec: EntitySpec,
  options: EntityClientOptions
): EntityClient<Row> {
  const { baseUrl, entity, getHeaders, bffAuth } = options;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const proxyBase = baseUrl.replace(/\/$/, '');
  const root = `${proxyBase}/api/generated/v2/${entity}`;

  /** ONE server-side token rotation via the BFF; true when it succeeded. */
  const tryBffRefresh = async (): Promise<boolean> => {
    try {
      const headers: Record<string, string> = {};
      const csrf = readCsrfToken();
      if (csrf !== null) headers['X-CSRF-Token'] = csrf;
      const response = await fetchImpl(`${proxyBase}/auth/refresh`, {
        method: 'POST',
        headers,
      });
      if (!response.ok) return false;
      const parsed: unknown = await response.json().catch(() => null);
      return (
        typeof parsed === 'object' &&
        parsed !== null &&
        (parsed as { ok?: unknown }).ok === true
      );
    } catch {
      return false;
    }
  };

  const request = async <T>(
    path: string,
    init: RequestInit & { idempotencyKey?: string; ifMatch?: string },
    body?: unknown,
    isRetry = false
  ): Promise<ApiResult<T>> => {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...(getHeaders ? await getHeaders() : {}),
    };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (init.idempotencyKey) headers['Idempotency-Key'] = init.idempotencyKey;
    if (init.ifMatch !== undefined) headers['If-Match'] = init.ifMatch;
    // BFF CSRF double-submit: mutations echo the readable cookie value; the
    // proxy recomputes the HMAC against the HttpOnly session cookie.
    const method = (init.method ?? 'GET').toUpperCase();
    if (bffAuth && method !== 'GET' && headers['X-CSRF-Token'] === undefined) {
      const csrf = readCsrfToken();
      if (csrf !== null) headers['X-CSRF-Token'] = csrf;
    }

    let response: Response;
    try {
      response = await fetchImpl(`${root}${path}`, {
        method: init.method ?? 'GET',
        signal: init.signal,
        headers,
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
    } catch (error) {
      // Cancellation is not an API failure: let the caller drop stale work.
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw error;
      }
      return {
        ok: false,
        error: fallbackError(
          'SERVICE_UNAVAILABLE',
          'Serviço temporariamente indisponível. Tente novamente.',
          true
        ),
      };
    }

    let parsed: unknown;
    try {
      parsed = await response.json();
    } catch {
      parsed = undefined;
    }

    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      (parsed as { ok?: unknown }).ok === true
    ) {
      return { ok: true, data: (parsed as { data: T }).data };
    }
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      (parsed as { ok?: unknown }).ok === false &&
      isApiErrorShape(parsed)
    ) {
      // Expired access token: rotate once through the BFF and retry the SAME
      // request once (identical Idempotency-Key — the API replays or dedups).
      if (
        bffAuth &&
        !isRetry &&
        parsed.code === 'UNAUTHENTICATED' &&
        (await tryBffRefresh())
      ) {
        return request<T>(path, init, body, true);
      }
      return { ok: false, error: parsed };
    }
    // Anything else (proxy hiccup, HTML error page) normalizes safely.
    return {
      ok: false,
      error: fallbackError(
        response.status >= 500 ? 'SERVICE_UNAVAILABLE' : 'INTERNAL',
        'Erro inesperado. Tente novamente ou contate o suporte.',
        response.status >= 500
      ),
    };
  };

  return {
    list: (state, requestOptions) => {
      const qs = stringifyListQuery(state, spec).toString();
      return request(`${qs ? `?${qs}` : ''}`, {
        signal: requestOptions?.signal,
      });
    },
    get: (id, requestOptions) =>
      request(`/${encodeURIComponent(id)}`, {
        signal: requestOptions?.signal,
      }),
    create: (input, mutationOptions) =>
      request(
        '',
        {
          method: 'POST',
          signal: mutationOptions.signal,
          idempotencyKey: mutationOptions.idempotencyKey,
        },
        input
      ),
    update: (id, input, mutationOptions) =>
      request(
        `/${encodeURIComponent(id)}`,
        {
          method: 'PATCH',
          signal: mutationOptions.signal,
          idempotencyKey: mutationOptions.idempotencyKey,
          ifMatch: mutationOptions.ifMatch,
        },
        input
      ),
    remove: (id, mutationOptions) =>
      request(`/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        signal: mutationOptions.signal,
        idempotencyKey: mutationOptions.idempotencyKey,
      }),
    capabilities: (requestOptions) =>
      request('/capabilities', { signal: requestOptions?.signal }),
  };
}
