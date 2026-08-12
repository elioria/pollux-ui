// SPEC-004 Next.js adapter — fixed BFF auth endpoints (SPEC-003
// "Authentication topology"). Thin wrapper: the whole flow lives in the
// framework-neutral core (lib/pollux/server/bff-core):
//
//   GET  /api/pollux/auth/login?returnTo=<local-path>
//        seal nonce + PKCE verifier + validated local returnTo into an
//        AEAD HttpOnly state cookie, redirect to
//        ${POLLUX_AUTH_URL}/api/pollux/authorize with the S256 challenge;
//   GET  /api/pollux/auth/callback
//        verify state cookie vs query state, exchange code + verifier
//        server-to-server (POLLUX_AUTH_CLIENT_SECRET never leaves the
//        server), set HttpOnly Secure SameSite=Lax path-scoped
//        access/refresh/session cookies + the readable CSRF cookie,
//        redirect to the stored LOCAL returnTo;
//   POST /api/pollux/auth/refresh
//        Origin + CSRF bound; rotate both token cookies once;
//   POST /api/pollux/auth/logout
//        revoke the refresh family upstream, clear cookies, local redirect.
//
// When the POLLUX_AUTH_* / POLLUX_SESSION_SECRET env is not configured every
// endpoint answers 503 and the workspace stays in the explicit DEV-ONLY
// POLLUX_DEV_BEARER mode (see the API proxy).
import 'server-only';

import { handleAuthAction, resolveBffEnv } from '@/lib/pollux/server/bff-core';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ path?: string[] }> };

async function dispatch(request: Request, context: RouteContext) {
  const { path } = await context.params;
  const segments = path ?? [];
  const action = segments.length === 1 ? (segments[0] ?? '') : '';
  const env = resolveBffEnv((key) => process.env[key]);
  return handleAuthAction(action, request, env);
}

export async function GET(request: Request, context: RouteContext) {
  return dispatch(request, context);
}
export async function POST(request: Request, context: RouteContext) {
  return dispatch(request, context);
}
