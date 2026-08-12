// SPEC-003 — negative-path + flow tests for the shared BFF auth core.
// The template is dependency-free, erasable-syntax TypeScript, so Node's
// built-in type stripping loads it directly (Node >= 23.6; repo uses 24).
//
//   node --test scripts/pollux/targets/bff-core.unit.spec.mjs
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';

import {
  AUTH_BASE_PATH,
  buildClearCookies,
  buildSessionCookies,
  checkMutationDefense,
  computeCsrfToken,
  COOKIE_ACCESS,
  COOKIE_CSRF,
  COOKIE_REFRESH,
  COOKIE_SESSION,
  COOKIE_STATE,
  generatePkcePair,
  handleAuthAction,
  handleCallback,
  handleLogin,
  handleLogout,
  handleRefresh,
  parseCookies,
  PROXY_BASE_PATH,
  resolveBffEnv,
  resolveProxyAuth,
  sealState,
  serializeCookie,
  STATE_TTL_MS,
  unsealState,
  validateReturnTo,
  verifyCsrfToken,
} from '../../../_templates/pollux-targets/shared/runtime/bff-core.ts';

const SECRET = 'unit-test-session-secret';

const ENV = {
  authUrl: 'https://auth.example.test',
  clientId: 'workspace-client',
  clientSecret: 'workspace-secret',
  sessionSecret: SECRET,
  publicOrigin: 'https://app.example.test',
};

const request = (url, { method = 'GET', headers = {} } = {}) =>
  new Request(url, { method, headers });

const setCookies = (response) => response.headers.getSetCookie();

const cookieByName = (response, name) => {
  const match = setCookies(response).find((c) => c.startsWith(`${name}=`));
  if (!match) return null;
  return match;
};

const cookieValue = (cookie) =>
  cookie.split(';')[0].split('=').slice(1).join('=');

/** fetch stub: records calls, answers from a queue (or a fixed responder). */
const fetchStub = (responder) => {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url: String(url), init });
    return responder(String(url), init);
  };
  return { impl, calls };
};

const tokenResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const GOOD_TOKENS = {
  access_token: 'jwt-access-token',
  token_type: 'Bearer',
  expires_in: 900,
  refresh_token: 'opaque-refresh-token',
};

describe('validateReturnTo', () => {
  it('accepts local absolute paths only', () => {
    assert.equal(
      validateReturnTo('/manager/amostras?page=2'),
      '/manager/amostras?page=2'
    );
    assert.equal(validateReturnTo('/'), '/');
  });
  it('rejects absolute, scheme-relative and malformed values', () => {
    for (const bad of [
      null,
      undefined,
      '',
      'https://evil.test/',
      'http://evil.test',
      '//evil.test/phish',
      '/\\evil.test',
      'javascript:alert(1)',
      'manager/amostras',
      '/ok\r\nSet-Cookie: x=1',
      '/x'.repeat(2000),
    ]) {
      assert.equal(validateReturnTo(bad), null, String(bad).slice(0, 40));
    }
  });
});

describe('PKCE', () => {
  it('generates an S256 pair (challenge = BASE64URL(SHA256(verifier)))', async () => {
    const { verifier, challenge } = await generatePkcePair();
    assert.match(verifier, /^[A-Za-z0-9_-]{43}$/);
    const expected = createHash('sha256').update(verifier).digest('base64url');
    assert.equal(challenge, expected);
    const second = await generatePkcePair();
    assert.notEqual(second.verifier, verifier);
  });
});

describe('sealed state', () => {
  const payload = {
    nonce: 'n1',
    verifier: 'v'.repeat(43),
    returnTo: '/x',
    iat: 1_000_000,
  };

  it('round-trips within the TTL', async () => {
    const sealed = await sealState(payload, SECRET);
    const opened = await unsealState(sealed, SECRET, payload.iat + 5_000);
    assert.deepEqual(opened, payload);
  });

  it('rejects an expired state (10-minute TTL)', async () => {
    const sealed = await sealState(payload, SECRET);
    assert.equal(
      await unsealState(sealed, SECRET, payload.iat + STATE_TTL_MS + 1),
      null
    );
  });

  it('rejects future-dated, tampered, wrong-key and malformed states', async () => {
    const sealed = await sealState(payload, SECRET);
    assert.equal(
      await unsealState(sealed, SECRET, payload.iat - 120_000),
      null
    );
    const flipped = sealed.slice(0, -2) + (sealed.endsWith('AA') ? 'BB' : 'AA');
    assert.equal(await unsealState(flipped, SECRET, payload.iat), null);
    assert.equal(await unsealState(sealed, 'other-secret', payload.iat), null);
    assert.equal(await unsealState('garbage', SECRET, payload.iat), null);
    assert.equal(await unsealState(null, SECRET, payload.iat), null);
  });

  it('rejects a sealed payload whose returnTo is not local', async () => {
    const sealed = await sealState(
      { ...payload, returnTo: 'https://evil.test/' },
      SECRET
    );
    assert.equal(await unsealState(sealed, SECRET, payload.iat), null);
  });
});

describe('CSRF binding', () => {
  it('verifies the HMAC of the session id and nothing else', async () => {
    const token = await computeCsrfToken('session-1', SECRET);
    assert.equal(await verifyCsrfToken(token, 'session-1', SECRET), true);
    assert.equal(await verifyCsrfToken(token, 'session-2', SECRET), false);
    assert.equal(await verifyCsrfToken(token, 'session-1', 'other'), false);
    assert.equal(await verifyCsrfToken('forged', 'session-1', SECRET), false);
    assert.equal(await verifyCsrfToken(null, 'session-1', SECRET), false);
    assert.equal(await verifyCsrfToken('', 'session-1', SECRET), false);
  });
});

describe('cookies', () => {
  it('parses and serializes attributes correctly', () => {
    const parsed = parseCookies('a=1; b=two; malformed; c=x=y');
    assert.deepEqual(parsed, { a: '1', b: 'two', c: 'x=y' });
    const cookie = serializeCookie('n', 'v', {
      path: '/p',
      httpOnly: true,
      secure: true,
      maxAgeSeconds: 5,
    });
    assert.equal(
      cookie,
      'n=v; Path=/p; SameSite=Lax; HttpOnly; Secure; Max-Age=5'
    );
  });

  it('scopes the session cookie set per the SPEC-003 contract', async () => {
    const csrf = await computeCsrfToken('sid', SECRET);
    const cookies = buildSessionCookies(
      ENV,
      { accessToken: 'at', expiresIn: 900, refreshToken: 'rt' },
      'sid',
      csrf
    );
    const byName = Object.fromEntries(cookies.map((c) => [c.split('=')[0], c]));
    assert.match(byName[COOKIE_ACCESS], /Path=\/api\/pollux;/);
    assert.match(byName[COOKIE_ACCESS], /HttpOnly/);
    assert.match(byName[COOKIE_ACCESS], /Max-Age=900/);
    assert.match(byName[COOKIE_REFRESH], /Path=\/api\/pollux\/auth;/);
    assert.match(byName[COOKIE_REFRESH], /HttpOnly/);
    assert.match(byName[COOKIE_SESSION], /Path=\/api\/pollux;/);
    // CSRF cookie is READABLE by design (double-submit) — never HttpOnly.
    assert.doesNotMatch(byName[COOKIE_CSRF], /HttpOnly/);
    for (const cookie of cookies) assert.match(cookie, /SameSite=Lax/);
    for (const cookie of cookies) assert.match(cookie, /Secure/);
    // Clearing covers every cookie incl. state.
    const cleared = buildClearCookies(ENV);
    assert.equal(cleared.length, 5);
    for (const cookie of cleared) assert.match(cookie, /Max-Age=0/);
  });
});

describe('resolveBffEnv', () => {
  it('returns null unless every variable is present', () => {
    const full = {
      POLLUX_AUTH_URL: 'https://auth.example.test/',
      POLLUX_AUTH_CLIENT_ID: 'c',
      POLLUX_AUTH_CLIENT_SECRET: 's',
      POLLUX_SESSION_SECRET: 'k',
      POLLUX_PUBLIC_ORIGIN: 'https://app.example.test/',
    };
    const env = resolveBffEnv((k) => full[k]);
    assert.equal(env.authUrl, 'https://auth.example.test');
    assert.equal(env.publicOrigin, 'https://app.example.test');
    for (const key of Object.keys(full)) {
      const partial = { ...full, [key]: '' };
      assert.equal(
        resolveBffEnv((k) => partial[k]),
        null,
        `missing ${key}`
      );
    }
  });
});

describe('resolveProxyAuth', () => {
  it('prefers the access cookie, then the DEV-ONLY bearer, then anonymous', () => {
    const cookieHeader = `${COOKIE_ACCESS}=jwt; ${COOKIE_SESSION}=sid`;
    assert.deepEqual(resolveProxyAuth(cookieHeader, 'dev'), {
      mode: 'cookie',
      bearer: 'jwt',
      sessionId: 'sid',
    });
    assert.deepEqual(resolveProxyAuth('other=1', 'dev'), {
      mode: 'dev-bearer',
      bearer: 'dev',
      sessionId: null,
    });
    assert.deepEqual(resolveProxyAuth(null, null), {
      mode: 'anonymous',
      bearer: null,
      sessionId: null,
    });
  });
});

describe('checkMutationDefense', () => {
  const mutation = (headers) =>
    request('https://app.example.test/api/pollux/api/generated/v2/amostra', {
      method: 'POST',
      headers,
    });
  const envArgs = { publicOrigin: ENV.publicOrigin, sessionSecret: SECRET };

  it('cookie mode requires Origin AND a valid CSRF token', async () => {
    const csrf = await computeCsrfToken('sid', SECRET);
    const auth = { mode: 'cookie', bearer: 'jwt', sessionId: 'sid' };

    // missing Origin
    assert.deepEqual(
      await checkMutationDefense(
        mutation({ 'X-CSRF-Token': csrf }),
        auth,
        envArgs
      ),
      { ok: false, reason: 'origin' }
    );
    // wrong Origin
    assert.deepEqual(
      await checkMutationDefense(
        mutation({ Origin: 'https://evil.test', 'X-CSRF-Token': csrf }),
        auth,
        envArgs
      ),
      { ok: false, reason: 'origin' }
    );
    // missing CSRF header
    assert.deepEqual(
      await checkMutationDefense(
        mutation({ Origin: ENV.publicOrigin }),
        auth,
        envArgs
      ),
      { ok: false, reason: 'csrf' }
    );
    // CSRF token bound to another session
    const otherCsrf = await computeCsrfToken('other-session', SECRET);
    assert.deepEqual(
      await checkMutationDefense(
        mutation({ Origin: ENV.publicOrigin, 'X-CSRF-Token': otherCsrf }),
        auth,
        envArgs
      ),
      { ok: false, reason: 'csrf' }
    );
    // no session cookie at all
    assert.deepEqual(
      await checkMutationDefense(
        mutation({ Origin: ENV.publicOrigin, 'X-CSRF-Token': csrf }),
        { ...auth, sessionId: null },
        envArgs
      ),
      { ok: false, reason: 'session' }
    );
    // fully bound
    assert.deepEqual(
      await checkMutationDefense(
        mutation({ Origin: ENV.publicOrigin, 'X-CSRF-Token': csrf }),
        auth,
        envArgs
      ),
      { ok: true }
    );
  });

  it('dev-bearer mode keeps the cheap same-origin check', async () => {
    const auth = { mode: 'dev-bearer', bearer: 'dev', sessionId: null };
    assert.deepEqual(await checkMutationDefense(mutation({}), auth, envArgs), {
      ok: true,
    });
    assert.deepEqual(
      await checkMutationDefense(
        mutation({ Origin: 'https://evil.test' }),
        auth,
        envArgs
      ),
      { ok: false, reason: 'origin' }
    );
    // POLLUX_PUBLIC_ORIGIN unset -> request origin is the reference.
    assert.deepEqual(
      await checkMutationDefense(
        mutation({ Origin: 'https://app.example.test' }),
        auth,
        { publicOrigin: null, sessionSecret: null }
      ),
      { ok: true }
    );
  });
});

describe('handleLogin', () => {
  it('seals the verifier + local returnTo and redirects with only the challenge', async () => {
    const response = await handleLogin(
      request(
        'https://app.example.test/api/pollux/auth/login?returnTo=%2Fmanager%2Famostras'
      ),
      ENV,
      { now: () => 1_000_000 }
    );
    assert.equal(response.status, 302);
    const location = new URL(response.headers.get('location'));
    assert.equal(location.origin, 'https://auth.example.test');
    assert.equal(location.pathname, '/api/pollux/authorize');
    assert.equal(location.searchParams.get('client_id'), ENV.clientId);
    assert.equal(
      location.searchParams.get('redirect_uri'),
      'https://app.example.test/api/pollux/auth/callback'
    );
    assert.equal(location.searchParams.get('code_challenge_method'), 'S256');
    assert.ok(location.searchParams.get('code_challenge'));
    const state = location.searchParams.get('state');
    assert.ok(state);
    // The URL never carries the verifier.
    assert.equal(location.searchParams.get('code_verifier'), null);

    const stateCookie = cookieByName(response, COOKIE_STATE);
    assert.match(stateCookie, /HttpOnly/);
    assert.match(
      stateCookie,
      new RegExp(`Path=${AUTH_BASE_PATH.replaceAll('/', '\\/')}`)
    );
    const sealed = cookieValue(stateCookie);
    const payload = await unsealState(sealed, SECRET, 1_000_000);
    assert.equal(payload.nonce, state);
    assert.equal(payload.returnTo, '/manager/amostras');
    const challenge = createHash('sha256')
      .update(payload.verifier)
      .digest('base64url');
    assert.equal(location.searchParams.get('code_challenge'), challenge);
  });

  it('replaces a non-local returnTo with /', async () => {
    const response = await handleLogin(
      request(
        'https://app.example.test/api/pollux/auth/login?returnTo=https%3A%2F%2Fevil.test%2F'
      ),
      ENV,
      { now: () => 1_000_000 }
    );
    const sealed = cookieValue(cookieByName(response, COOKIE_STATE));
    const payload = await unsealState(sealed, SECRET, 1_000_000);
    assert.equal(payload.returnTo, '/');
  });
});

/** Drive login first, then return a callback request wired to its cookie. */
const loginThenCallback = async ({
  now = () => 1_000_000,
  code = 'auth-code-1',
  stateOverride,
  callbackNow,
} = {}) => {
  const login = await handleLogin(
    request(
      'https://app.example.test/api/pollux/auth/login?returnTo=%2Fdepois'
    ),
    ENV,
    { now }
  );
  const location = new URL(login.headers.get('location'));
  const state = stateOverride ?? location.searchParams.get('state');
  const stateCookie = cookieValue(cookieByName(login, COOKIE_STATE));
  const callbackRequest = request(
    `https://app.example.test/api/pollux/auth/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`,
    { headers: { Cookie: `${COOKIE_STATE}=${stateCookie}` } }
  );
  return { callbackRequest, sealedState: stateCookie, now: callbackNow ?? now };
};

describe('handleCallback', () => {
  it('exchanges the code server-to-server and sets the full cookie set', async () => {
    const { callbackRequest, sealedState } = await loginThenCallback();
    const { impl, calls } = fetchStub(() => tokenResponse(GOOD_TOKENS));
    const response = await handleCallback(callbackRequest, ENV, {
      fetchImpl: impl,
      now: () => 1_010_000,
    });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), '/depois');

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://auth.example.test/api/pollux/token');
    const body = new URLSearchParams(calls[0].init.body);
    assert.equal(body.get('grant_type'), 'authorization_code');
    assert.equal(body.get('client_id'), ENV.clientId);
    assert.equal(body.get('client_secret'), ENV.clientSecret);
    assert.equal(body.get('code'), 'auth-code-1');
    assert.equal(
      body.get('redirect_uri'),
      'https://app.example.test/api/pollux/auth/callback'
    );
    const payload = await unsealState(sealedState, SECRET, 1_010_000);
    assert.equal(body.get('code_verifier'), payload.verifier);

    const access = cookieByName(response, COOKIE_ACCESS);
    assert.equal(cookieValue(access), GOOD_TOKENS.access_token);
    assert.match(access, /Path=\/api\/pollux;/);
    const refresh = cookieByName(response, COOKIE_REFRESH);
    assert.equal(cookieValue(refresh), GOOD_TOKENS.refresh_token);
    assert.match(refresh, /Path=\/api\/pollux\/auth;/);
    const session = cookieByName(response, COOKIE_SESSION);
    const csrf = cookieByName(response, COOKIE_CSRF);
    assert.doesNotMatch(csrf, /HttpOnly/);
    assert.equal(
      await verifyCsrfToken(cookieValue(csrf), cookieValue(session), SECRET),
      true
    );
    // State cookie cleared.
    assert.match(cookieByName(response, COOKIE_STATE), /Max-Age=0/);
  });

  it('rejects a state mismatch without calling the token endpoint', async () => {
    const { callbackRequest } = await loginThenCallback({
      stateOverride: 'forged-state',
    });
    const { impl, calls } = fetchStub(() => tokenResponse(GOOD_TOKENS));
    const response = await handleCallback(callbackRequest, ENV, {
      fetchImpl: impl,
      now: () => 1_010_000,
    });
    assert.equal(response.status, 400);
    assert.equal(calls.length, 0);
    const body = await response.json();
    assert.equal(body.ok, false);
    assert.equal(body.code, 'VALIDATION_FAILED');
  });

  it('rejects an expired state cookie (10-minute TTL)', async () => {
    const { callbackRequest } = await loginThenCallback();
    const { impl, calls } = fetchStub(() => tokenResponse(GOOD_TOKENS));
    const response = await handleCallback(callbackRequest, ENV, {
      fetchImpl: impl,
      now: () => 1_000_000 + STATE_TTL_MS + 1,
    });
    assert.equal(response.status, 400);
    assert.equal(calls.length, 0);
  });

  it('rejects a missing state cookie', async () => {
    const response = await handleCallback(
      request(
        'https://app.example.test/api/pollux/auth/callback?code=c&state=s'
      ),
      ENV,
      { fetchImpl: fetchStub(() => tokenResponse(GOOD_TOKENS)).impl }
    );
    assert.equal(response.status, 400);
  });

  it('maps a refused exchange to UNAUTHENTICATED and clears the state', async () => {
    const { callbackRequest } = await loginThenCallback();
    const { impl } = fetchStub(() =>
      tokenResponse({ error: 'invalid_grant' }, 400)
    );
    const response = await handleCallback(callbackRequest, ENV, {
      fetchImpl: impl,
      now: () => 1_010_000,
    });
    assert.equal(response.status, 401);
    const body = await response.json();
    assert.equal(body.code, 'UNAUTHENTICATED');
    assert.match(cookieByName(response, COOKIE_STATE), /Max-Age=0/);
  });
});

describe('handleRefresh', () => {
  const refreshRequest = async ({ csrf, cookies, origin } = {}) => {
    const sessionId = 'session-1';
    const token = csrf ?? (await computeCsrfToken(sessionId, SECRET));
    const cookieHeader =
      cookies ??
      `${COOKIE_SESSION}=${sessionId}; ${COOKIE_REFRESH}=refresh-old`;
    const headers = { Cookie: cookieHeader, 'X-CSRF-Token': token };
    if (origin !== null) headers.Origin = origin ?? ENV.publicOrigin;
    return request('https://app.example.test/api/pollux/auth/refresh', {
      method: 'POST',
      headers,
    });
  };

  it('rotates both token cookies through the refresh grant', async () => {
    const { impl, calls } = fetchStub(() =>
      tokenResponse({ ...GOOD_TOKENS, refresh_token: 'refresh-new' })
    );
    const response = await handleRefresh(await refreshRequest(), ENV, {
      fetchImpl: impl,
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
    const grant = new URLSearchParams(calls[0].init.body);
    assert.equal(grant.get('grant_type'), 'refresh_token');
    assert.equal(grant.get('refresh_token'), 'refresh-old');
    assert.equal(
      cookieValue(cookieByName(response, COOKIE_REFRESH)),
      'refresh-new'
    );
    assert.equal(
      cookieValue(cookieByName(response, COOKIE_ACCESS)),
      GOOD_TOKENS.access_token
    );
  });

  it('rejects a missing or mismatched CSRF token', async () => {
    const { impl, calls } = fetchStub(() => tokenResponse(GOOD_TOKENS));
    const forged = await handleRefresh(
      await refreshRequest({ csrf: 'forged' }),
      ENV,
      { fetchImpl: impl }
    );
    assert.equal(forged.status, 403);
    assert.equal(calls.length, 0);
  });

  it('rejects a cross-origin refresh', async () => {
    const response = await handleRefresh(
      await refreshRequest({ origin: 'https://evil.test' }),
      ENV,
      { fetchImpl: fetchStub(() => tokenResponse(GOOD_TOKENS)).impl }
    );
    assert.equal(response.status, 403);
  });

  it('clears every cookie when the grant is refused (family revoked)', async () => {
    const { impl } = fetchStub(() =>
      tokenResponse({ error: 'invalid_grant' }, 400)
    );
    const response = await handleRefresh(await refreshRequest(), ENV, {
      fetchImpl: impl,
    });
    assert.equal(response.status, 401);
    const cleared = setCookies(response);
    assert.equal(cleared.length, 5);
    for (const cookie of cleared) assert.match(cookie, /Max-Age=0/);
  });

  it('answers UNAUTHENTICATED without a refresh cookie', async () => {
    const sessionId = 'session-1';
    const csrf = await computeCsrfToken(sessionId, SECRET);
    const response = await handleRefresh(
      request('https://app.example.test/api/pollux/auth/refresh', {
        method: 'POST',
        headers: {
          Cookie: `${COOKIE_SESSION}=${sessionId}`,
          'X-CSRF-Token': csrf,
          Origin: ENV.publicOrigin,
        },
      }),
      ENV,
      { fetchImpl: fetchStub(() => tokenResponse(GOOD_TOKENS)).impl }
    );
    assert.equal(response.status, 401);
  });
});

describe('handleLogout', () => {
  it('revokes the family, clears cookies and redirects locally', async () => {
    const { impl, calls } = fetchStub(() => tokenResponse({ revoked: true }));
    const response = await handleLogout(
      request(
        'https://app.example.test/api/pollux/auth/logout?returnTo=%2Ftchau',
        {
          method: 'POST',
          headers: {
            Cookie: `${COOKIE_REFRESH}=refresh-1`,
            Origin: ENV.publicOrigin,
          },
        }
      ),
      ENV,
      { fetchImpl: impl }
    );
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), '/tchau');
    assert.equal(calls[0].url, 'https://auth.example.test/api/pollux/revoke');
    assert.equal(
      new URLSearchParams(calls[0].init.body).get('refresh_token'),
      'refresh-1'
    );
    for (const cookie of setCookies(response)) {
      assert.match(cookie, /Max-Age=0/);
    }
  });

  it('never redirects to a non-local target', async () => {
    const response = await handleLogout(
      request(
        'https://app.example.test/api/pollux/auth/logout?returnTo=https%3A%2F%2Fevil.test',
        { method: 'POST' }
      ),
      ENV,
      { fetchImpl: fetchStub(() => tokenResponse({ revoked: false })).impl }
    );
    assert.equal(response.headers.get('location'), '/');
  });
});

describe('handleAuthAction dispatcher', () => {
  it('404s unknown actions, 405s wrong methods, 503s when unconfigured', async () => {
    const unknown = await handleAuthAction(
      'whatever',
      request('https://app.example.test/api/pollux/auth/whatever'),
      ENV
    );
    assert.equal(unknown.status, 404);

    const wrongMethod = await handleAuthAction(
      'refresh',
      request('https://app.example.test/api/pollux/auth/refresh'),
      ENV
    );
    assert.equal(wrongMethod.status, 405);

    const unconfigured = await handleAuthAction(
      'login',
      request('https://app.example.test/api/pollux/auth/login'),
      null
    );
    assert.equal(unconfigured.status, 503);
    const body = await unconfigured.json();
    assert.equal(body.code, 'SERVICE_UNAVAILABLE');
  });
});

describe('constants', () => {
  it('keeps the path-scoping contract stable', () => {
    assert.equal(PROXY_BASE_PATH, '/api/pollux');
    assert.equal(AUTH_BASE_PATH, '/api/pollux/auth');
  });
});
