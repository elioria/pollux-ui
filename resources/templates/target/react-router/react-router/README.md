# Pollux React Router 7 target templates (SPEC-005, EXPERIMENTAL)

Sources for `scripts/pollux/targets/react-router/adapter.mjs` — the
`react-router` generator target that renders standalone CRUD verticals into
workspaces created from the `remix` skeleton (`skeletons/remix`, React Router 7
framework mode; the skeleton keeps its historical `remix` name as a
backward-compatible alias, the adapter id is `react-router`).

## Layout

```
workspace/
  api-proxy.ts            same-origin proxy resource route (app/routes/api.pollux.$.ts)
  auth-stub.ts            fixed BFF auth endpoints (app/routes/api.pollux.auth.ts)
  use-pollux-mutation.ts  fetcher->promise bridge hook (app/lib/pollux/use-pollux-mutation.ts)
  list.tsx.tpl            list route module   (app/routes/pollux/<plural>/index.tsx)
  new.tsx.tpl             create route module (app/routes/pollux/<plural>/new.tsx)
  edit.tsx.tpl            edit route module   (app/routes/pollux/<plural>/edit.tsx)
```

`.tpl` files use literal `__TOKEN__` replacement (`__ENTITY__`, `__PASCAL__`,
`__PLURAL__`, `__PK__`, `__SUBJECT_FIELD__`, `__TITLE_LIST_JSON__`) applied by
the adapter; everything else is copied verbatim. The SPEC-003 shared
runtime/ui templates (`../shared/`) are copied into
`app/lib/pollux/runtime/` and `app/components/pollux/` with a single
mechanical import rewrite — field semantics are never forked per framework.

## Registration model (why there is no aggregate generated registry file)

The ownership protocol (`scripts/pollux/targets/ownership.mjs`) records every
generated file under exactly ONE entity; a file whose content depended on the
full entity set could not be replanned by a second entity without an
`OWNERSHIP_CONFLICT`. Registration therefore uses per-entity fragments plus
handwritten aggregators that live in the skeleton:

- routes: `app/routes.ts` (handwritten) enumerates `app/routes/pollux/<plural>/`
  directories through `app/pollux-routes.mjs` (plain Node fs, deterministic
  sorted order) and spreads the result after its handwritten routes;
- sidebar: `app/root.tsx` (handwritten) collects
  `app/generated/pollux/nav/*.ts` fragments via `import.meta.glob`;
- proxy allowlist: `app/routes/api.pollux.$.ts` collects
  `app/generated/pollux/registry/*.ts` fragments via `import.meta.glob`.

With zero generated entities every aggregator yields an empty set, so the
fresh skeleton builds and typechecks unchanged.

## Shared-file ownership

Proxy/auth/runtime/ui files are identical for every entity and are owned by
the FIRST entity generated into a workspace; later entities skip planning them
while another entity owns them. EXPERIMENTAL limitation: `generate --all` over
several entities into a FRESH workspace plans every entity from the same empty
pre-state — generate entities one at a time on this target.

## Authentication (SPEC-003 BFF flow)

The fixed endpoints in `auth-stub.ts` (registered at
`api/pollux/auth/:action`) implement the SPEC-003 "Authentication topology"
against the TypeScript authorization host; ALL flow logic lives in the shared
framework-neutral core copied to `app/lib/pollux/bff-core.server.ts` (the
`.server` suffix keeps it out of client bundles):

- `GET  /api/pollux/auth/login?returnTo=<local-path>` — seals nonce + PKCE
  S256 verifier + validated LOCAL returnTo into an AES-GCM (HKDF from
  `POLLUX_SESSION_SECRET`) HttpOnly state cookie (10-min TTL) and redirects
  to `${POLLUX_AUTH_URL}/api/pollux/authorize` with only the derived
  challenge.
- `GET  /api/pollux/auth/callback` — verifies state cookie vs query state,
  exchanges code + verifier server-to-server with
  `POLLUX_AUTH_CLIENT_SECRET`, sets HttpOnly SameSite=Lax path-scoped
  cookies (access `Path=/api/pollux`, refresh + state
  `Path=/api/pollux/auth`, session `Path=/api/pollux`) plus the READABLE
  `pollux_csrf` cookie (HMAC of the session id), then redirects to the
  stored local returnTo.
- `POST /api/pollux/auth/refresh` — Origin + CSRF bound; ONE rotation of
  both token cookies via the refresh grant (upstream reuse detection revokes
  the family).
- `POST /api/pollux/auth/logout` — revokes the refresh family upstream,
  clears cookies, redirects to a local page.

The proxy reads the access token from the HttpOnly cookie; mutations in
cookie mode REQUIRE an `Origin` match against `POLLUX_PUBLIC_ORIGIN` and a
valid `X-CSRF-Token`. On an expired token the shared client performs ONE
`POST /api/pollux/auth/refresh` then retries once with the SAME
Idempotency-Key. `POLLUX_DEV_BEARER` remains an explicit DEV-ONLY fallback
used ONLY when set AND no access cookie is present (the offline matrix runs
in this mode). When the `POLLUX_AUTH_*`/`POLLUX_SESSION_SECRET` env is not
configured the auth endpoints answer 503.

KNOWN LIMITATION (cookie mode): React Router loaders/actions fetch the proxy
server-to-server, where the browser's path-scoped access cookie is not
available — SSR data and route-action mutations therefore only authenticate
in dev-bearer mode today. Browser-side calls through the shared client work
fully. Rate limiting on the auth endpoints is delegated to the deployment
platform.
