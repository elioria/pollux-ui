// SPEC-008 fixed BFF auth endpoints — TanStack Start server route
// (src/routes/api/pollux/auth.$action.ts, path `/api/pollux/auth/$action`).
// Thin wrapper: the whole SPEC-003 "Authentication topology" flow lives in
// the framework-neutral core (src/lib/pollux/bff-core.server.ts):
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
import { createFileRoute } from '@tanstack/react-router';
// Type-only: loads @tanstack/react-start's module augmentation that adds the
// `server.handlers` route option (erased at runtime, so nothing server-only
// can leak through it).
import type {} from '@tanstack/react-start';

import {
  handleAuthAction,
  resolveBffEnv,
} from '../../../lib/pollux/bff-core.server';

const dispatch = ({
  request,
  params,
}: {
  request: Request;
  params: Record<string, string | undefined>;
}) =>
  handleAuthAction(
    params.action ?? '',
    request,
    resolveBffEnv((key) => process.env[key])
  );

export const Route = createFileRoute('/api/pollux/auth/$action')({
  server: {
    handlers: {
      GET: dispatch,
      POST: dispatch,
    },
  },
});
