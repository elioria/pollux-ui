# Pollux Next.js target templates (SPEC-004)

Sources for the `nextjs` target adapter
(`scripts/pollux/targets/nextjs/adapter.mjs`, adapter version 0.1.0,
capability level `standalone-crud`, EXPERIMENTAL until the SPEC-007 matrix).

Mechanism (EJS-free, deterministic):

- `static/**` — pre-formatted TypeScript copied verbatim into the workspace
  (paths under `static/` map 1:1, except `app/api/pollux/proxy-route.ts` →
  `app/api/pollux/[...path]/route.ts` and `auth-route.ts` →
  `app/api/pollux/auth/[[...path]]/route.ts`).
- `../shared/runtime/*` — SPEC-003 shared runtime, copied verbatim to
  `lib/pollux/runtime/` (except `bff-core.ts`, the framework-neutral BFF
  auth core, which lands in the server-only tree at
  `lib/pollux/server/bff-core.ts`).
- `../shared/ui/*` — SPEC-003 shared UI, copied to `components/pollux/` with
  two deterministic transforms: prepend `'use client';` and rewrite
  `../runtime/` imports to `@/lib/pollux/runtime/`.
- `entity-templates.mjs` — per-entity string templates (routes under
  `app/(pollux)/manager/<plural>/`, the entity spec module, and the
  `lib/pollux/registry/<entity>.json` sidebar/proxy registry fragment). All
  metadata text is interpolated through `JSON.stringify`.

Workspace-level (`static/` + shared) files are planned when absent or already
owned by the generating entity; files owned by another generated entity are
left to their owner, and a collision with a handwritten file is a plan-time
`OWNERSHIP_CONFLICT`. The handwritten shell (`components/sidebar.tsx`,
`components/pollux-nav.tsx`, `lib/pollux/registry.ts` in the skeleton) reads
the per-entity registry fragments at request time, so regeneration replaces
only fragments and never edits handwritten files.

The adapter's `format` stage is a documented no-op: the templates are kept
pre-formatted (the skeleton ships no formatter, and the protocol requires
formatting to be a fixpoint of the planned hashes). `verify` performs
deterministic offline structural checks (non-empty staged files, ownership
headers, cross-framework import ban) and only attempts `tsc --noEmit` when a
staged `node_modules` exists (it never does under the standard pipeline).

Authentication (SPEC-003 BFF flow): `app/api/pollux/auth/[[...path]]/route.ts`
wraps the shared core's `handleAuthAction` — sealed PKCE state cookie on
`login`, state verification + server-to-server code exchange
(`POLLUX_AUTH_CLIENT_SECRET` stays behind `server-only`) + HttpOnly
path-scoped access/refresh/session cookies and the readable `pollux_csrf`
cookie on `callback`, Origin+CSRF-bound rotation on `refresh`, upstream
family revocation on `logout`. The proxy forwards the access-cookie bearer;
mutations in cookie mode REQUIRE an Origin match against
`POLLUX_PUBLIC_ORIGIN` plus a valid `X-CSRF-Token`; the client components
(`bffAuth: true`) do ONE refresh then ONE retry with the same
Idempotency-Key on an expired token. `POLLUX_DEV_BEARER` is an explicit
DEV-ONLY fallback used ONLY when set AND no access cookie is present; with
the `POLLUX_AUTH_*` env unset the auth endpoints answer 503.

KNOWN LIMITATION (cookie mode): Server Components fetch upstream directly
(`lib/pollux/server/data.ts`) where the browser's path-scoped access cookie
is not available — SSR initial data authenticates only in dev-bearer mode
today; the client components re-fetch through the proxy and work fully.

Golden output: `test-fixtures/pollux/golden/nextjs/` (regenerate with
`node scripts/pollux/targets/nextjs/update-golden.mjs`).
