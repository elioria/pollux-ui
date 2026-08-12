// SPEC-008 same-origin API proxy (SPEC-003 subset) — TanStack Start server
// route (src/routes/api/pollux/$.ts, splat path `/api/pollux/$`).
//
// Browser (and SSR loader) code calls
// `/api/pollux/api/generated/v2/<entity>...`; this route validates the request
// against the GENERATED registry fragments (strict entity/method/query
// allowlist), rebuilds the upstream path from normalized segments (never by
// concatenating raw user input), strips cookies and client authorization,
// enforces byte limits + timeout + redirect rejection, and forwards a
// server-only bearer credential. The upstream URL and credential never reach
// client output (they are read from process.env inside this server module).
//
// Authentication (SPEC-003 BFF): the upstream bearer comes from the HttpOnly
// `pollux_access` cookie set by /api/pollux/auth (./api.pollux.auth.ts). On
// a 401 the safe UNAUTHENTICATED envelope crosses back and the shared client
// performs ONE refresh + ONE retry (same Idempotency-Key) — the refresh
// cookie is path-scoped to /api/pollux/auth, so rotation happens at the auth
// endpoint, never here. Mutations in cookie mode REQUIRE an Origin match
// against POLLUX_PUBLIC_ORIGIN plus a valid X-CSRF-Token bound to the
// HttpOnly session cookie. POLLUX_DEV_BEARER is an explicit DEV-ONLY
// fallback used ONLY when set AND no access cookie is present.
import { createFileRoute } from '@tanstack/react-router';
// Type-only: loads @tanstack/react-start's module augmentation that adds the
// `server.handlers` route option (erased at runtime, so nothing server-only
// can leak through it).
import type {} from '@tanstack/react-start';

import {
  checkMutationDefense,
  resolveProxyAuth,
} from '../../../lib/pollux/bff-core.server';

type RegistryEntry = {
  entity: string;
  methods: {
    list: boolean;
    read: boolean;
    create: boolean;
    update: boolean;
    delete: boolean;
  };
  queryKeys: readonly string[];
};

// Strict allowlist source: one generated fragment per entity.
const registry = new Map<string, RegistryEntry>();
for (const mod of Object.values(
  import.meta.glob<{ registryEntry: RegistryEntry }>(
    '../../../generated/pollux/registry/*.ts',
    { eager: true }
  )
)) {
  registry.set(mod.registryEntry.entity, mod.registryEntry);
}

const SAFE_SEGMENT = /^[A-Za-z0-9._-]{1,128}$/;
const REQUEST_ID = /^[A-Za-z0-9._-]{1,128}$/;
const MAX_REQUEST_BYTES = 1_048_576; // 1 MiB
const MAX_RESPONSE_BYTES = 5_242_880; // 5 MiB
const DEFAULT_TIMEOUT_MS = 10_000;
// Only these request headers cross the proxy (plus generated Authorization
// and X-Request-Id). Cookies and incoming Authorization are always stripped.
const FORWARD_REQUEST_HEADERS = [
  'accept',
  'content-type',
  'if-match',
  'idempotency-key',
] as const;
// Only these response headers cross back; Set-Cookie/hop-by-hop never do.
const FORWARD_RESPONSE_HEADERS = [
  'content-type',
  'etag',
  'idempotency-replayed',
  'x-request-id',
] as const;

type ErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'VALIDATION_FAILED'
  | 'NOT_FOUND'
  | 'SERVICE_UNAVAILABLE'
  | 'INTERNAL';

const HTTP_BY_CODE: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  VALIDATION_FAILED: 400,
  NOT_FOUND: 404,
  SERVICE_UNAVAILABLE: 503,
  INTERNAL: 500,
};

// Server-only environment (nitro Node server / vite dev run on Node).
const envValue = (key: string): string | undefined => {
  const value = process.env[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
};

const failure = (
  code: ErrorCode,
  message: string,
  requestId: string,
  retryable = code === 'SERVICE_UNAVAILABLE'
): Response =>
  new Response(
    JSON.stringify({ ok: false, code, message, requestId, retryable }),
    {
      status: HTTP_BY_CODE[code],
      headers: {
        'Content-Type': 'application/json',
        'X-Request-Id': requestId,
      },
    }
  );

type Operation =
  | 'list'
  | 'read'
  | 'create'
  | 'update'
  | 'delete'
  | 'capabilities';

const resolveOperation = (
  method: string,
  tail: string | undefined
): Operation | null => {
  if (method === 'GET' && tail === undefined) return 'list';
  if (method === 'GET' && tail === 'capabilities') return 'capabilities';
  if (method === 'GET') return 'read';
  if (method === 'POST' && tail === undefined) return 'create';
  if (method === 'PATCH' && tail !== undefined && tail !== 'capabilities') {
    return 'update';
  }
  if (method === 'DELETE' && tail !== undefined && tail !== 'capabilities') {
    return 'delete';
  }
  return null;
};

async function proxy(request: Request, splat: string): Promise<Response> {
  const incomingId = request.headers.get('x-request-id');
  const requestId =
    incomingId && REQUEST_ID.test(incomingId)
      ? incomingId
      : crypto.randomUUID();

  const segments = splat.split('/').filter((s) => s.length > 0);
  // Auth/authz upstream routes are NEVER proxied (the workspace BFF auth
  // endpoints live at ./auth.$action.ts).
  if (
    segments.some((s) => {
      const lowered = s.toLowerCase();
      return lowered === 'auth' || lowered === 'authz';
    })
  ) {
    return failure('NOT_FOUND', 'Registro não encontrado.', requestId);
  }
  // Fixed, versioned prefix + normalized segments only — no traversal, no v1.
  if (
    segments.length < 4 ||
    segments.length > 5 ||
    segments[0] !== 'api' ||
    segments[1] !== 'generated' ||
    segments[2] !== 'v2' ||
    !segments.slice(3).every((s) => SAFE_SEGMENT.test(s))
  ) {
    return failure('NOT_FOUND', 'Registro não encontrado.', requestId);
  }
  const entity = segments[3];
  const tail = segments[4];

  const entry = entity ? registry.get(entity) : undefined;
  if (!entry || !entity) {
    return failure('NOT_FOUND', 'Registro não encontrado.', requestId);
  }

  const operation = resolveOperation(request.method.toUpperCase(), tail);
  if (operation === null) {
    return failure(
      'VALIDATION_FAILED',
      'Dados inválidos. Verifique os campos e tente novamente.',
      requestId
    );
  }
  const allowed =
    operation === 'capabilities'
      ? entry.methods.list || entry.methods.read
      : entry.methods[operation];
  if (!allowed) {
    return failure('NOT_FOUND', 'Registro não encontrado.', requestId);
  }

  // Strict query-key allowlist: list accepts the declared keys only; every
  // other operation accepts none.
  const url = new URL(request.url);
  const allowedKeys =
    operation === 'list'
      ? new Set<string>(['page', 'pageSize', 'sort', 'q', ...entry.queryKeys])
      : new Set<string>();
  for (const key of new Set(url.searchParams.keys())) {
    if (!allowedKeys.has(key)) {
      return failure(
        'VALIDATION_FAILED',
        'Dados inválidos. Verifique os campos e tente novamente.',
        requestId
      );
    }
  }

  const apiUrl = envValue('POLLUX_API_URL');
  if (!apiUrl) {
    return failure(
      'SERVICE_UNAVAILABLE',
      'Serviço temporariamente indisponível. Tente novamente.',
      requestId
    );
  }
  const timeoutRaw = Number(envValue('POLLUX_API_TIMEOUT_MS'));
  const timeoutMs =
    Number.isInteger(timeoutRaw) && timeoutRaw >= 1 && timeoutRaw <= 120_000
      ? timeoutRaw
      : DEFAULT_TIMEOUT_MS;

  // BFF credential resolution: HttpOnly access cookie first; explicit
  // DEV-ONLY POLLUX_DEV_BEARER fallback only when no access cookie exists.
  const auth = resolveProxyAuth(
    request.headers.get('cookie'),
    envValue('POLLUX_DEV_BEARER') ?? null
  );

  // Mutation defense: Origin match (POLLUX_PUBLIC_ORIGIN) always; in cookie
  // mode additionally the CSRF double-submit bound to the session cookie.
  if (
    request.method === 'POST' ||
    request.method === 'PATCH' ||
    request.method === 'DELETE'
  ) {
    const defense = await checkMutationDefense(request, auth, {
      publicOrigin: envValue('POLLUX_PUBLIC_ORIGIN') ?? null,
      sessionSecret: envValue('POLLUX_SESSION_SECRET') ?? null,
    });
    if (!defense.ok) {
      return failure(
        'FORBIDDEN',
        'Você não tem permissão para executar esta ação.',
        requestId
      );
    }
  }

  // Body handling: strict JSON content type + request byte limit.
  let body: ArrayBuffer | undefined;
  if (request.method === 'POST' || request.method === 'PATCH') {
    const contentType = request.headers.get('content-type') ?? '';
    if (!contentType.toLowerCase().startsWith('application/json')) {
      return failure(
        'VALIDATION_FAILED',
        'Dados inválidos. Verifique os campos e tente novamente.',
        requestId
      );
    }
    body = await request.arrayBuffer();
    if (body.byteLength > MAX_REQUEST_BYTES) {
      return failure(
        'VALIDATION_FAILED',
        'Dados inválidos. Verifique os campos e tente novamente.',
        requestId
      );
    }
  }

  // Header allowlist: cookies and caller Authorization never cross.
  const upstreamHeaders = new Headers();
  for (const name of FORWARD_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) upstreamHeaders.set(name, value);
  }
  upstreamHeaders.set('X-Request-Id', requestId);
  // Upstream credential: BFF access-cookie bearer or the DEV-ONLY fallback;
  // anonymous requests carry no Authorization (the upstream fails closed).
  if (auth.bearer !== null) {
    upstreamHeaders.set('Authorization', `Bearer ${auth.bearer}`);
  }

  // Fixed upstream origin + normalized path construction.
  const base = apiUrl.replace(/\/+$/, '');
  const upstreamUrl = new URL(
    `${base}/api/generated/v2/${entity}${tail ? `/${tail}` : ''}`
  );
  if (operation === 'list') upstreamUrl.search = url.search;

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, {
      method: request.method,
      headers: upstreamHeaders,
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
      ...(body !== undefined ? { body } : {}),
    });
  } catch {
    // Timeout, DNS failure, refused connection: retryable, safe envelope.
    return failure(
      'SERVICE_UNAVAILABLE',
      'Serviço temporariamente indisponível. Tente novamente.',
      requestId,
      true
    );
  }

  // Redirect rejection: the fixed upstream must answer directly.
  if (upstream.status >= 300 && upstream.status < 400) {
    return failure(
      'SERVICE_UNAVAILABLE',
      'Serviço temporariamente indisponível. Tente novamente.',
      requestId,
      true
    );
  }

  // JSON-only responses within the byte limit; anything else normalizes.
  const upstreamType = upstream.headers.get('content-type') ?? '';
  if (!upstreamType.toLowerCase().startsWith('application/json')) {
    return failure(
      'INTERNAL',
      'Erro inesperado. Tente novamente ou contate o suporte.',
      requestId
    );
  }
  const payload = await upstream.arrayBuffer();
  if (payload.byteLength > MAX_RESPONSE_BYTES) {
    return failure(
      'INTERNAL',
      'Erro inesperado. Tente novamente ou contate o suporte.',
      requestId
    );
  }

  const responseHeaders = new Headers();
  for (const name of FORWARD_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }
  if (!responseHeaders.has('x-request-id')) {
    responseHeaders.set('X-Request-Id', requestId);
  }
  return new Response(payload, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

const handle = ({
  request,
  params,
}: {
  request: Request;
  params: Record<string, string | undefined>;
}) => proxy(request, params._splat ?? '');

export const Route = createFileRoute('/api/pollux/$')({
  server: {
    handlers: {
      GET: handle,
      POST: handle,
      PATCH: handle,
      DELETE: handle,
    },
  },
});
