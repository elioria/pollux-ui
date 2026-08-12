# Pollux target templates — `astro-react` (SPEC-006, EXPERIMENTAL)

Sources consumed by `scripts/pollux/targets/astro-react/adapter.mjs`. They are
NOT hygen templates: the adapter reads these files at plan time and performs
deterministic `__TOKEN__` substitution (values derived only from the frozen
`PolluxEntityModel`), so identical models always plan identical bytes.

Layout of one generated workspace (entity `amostra`, plural `amostras`):

```
src/pages/manager/amostras/index.astro        list page (Astro shell + island)
src/pages/manager/amostras/new.astro          create page
src/pages/manager/amostras/[id]/edit.astro    edit page
src/pages/api/pollux/[...path].ts             same-origin API proxy (shared)
src/pages/api/pollux/auth/[action].ts         fixed BFF auth endpoints (shared)
src/lib/pollux/server/bff-core.ts             framework-neutral BFF auth core (shared)
src/generated/pollux/amostra/spec.ts          EntitySpec + Row type projection
src/generated/pollux/amostra/island.tsx       hydrated CRUD island (list/create/edit)
src/generated/pollux/nav/amostra.ts           sidebar registry fragment
src/generated/pollux/registry/amostra.ts      proxy allowlist registry fragment
src/lib/pollux/runtime/*.ts                   verbatim copies of ../shared/runtime
src/components/pollux/*.tsx                   copies of ../shared/ui (import-rewritten)
```

Astro owns page/layout composition, page metadata (`<title>` via the skeleton
Layout) and a server-rendered loading/error shell; ALL interactive CRUD runs in
the React island, hydrated with `client:load` **only on the three CRUD pages**
— unrelated pages ship no generated CRUD JavaScript. The island owns URL
search-param synchronization (pushState/popstate) per the shared
`runtime/query.ts` contract; Astro frontmatter passes the server-validated
initial query state.

Shared files (`proxy`, auth stubs, `src/lib/pollux/**`, `src/components/
pollux/**`) are identical for every entity. The adapter records them as owned
by the FIRST entity that generates them and skips planning them while another
entity owns them; regenerating the owning entity refreshes them. Known
experimental limitation: `generate --all` over several entities in one
transaction plans the shared files once per entity from the same pre-state —
generate entities one at a time on this target.

Auth (SPEC-003 BFF flow): `/api/pollux/auth/{login,callback,refresh,logout}`
implement the PKCE authorization-code topology against the TypeScript
authorization host — sealed AES-GCM state cookie (nonce + PKCE verifier +
validated LOCAL returnTo, 10-min TTL, key HKDF-derived from
`POLLUX_SESSION_SECRET`), server-to-server code exchange with
`POLLUX_AUTH_CLIENT_SECRET`, HttpOnly SameSite=Lax path-scoped cookies
(access `Path=/api/pollux`, refresh `Path=/api/pollux/auth`) and a READABLE
`pollux_csrf` cookie (HMAC of the HttpOnly session id). The proxy forwards
the access-cookie bearer upstream; mutations in cookie mode REQUIRE an
Origin match against `POLLUX_PUBLIC_ORIGIN` plus a valid `X-CSRF-Token`; on
an expired token the island's shared client does ONE refresh then ONE retry
with the SAME Idempotency-Key. `POLLUX_DEV_BEARER` is an explicit DEV-ONLY
fallback used ONLY when set AND no access cookie is present; with the
`POLLUX_AUTH_*` env unset the auth endpoints answer 503. The proxy still
rejects any attempt to reach auth/authz upstream paths. Rate limiting on the
auth endpoints is delegated to the deployment platform (e.g. Cloudflare).

All user-facing Portuguese defaults come from the shared locale module
(`runtime/errors-pt.ts`); entity/field labels keep the source metadata text.
