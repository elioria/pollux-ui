// SPEC-006 fixed BFF auth endpoints — Astro server endpoint. Thin wrapper:
// the whole SPEC-003 "Authentication topology" flow lives in the
// framework-neutral core (src/lib/pollux/server/bff-core.ts):
//
//   GET  /api/pollux/auth/login?returnTo=<local-path>   sealed PKCE state
//        cookie + redirect to ${POLLUX_AUTH_URL}/api/pollux/authorize;
//   GET  /api/pollux/auth/callback   state verification + server-to-server
//        code exchange (POLLUX_AUTH_CLIENT_SECRET stays server-side) + the
//        HttpOnly access/refresh/session cookies and readable CSRF cookie;
//   POST /api/pollux/auth/refresh    Origin+CSRF bound single rotation;
//   POST /api/pollux/auth/logout     upstream family revocation + cookie
//        clearing + local redirect.
//
// When POLLUX_AUTH_* / POLLUX_SESSION_SECRET are not configured every
// endpoint answers 503 and the workspace stays in the explicit DEV-ONLY
// POLLUX_DEV_BEARER mode (see the API proxy).
import type { APIRoute } from 'astro';

import {
  handleAuthAction,
  resolveBffEnv,
} from '../../../../lib/pollux/server/bff-core';

export const prerender = false;

const envSources = (locals: unknown): Array<Record<string, unknown>> => {
  const sources: Array<Record<string, unknown>> = [];
  // Cloudflare Workers: bindings/secrets via Astro.locals.runtime.env.
  const runtimeEnv = (
    locals as { runtime?: { env?: Record<string, unknown> } } | undefined
  )?.runtime?.env;
  if (runtimeEnv) sources.push(runtimeEnv);
  // astro dev / node: .env files via import.meta.env (server-only, no PUBLIC_).
  sources.push(import.meta.env as unknown as Record<string, unknown>);
  // astro dev with shell-provided vars.
  const processEnv = (
    globalThis as {
      process?: { env?: Record<string, string | undefined> };
    }
  ).process?.env;
  if (processEnv) sources.push(processEnv as Record<string, unknown>);
  return sources;
};

const envValue = (locals: unknown, key: string): string | undefined => {
  for (const source of envSources(locals)) {
    const value = source[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return undefined;
};

export const ALL: APIRoute = ({ params, request, locals }) =>
  handleAuthAction(
    params.action ?? '',
    request,
    resolveBffEnv((key) => envValue(locals, key))
  );
