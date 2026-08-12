// SPEC-003 shared runtime — framework-neutral BFF authentication core.
//
// Implements the SPEC-003 "Authentication topology" client half against the
// TypeScript authorization host (GET /api/pollux/authorize,
// POST /api/pollux/token, POST /api/pollux/revoke):
//
//   - PKCE S256 pair generation (WebCrypto only: runs on Node AND workers);
//   - sealed state cookie: AES-256-GCM over {nonce, PKCE verifier, validated
//     LOCAL returnTo, issued-at}, key derived from POLLUX_SESSION_SECRET via
//     HKDF-SHA-256, 10-minute TTL, authenticated encryption (tampering or
//     expiry unseals to null);
//   - server-to-server token exchange / refresh / revoke helpers;
//   - HttpOnly, Secure, SameSite=Lax, path-scoped cookie builders
//     (access cookie Path=/api/pollux — BFF proxy only; refresh + state
//     cookies Path=/api/pollux/auth — auth endpoints only);
//   - CSRF double-submit binding: a READABLE (non-HttpOnly) cookie whose
//     value is HMAC-SHA-256(sessionId) under a key derived from the same
//     server secret; the sessionId itself travels in an HttpOnly cookie, so
//     the readable token is useless without the server-held session cookie;
//   - the fixed auth endpoint handlers (login/callback/refresh/logout) and
//     the proxy-side helpers (cookie -> bearer resolution, mutation
//     Origin+CSRF defense) that framework adapters wrap thinly.
//
// This module is dependency-free, uses only erasable TypeScript syntax (so
// `node` can run it directly via type stripping in tests) and never reads
// process.env itself — adapters resolve the environment and pass it in.
// It holds no secrets of its own and must only be imported by SERVER code.

// ---------------------------------------------------------------- constants

export const COOKIE_ACCESS = 'pollux_access';
export const COOKIE_REFRESH = 'pollux_refresh';
export const COOKIE_SESSION = 'pollux_session';
export const COOKIE_CSRF = 'pollux_csrf';
export const COOKIE_STATE = 'pollux_state';

/** Same-origin BFF proxy base — the access/session cookies are scoped here. */
export const PROXY_BASE_PATH = '/api/pollux';
/** Fixed auth endpoints base — refresh/state cookies are scoped here. */
export const AUTH_BASE_PATH = '/api/pollux/auth';
/** Exact, registered callback path appended to POLLUX_PUBLIC_ORIGIN. */
export const CALLBACK_PATH = '/api/pollux/auth/callback';

/** Sealed login state lifetime. */
export const STATE_TTL_MS = 10 * 60 * 1000;
/** Refresh-token cookie lifetime (matches the auth host's absolute family TTL). */
export const REFRESH_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

const HKDF_SALT = 'pollux-bff/v1';
const STATE_INFO = 'pollux-bff/state-aead/v1';
const CSRF_INFO = 'pollux-bff/csrf-hmac/v1';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

// ------------------------------------------------------------------- errors

export type BffErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'VALIDATION_FAILED'
  | 'NOT_FOUND'
  | 'SERVICE_UNAVAILABLE'
  | 'INTERNAL';

const HTTP_BY_CODE: Record<BffErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  VALIDATION_FAILED: 400,
  NOT_FOUND: 404,
  SERVICE_UNAVAILABLE: 503,
  INTERNAL: 500,
};

/** Safe Portuguese messages — same taxonomy text as the shared locale module. */
const MESSAGE_BY_CODE: Record<BffErrorCode, string> = {
  UNAUTHENTICATED: 'Sessão expirada ou inválida. Entre novamente.',
  FORBIDDEN: 'Você não tem permissão para executar esta ação.',
  VALIDATION_FAILED: 'Dados inválidos. Verifique os campos e tente novamente.',
  NOT_FOUND: 'Registro não encontrado.',
  SERVICE_UNAVAILABLE: 'Serviço temporariamente indisponível. Tente novamente.',
  INTERNAL: 'Erro inesperado. Tente novamente ou contate o suporte.',
};

export const bffEnvelope = (
  code: BffErrorCode,
  options?: { status?: number; headers?: HeadersInit; message?: string }
): Response => {
  const headers = new Headers(options?.headers);
  headers.set('Content-Type', 'application/json');
  headers.set('Cache-Control', 'no-store');
  return new Response(
    JSON.stringify({
      ok: false,
      code,
      message: options?.message ?? MESSAGE_BY_CODE[code],
      requestId: crypto.randomUUID(),
      retryable: code === 'SERVICE_UNAVAILABLE',
    }),
    { status: options?.status ?? HTTP_BY_CODE[code], headers }
  );
};

// -------------------------------------------------------------- environment

export type BffEnv = {
  /** Server-only URL of the TypeScript authorization host (POLLUX_AUTH_URL). */
  authUrl: string;
  /** Registered BFF client id (POLLUX_AUTH_CLIENT_ID). */
  clientId: string;
  /** Registered BFF client secret (POLLUX_AUTH_CLIENT_SECRET, server-only). */
  clientSecret: string;
  /** Cookie sealing / CSRF secret (POLLUX_SESSION_SECRET, server-only). */
  sessionSecret: string;
  /** Canonical public origin of THIS workspace (POLLUX_PUBLIC_ORIGIN). */
  publicOrigin: string;
};

export type EnvLookup = (key: string) => string | undefined | null;

/**
 * Resolve the full BFF environment. Returns null when ANY variable is
 * missing so the auth endpoints answer 503 instead of half-working — the
 * workspace then runs in the explicit DEV-ONLY POLLUX_DEV_BEARER mode.
 */
export const resolveBffEnv = (lookup: EnvLookup): BffEnv | null => {
  const read = (key: string): string | null => {
    const value = lookup(key);
    return typeof value === 'string' && value.length > 0 ? value : null;
  };
  const authUrl = read('POLLUX_AUTH_URL');
  const clientId = read('POLLUX_AUTH_CLIENT_ID');
  const clientSecret = read('POLLUX_AUTH_CLIENT_SECRET');
  const sessionSecret = read('POLLUX_SESSION_SECRET');
  const publicOrigin = read('POLLUX_PUBLIC_ORIGIN');
  if (
    !authUrl ||
    !clientId ||
    !clientSecret ||
    !sessionSecret ||
    !publicOrigin
  ) {
    return null;
  }
  return {
    authUrl: authUrl.replace(/\/+$/, ''),
    clientId,
    clientSecret,
    sessionSecret,
    publicOrigin: publicOrigin.replace(/\/+$/, ''),
  };
};

// ----------------------------------------------------------------- base64url

const toBase64Url = (bytes: Uint8Array): string => {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i] as number);
  }
  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
};

const fromBase64Url = (value: string): Uint8Array<ArrayBuffer> => {
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/');
  const padded =
    base64.length % 4 === 0
      ? base64
      : base64 + '='.repeat(4 - (base64.length % 4));
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

const randomBytes = (length: number): Uint8Array<ArrayBuffer> =>
  crypto.getRandomValues(new Uint8Array(length));

// --------------------------------------------------------------------- PKCE

export type PkcePair = { verifier: string; challenge: string };

/** RFC 7636 S256 pair: 43-char base64url verifier + SHA-256 challenge. */
export const generatePkcePair = async (): Promise<PkcePair> => {
  const verifier = toBase64Url(randomBytes(32));
  const digest = await crypto.subtle.digest(
    'SHA-256',
    encoder.encode(verifier)
  );
  return { verifier, challenge: toBase64Url(new Uint8Array(digest)) };
};

// ---------------------------------------------------------------- returnTo

/**
 * Accept ONLY a local absolute path: must start with '/', must not be
 * scheme-relative ('//host'), backslash-tricked ('/\host') or carry CR/LF.
 * Anything else returns null (callers substitute '/').
 */
export const validateReturnTo = (
  raw: string | null | undefined
): string | null => {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 2048) {
    return null;
  }
  if (!raw.startsWith('/')) return null;
  if (raw.startsWith('//') || raw.startsWith('/\\')) return null;
  if (raw.includes('\r') || raw.includes('\n') || raw.includes('\u0000'))
    return null;
  return raw;
};

// -------------------------------------------------------- key derivation

const importHkdfMaterial = (secret: string): Promise<CryptoKey> =>
  crypto.subtle.importKey('raw', encoder.encode(secret), 'HKDF', false, [
    'deriveKey',
  ]);

const deriveAeadKey = async (secret: string): Promise<CryptoKey> =>
  crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: encoder.encode(HKDF_SALT),
      info: encoder.encode(STATE_INFO),
    },
    await importHkdfMaterial(secret),
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );

const deriveCsrfKey = async (secret: string): Promise<CryptoKey> =>
  crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: encoder.encode(HKDF_SALT),
      info: encoder.encode(CSRF_INFO),
    },
    await importHkdfMaterial(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );

// ------------------------------------------------------------- sealed state

export type StatePayload = {
  /** Random nonce; also sent as the `state` query parameter. */
  nonce: string;
  /** PKCE verifier — never leaves the sealed cookie until the exchange. */
  verifier: string;
  /** Validated LOCAL return path. */
  returnTo: string;
  /** Issued-at (epoch ms) — TTL enforced on unseal. */
  iat: number;
};

/** AES-GCM seal: `base64url(iv).base64url(ciphertext)`. */
export const sealState = async (
  payload: StatePayload,
  sessionSecret: string
): Promise<string> => {
  const key = await deriveAeadKey(sessionSecret);
  const iv = randomBytes(12);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(JSON.stringify(payload))
  );
  return `${toBase64Url(iv)}.${toBase64Url(new Uint8Array(ciphertext))}`;
};

/**
 * Authenticated unseal + structural validation + TTL check. Returns null on
 * ANY failure (tampering, wrong key, malformed payload, non-local returnTo,
 * expiry, clock-skewed future issuance).
 */
export const unsealState = async (
  sealed: string | null | undefined,
  sessionSecret: string,
  nowMs: number
): Promise<StatePayload | null> => {
  if (typeof sealed !== 'string') return null;
  const dot = sealed.indexOf('.');
  if (dot <= 0 || dot === sealed.length - 1) return null;
  try {
    const iv = fromBase64Url(sealed.slice(0, dot));
    const ciphertext = fromBase64Url(sealed.slice(dot + 1));
    const key = await deriveAeadKey(sessionSecret);
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    );
    const parsed: unknown = JSON.parse(decoder.decode(plain));
    if (typeof parsed !== 'object' || parsed === null) return null;
    const candidate = parsed as Record<string, unknown>;
    if (
      typeof candidate.nonce !== 'string' ||
      candidate.nonce.length === 0 ||
      typeof candidate.verifier !== 'string' ||
      candidate.verifier.length === 0 ||
      typeof candidate.iat !== 'number'
    ) {
      return null;
    }
    const returnTo = validateReturnTo(
      typeof candidate.returnTo === 'string' ? candidate.returnTo : null
    );
    if (returnTo === null) return null;
    if (candidate.iat > nowMs + 60_000) return null; // future-dated
    if (nowMs - candidate.iat > STATE_TTL_MS) return null; // expired
    return {
      nonce: candidate.nonce,
      verifier: candidate.verifier,
      returnTo,
      iat: candidate.iat,
    };
  } catch {
    return null;
  }
};

// --------------------------------------------------------------------- CSRF

/** Readable CSRF token = base64url(HMAC-SHA-256(sessionId)) under the derived key. */
export const computeCsrfToken = async (
  sessionId: string,
  sessionSecret: string
): Promise<string> => {
  const key = await deriveCsrfKey(sessionSecret);
  const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(sessionId));
  return toBase64Url(new Uint8Array(mac));
};

/** Constant-time comparison of the presented header vs the recomputed HMAC. */
export const verifyCsrfToken = async (
  presented: string | null | undefined,
  sessionId: string,
  sessionSecret: string
): Promise<boolean> => {
  if (typeof presented !== 'string' || presented.length === 0) return false;
  const expected = await computeCsrfToken(sessionId, sessionSecret);
  const a = encoder.encode(presented);
  const b = encoder.encode(expected);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= (a[i] as number) ^ (b[i] as number);
  }
  return diff === 0;
};

// ------------------------------------------------------------------ cookies

export const parseCookies = (
  header: string | null | undefined
): Record<string, string> => {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const name = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (name.length > 0 && !(name in out)) out[name] = value;
  }
  return out;
};

export type CookieAttrs = {
  path: string;
  httpOnly: boolean;
  secure: boolean;
  maxAgeSeconds?: number;
};

export const serializeCookie = (
  name: string,
  value: string,
  attrs: CookieAttrs
): string => {
  let cookie = `${name}=${value}; Path=${attrs.path}; SameSite=Lax`;
  if (attrs.httpOnly) cookie += '; HttpOnly';
  if (attrs.secure) cookie += '; Secure';
  if (attrs.maxAgeSeconds !== undefined) {
    cookie += `; Max-Age=${attrs.maxAgeSeconds}`;
  }
  return cookie;
};

const clearCookie = (name: string, path: string, secure: boolean): string =>
  serializeCookie(name, '', { path, httpOnly: true, secure, maxAgeSeconds: 0 });

/** Secure attribute follows the workspace origin (http://localhost dev stays usable). */
export const isSecureOrigin = (publicOrigin: string): boolean =>
  publicOrigin.startsWith('https:');

export type TokenSet = {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
};

/**
 * Full authenticated cookie set:
 *   access  — HttpOnly, Path=/api/pollux (read ONLY by the BFF proxy)
 *   refresh — HttpOnly, Path=/api/pollux/auth (auth endpoints only)
 *   session — HttpOnly, Path=/api/pollux (CSRF binding id, proxy-readable)
 *   csrf    — READABLE (non-HttpOnly), Path=/ (browser JS echoes it in
 *             X-CSRF-Token; worthless without the HttpOnly session cookie)
 */
export const buildSessionCookies = (
  env: BffEnv,
  tokens: TokenSet,
  sessionId: string,
  csrfToken: string
): string[] => {
  const secure = isSecureOrigin(env.publicOrigin);
  return [
    serializeCookie(COOKIE_ACCESS, tokens.accessToken, {
      path: PROXY_BASE_PATH,
      httpOnly: true,
      secure,
      maxAgeSeconds: tokens.expiresIn,
    }),
    serializeCookie(COOKIE_REFRESH, tokens.refreshToken, {
      path: AUTH_BASE_PATH,
      httpOnly: true,
      secure,
      maxAgeSeconds: REFRESH_COOKIE_MAX_AGE_SECONDS,
    }),
    serializeCookie(COOKIE_SESSION, sessionId, {
      path: PROXY_BASE_PATH,
      httpOnly: true,
      secure,
      maxAgeSeconds: REFRESH_COOKIE_MAX_AGE_SECONDS,
    }),
    serializeCookie(COOKIE_CSRF, csrfToken, {
      path: '/',
      httpOnly: false,
      secure,
      maxAgeSeconds: REFRESH_COOKIE_MAX_AGE_SECONDS,
    }),
  ];
};

export const buildClearCookies = (env: BffEnv): string[] => {
  const secure = isSecureOrigin(env.publicOrigin);
  return [
    clearCookie(COOKIE_ACCESS, PROXY_BASE_PATH, secure),
    clearCookie(COOKIE_REFRESH, AUTH_BASE_PATH, secure),
    clearCookie(COOKIE_SESSION, PROXY_BASE_PATH, secure),
    serializeCookie(COOKIE_CSRF, '', {
      path: '/',
      httpOnly: false,
      secure,
      maxAgeSeconds: 0,
    }),
    clearCookie(COOKIE_STATE, AUTH_BASE_PATH, secure),
  ];
};

// ---------------------------------------------------- authorization host API

export type BffDeps = {
  fetchImpl?: typeof fetch;
  now?: () => number;
};

type TokenGrantResult =
  | { ok: true; tokens: TokenSet }
  | { ok: false; status: number; error: string };

const tokenPost = async (
  env: BffEnv,
  endpoint: 'token' | 'revoke',
  params: Record<string, string>,
  fetchImpl: typeof fetch
): Promise<{ status: number; body: Record<string, unknown> }> => {
  const body = new URLSearchParams({
    client_id: env.clientId,
    client_secret: env.clientSecret,
    ...params,
  });
  const response = await fetchImpl(`${env.authUrl}/api/pollux/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    redirect: 'error',
  });
  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch {
    parsed = {};
  }
  return {
    status: response.status,
    body:
      typeof parsed === 'object' && parsed !== null
        ? (parsed as Record<string, unknown>)
        : {},
  };
};

const asTokenSet = (body: Record<string, unknown>): TokenSet | null => {
  if (
    typeof body.access_token !== 'string' ||
    typeof body.refresh_token !== 'string' ||
    typeof body.expires_in !== 'number'
  ) {
    return null;
  }
  return {
    accessToken: body.access_token,
    expiresIn: body.expires_in,
    refreshToken: body.refresh_token,
  };
};

/** grant_type=authorization_code: server-to-server, carries the client secret. */
export const exchangeAuthorizationCode = async (
  env: BffEnv,
  input: { code: string; verifier: string },
  fetchImpl: typeof fetch
): Promise<TokenGrantResult> => {
  const { status, body } = await tokenPost(
    env,
    'token',
    {
      grant_type: 'authorization_code',
      code: input.code,
      code_verifier: input.verifier,
      redirect_uri: `${env.publicOrigin}${CALLBACK_PATH}`,
    },
    fetchImpl
  );
  const tokens = asTokenSet(body);
  if (status !== 200 || tokens === null) {
    return {
      ok: false,
      status,
      error: typeof body.error === 'string' ? body.error : 'invalid_response',
    };
  }
  return { ok: true, tokens };
};

/** grant_type=refresh_token: rotates the pair (reuse revokes the family upstream). */
export const refreshTokenGrant = async (
  env: BffEnv,
  refreshToken: string,
  fetchImpl: typeof fetch
): Promise<TokenGrantResult> => {
  const { status, body } = await tokenPost(
    env,
    'token',
    { grant_type: 'refresh_token', refresh_token: refreshToken },
    fetchImpl
  );
  const tokens = asTokenSet(body);
  if (status !== 200 || tokens === null) {
    return {
      ok: false,
      status,
      error: typeof body.error === 'string' ? body.error : 'invalid_response',
    };
  }
  return { ok: true, tokens };
};

/** Revoke the refresh-token family (logout). Unknown tokens are not errors. */
export const revokeRefreshToken = async (
  env: BffEnv,
  refreshToken: string,
  fetchImpl: typeof fetch
): Promise<void> => {
  try {
    await tokenPost(env, 'revoke', { refresh_token: refreshToken }, fetchImpl);
  } catch {
    // Best-effort: local cookies are cleared regardless.
  }
};

// ---------------------------------------------------------- proxy-side auth

export type ProxyAuthMode = 'cookie' | 'dev-bearer' | 'anonymous';

export type ProxyAuth = {
  mode: ProxyAuthMode;
  /** Bearer for the upstream Authorization header (null => send none). */
  bearer: string | null;
  /** CSRF-binding session id (cookie mode only). */
  sessionId: string | null;
};

/**
 * Resolve the upstream credential for one proxied request. The HttpOnly
 * access cookie always wins; POLLUX_DEV_BEARER is an explicit DEV-ONLY
 * fallback used ONLY when set AND no access cookie is present.
 */
export const resolveProxyAuth = (
  cookieHeader: string | null | undefined,
  devBearer: string | null | undefined
): ProxyAuth => {
  const cookies = parseCookies(cookieHeader);
  const access = cookies[COOKIE_ACCESS];
  if (typeof access === 'string' && access.length > 0) {
    return {
      mode: 'cookie',
      bearer: access,
      sessionId:
        typeof cookies[COOKIE_SESSION] === 'string' &&
        cookies[COOKIE_SESSION].length > 0
          ? cookies[COOKIE_SESSION]
          : null,
    };
  }
  if (typeof devBearer === 'string' && devBearer.length > 0) {
    return { mode: 'dev-bearer', bearer: devBearer, sessionId: null };
  }
  return { mode: 'anonymous', bearer: null, sessionId: null };
};

export type MutationDefenseResult =
  | { ok: true }
  | { ok: false; reason: 'origin' | 'session' | 'csrf' };

/**
 * SPEC-003 proxy mutation defense. Cookie mode REQUIRES an Origin header
 * matching POLLUX_PUBLIC_ORIGIN (or the request origin when unset) AND a
 * valid X-CSRF-Token bound to the HttpOnly session cookie. Dev-bearer and
 * anonymous requests carry no ambient credential, so they only get the
 * cheap same-origin check (an Origin header, when present, must match).
 */
export const checkMutationDefense = async (
  request: Request,
  auth: ProxyAuth,
  env: { publicOrigin?: string | null; sessionSecret?: string | null }
): Promise<MutationDefenseResult> => {
  const expectedOrigin =
    env.publicOrigin && env.publicOrigin.length > 0
      ? env.publicOrigin.replace(/\/+$/, '')
      : new URL(request.url).origin;
  const origin = request.headers.get('origin');
  if (auth.mode === 'cookie') {
    if (origin === null || origin !== expectedOrigin) {
      return { ok: false, reason: 'origin' };
    }
    if (auth.sessionId === null || !env.sessionSecret) {
      return { ok: false, reason: 'session' };
    }
    const presented = request.headers.get('x-csrf-token');
    const valid = await verifyCsrfToken(
      presented,
      auth.sessionId,
      env.sessionSecret
    );
    if (!valid) return { ok: false, reason: 'csrf' };
    return { ok: true };
  }
  if (origin !== null && origin !== expectedOrigin) {
    return { ok: false, reason: 'origin' };
  }
  return { ok: true };
};

// ------------------------------------------------------------ auth handlers

const redirect = (location: string, setCookies: string[]): Response => {
  const headers = new Headers({
    Location: location,
    'Cache-Control': 'no-store',
  });
  for (const cookie of setCookies) headers.append('Set-Cookie', cookie);
  return new Response(null, { status: 302, headers });
};

/**
 * GET /api/pollux/auth/login?returnTo=<local-path>
 * Seals nonce + PKCE verifier + validated local returnTo into the state
 * cookie and redirects to the authorization host with ONLY the derived
 * challenge (never the verifier).
 */
export const handleLogin = async (
  request: Request,
  env: BffEnv,
  deps: BffDeps = {}
): Promise<Response> => {
  const now = deps.now ?? Date.now;
  const url = new URL(request.url);
  const returnTo = validateReturnTo(url.searchParams.get('returnTo')) ?? '/';
  const { verifier, challenge } = await generatePkcePair();
  const nonce = toBase64Url(randomBytes(16));
  const sealed = await sealState(
    { nonce, verifier, returnTo, iat: now() },
    env.sessionSecret
  );

  const authorize = new URL(`${env.authUrl}/api/pollux/authorize`);
  authorize.searchParams.set('client_id', env.clientId);
  authorize.searchParams.set(
    'redirect_uri',
    `${env.publicOrigin}${CALLBACK_PATH}`
  );
  authorize.searchParams.set('code_challenge', challenge);
  authorize.searchParams.set('code_challenge_method', 'S256');
  authorize.searchParams.set('state', nonce);
  authorize.searchParams.set('nonce', nonce);

  return redirect(authorize.toString(), [
    serializeCookie(COOKIE_STATE, sealed, {
      path: AUTH_BASE_PATH,
      httpOnly: true,
      secure: isSecureOrigin(env.publicOrigin),
      maxAgeSeconds: Math.floor(STATE_TTL_MS / 1000),
    }),
  ]);
};

/**
 * GET /api/pollux/auth/callback?code=..&state=..
 * Verifies the sealed state cookie against the query state, exchanges the
 * code + PKCE verifier server-to-server (client secret never touches the
 * browser), then sets the access/refresh/session/CSRF cookies and redirects
 * to the stored LOCAL returnTo.
 */
export const handleCallback = async (
  request: Request,
  env: BffEnv,
  deps: BffDeps = {}
): Promise<Response> => {
  const now = deps.now ?? Date.now;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const url = new URL(request.url);
  const secure = isSecureOrigin(env.publicOrigin);
  const clearState = clearCookie(COOKIE_STATE, AUTH_BASE_PATH, secure);

  const cookies = parseCookies(request.headers.get('cookie'));
  const state = await unsealState(
    cookies[COOKIE_STATE],
    env.sessionSecret,
    now()
  );
  const queryState = url.searchParams.get('state');
  const code = url.searchParams.get('code');

  // Missing/expired/tampered state cookie, state mismatch or missing code:
  // fail closed with a safe envelope, never redirect to attacker input.
  if (state === null || queryState === null || queryState !== state.nonce) {
    return bffEnvelope('VALIDATION_FAILED', {
      headers: { 'Set-Cookie': clearState },
      message: 'Não foi possível validar o login. Inicie o login novamente.',
    });
  }
  // Authorization host refused (state verified, so this is our request).
  if (url.searchParams.get('error') !== null) {
    return bffEnvelope('UNAUTHENTICATED', {
      headers: { 'Set-Cookie': clearState },
    });
  }
  if (code === null || code.length === 0) {
    return bffEnvelope('VALIDATION_FAILED', {
      headers: { 'Set-Cookie': clearState },
      message: 'Não foi possível validar o login. Inicie o login novamente.',
    });
  }

  let exchange: Awaited<ReturnType<typeof exchangeAuthorizationCode>>;
  try {
    exchange = await exchangeAuthorizationCode(
      env,
      { code, verifier: state.verifier },
      fetchImpl
    );
  } catch {
    return bffEnvelope('SERVICE_UNAVAILABLE', {
      headers: { 'Set-Cookie': clearState },
    });
  }
  if (!exchange.ok) {
    return bffEnvelope('UNAUTHENTICATED', {
      headers: { 'Set-Cookie': clearState },
    });
  }

  const sessionId = toBase64Url(randomBytes(16));
  const csrfToken = await computeCsrfToken(sessionId, env.sessionSecret);
  return redirect(state.returnTo, [
    ...buildSessionCookies(env, exchange.tokens, sessionId, csrfToken),
    clearState,
  ]);
};

/**
 * POST /api/pollux/auth/refresh
 * Rotates access + refresh cookies via the refresh grant (ONE rotation per
 * call; upstream reuse detection revokes the family). Origin + CSRF bound.
 */
export const handleRefresh = async (
  request: Request,
  env: BffEnv,
  deps: BffDeps = {}
): Promise<Response> => {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const cookies = parseCookies(request.headers.get('cookie'));

  const origin = request.headers.get('origin');
  if (origin !== null && origin !== env.publicOrigin) {
    return bffEnvelope('FORBIDDEN');
  }
  const sessionId = cookies[COOKIE_SESSION];
  if (typeof sessionId !== 'string' || sessionId.length === 0) {
    return bffEnvelope('UNAUTHENTICATED');
  }
  const csrfOk = await verifyCsrfToken(
    request.headers.get('x-csrf-token'),
    sessionId,
    env.sessionSecret
  );
  if (!csrfOk) return bffEnvelope('FORBIDDEN');

  const refreshToken = cookies[COOKIE_REFRESH];
  if (typeof refreshToken !== 'string' || refreshToken.length === 0) {
    return bffEnvelope('UNAUTHENTICATED');
  }

  let result: Awaited<ReturnType<typeof refreshTokenGrant>>;
  try {
    result = await refreshTokenGrant(env, refreshToken, fetchImpl);
  } catch {
    return bffEnvelope('SERVICE_UNAVAILABLE');
  }
  if (!result.ok) {
    const headers = new Headers();
    for (const cookie of buildClearCookies(env)) {
      headers.append('Set-Cookie', cookie);
    }
    return bffEnvelope('UNAUTHENTICATED', { headers });
  }

  const csrfToken = await computeCsrfToken(sessionId, env.sessionSecret);
  const headers = new Headers({
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  });
  for (const cookie of buildSessionCookies(
    env,
    result.tokens,
    sessionId,
    csrfToken
  )) {
    headers.append('Set-Cookie', cookie);
  }
  return new Response(JSON.stringify({ ok: true, data: { refreshed: true } }), {
    status: 200,
    headers,
  });
};

/**
 * POST /api/pollux/auth/logout[?returnTo=<local-path>]
 * Revokes the refresh-token family at the authorization host (best-effort),
 * clears every auth cookie and redirects to a LOCAL logged-out page.
 */
export const handleLogout = async (
  request: Request,
  env: BffEnv,
  deps: BffDeps = {}
): Promise<Response> => {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const origin = request.headers.get('origin');
  if (origin !== null && origin !== env.publicOrigin) {
    return bffEnvelope('FORBIDDEN');
  }
  const cookies = parseCookies(request.headers.get('cookie'));
  const refreshToken = cookies[COOKIE_REFRESH];
  if (typeof refreshToken === 'string' && refreshToken.length > 0) {
    await revokeRefreshToken(env, refreshToken, fetchImpl);
  }
  const url = new URL(request.url);
  const target = validateReturnTo(url.searchParams.get('returnTo')) ?? '/';
  const headers = new Headers({
    Location: target,
    'Cache-Control': 'no-store',
  });
  for (const cookie of buildClearCookies(env)) {
    headers.append('Set-Cookie', cookie);
  }
  return new Response(null, { status: 303, headers });
};

// ------------------------------------------------------------- dispatcher

const ACTION_METHODS: Record<string, string> = {
  login: 'GET',
  callback: 'GET',
  refresh: 'POST',
  logout: 'POST',
};

/** 503 when the POLLUX_AUTH / POLLUX_SESSION env is not (fully) configured. */
export const bffNotConfigured = (): Response =>
  bffEnvelope('SERVICE_UNAVAILABLE', {
    message:
      'Autenticação não configurada neste ambiente (defina POLLUX_AUTH_URL, POLLUX_AUTH_CLIENT_ID, POLLUX_AUTH_CLIENT_SECRET, POLLUX_SESSION_SECRET e POLLUX_PUBLIC_ORIGIN).',
  });

/**
 * Uniform dispatcher for the fixed auth endpoints. Framework adapters parse
 * the action segment and delegate here; unknown actions 404, wrong methods
 * 405, unconfigured environments 503.
 */
export const handleAuthAction = async (
  action: string,
  request: Request,
  env: BffEnv | null,
  deps: BffDeps = {}
): Promise<Response> => {
  const expectedMethod = ACTION_METHODS[action];
  if (expectedMethod === undefined) return bffEnvelope('NOT_FOUND');
  if (env === null) return bffNotConfigured();
  if (request.method.toUpperCase() !== expectedMethod) {
    return bffEnvelope('VALIDATION_FAILED', { status: 405 });
  }
  if (action === 'login') return handleLogin(request, env, deps);
  if (action === 'callback') return handleCallback(request, env, deps);
  if (action === 'refresh') return handleRefresh(request, env, deps);
  return handleLogout(request, env, deps);
};
