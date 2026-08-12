# Pollux shared standalone CRUD templates (SPEC-003)

Framework-neutral TypeScript sources that the SPEC-004..006 target adapters
(Next.js, React Router, Astro React-island) **copy verbatim** into generated
workspaces. They are plain `.ts`/`.tsx` files, not hygen `.ejs.t` templates:
nothing here is entity-specific — per-entity data arrives at generation time
as an `EntitySpec` projected from the normalized model
(`scripts/pollux/model/schema.mjs`).

These files are the single copy of field semantics: adapters must NOT fork
codec, envelope, query-state, or state-component behavior per framework.

Contract they implement: `test-fixtures/pollux/api/contract.{md,json}`
(v2.0.0), tested by `scripts/pollux/contract/contract.suite.mjs` against
`test-fixtures/pollux/api/mock-server.mjs`.

## Layout

```
runtime/
  api-types.ts   envelopes, error taxonomy, capabilities, EntitySpec/FieldSpec
  query.ts       URL-search-params-as-source-of-truth list state (+ transitions)
  client.ts      typed v2 fetch client (AbortSignal, error normalization,
                 newIdempotencyKey helper)
  codecs.ts      display/form codecs per normalized scalar type
  errors-pt.ts   generated locale module: ALL Portuguese default labels/messages
ui/
  data-table.tsx      DataTable: sortable headers + filter toolbar + pagination
  entity-form.tsx     EntityForm: create/edit form from FieldSpecs via codecs
  delete-confirm.tsx  DeleteConfirm: accessible alertdialog with retryable retry
  capability-gate.tsx CapabilityGate: presentation-only capability gate
  states.tsx          LoadingState, RefreshingIndicator, EmptyState,
                      ForbiddenState, UnauthenticatedState, ErrorState
```

Dependencies: `react` only. Styling is Tailwind v4 **semantic token classes**
(`bg-card`, `border-border`, `text-foreground`, `text-muted-foreground`,
`bg-primary`, `text-primary-foreground`, `border-input`, `bg-accent`,
`text-destructive`, `outline-ring`); the consuming skeleton must define these
tokens per the shared design-token contract.

## What each adapter must inject

The shared code imports **no router, no TanStack, no next/**. The adapter
provides, per generated entity page:

| injection | where | contract |
| --- | --- | --- |
| URL state read/write | `DataTable.query` / `onQueryChange` | Parse `ListQueryState` from the current URL with `parseListQuery`; `onQueryChange` must write `stringifyListQuery(next)` back to the URL (push/replace) and let the framework re-load. URL search params are the single source of truth — copied/reloaded URLs render the same list. |
| Link component / navigation | `toolbarActions`, `renderRowActions`, `EntityForm.onCancel`, `UnauthenticatedState.onLogin` | Adapter renders its own `<Link>` (or `navigate` callback) inside these slots. |
| Form action wrapper | `EntityForm.onSubmit`, `DeleteConfirm.onConfirm` | Wraps the framework's mutation primitive (server action, fetcher, island handler) around `client.create/update/remove`. It generates ONE `newIdempotencyKey()` per logical submission and reuses it across retries; resolves `null` on success or the safe `ApiErrorShape` on failure. |
| Data fetching | route loader / server component | Calls `createEntityClient(spec, {...})` (or the BFF proxy directly server-side) and passes rows/totalRows/capabilities down. Pass an `AbortSignal` so stale navigations cancel. |
| Auth boundary | BFF proxy + `runtime/bff-core.ts` | Browser code never sees tokens; `client.ts` talks to the adapter's same-origin proxy with `bffAuth: true` (CSRF header on mutations from the readable `pollux_csrf` cookie, ONE refresh-then-retry on `UNAUTHENTICATED` reusing the same Idempotency-Key). The adapter copies `bff-core.ts` into a server-only location and wraps its `handleAuthAction` dispatcher in thin framework routes. |

## SPEC-003 states — which component covers what

| SPEC-003 state | component |
| --- | --- |
| initial loading | `LoadingState` (`role="status"`, `aria-busy`) |
| background refresh | `RefreshingIndicator` (data stays visible) |
| empty result | `EmptyState` (distinct message when filters are active) |
| forbidden | `ForbiddenState` (`role="alert"`), plus `CapabilityGate` for hidden controls |
| unauthenticated | `UnauthenticatedState` with injected login navigation |
| field validation | `EntityForm` — client codec errors and server `fieldErrors` share the same `aria-describedby` slots |
| optimistic conflict / stale write | `EntityForm` renders the `STALE_WRITE`/`CONFLICT` envelope while **preserving user input**; `client.update` forwards `If-Match` |
| retryable outage | `ErrorState` / `DeleteConfirm` show a retry action only when `retryable: true`; retry reuses the same idempotency key so no duplicate mutation |
| success | adapter navigates/refreshes; `uiLabels.created/updated/deleted` provide the default toasts |

## Behavior guarantees

- Wire values are preserved; formatting happens only at the presentation
  boundary (`codecs.ts`). `numeric` stays a decimal-literal string.
- Empty numeric inputs map to `null`, never `0` and never `''`.
- All default labels/messages are Portuguese and live only in `errors-pt.ts`;
  entity/field labels keep the source metadata text.
- Capabilities only hide controls; the API is authoritative and the client
  never sends a mutation for a disallowed action.

## Authentication (SPEC-003 BFF flow — implemented)

`runtime/bff-core.ts` is the framework-neutral, WebCrypto-only (Node AND
workers) auth core every target copies into a server-only location:

- PKCE S256 pair generation; sealed state cookie (AES-256-GCM over
  nonce + verifier + validated LOCAL returnTo + issued-at, key derived from
  `POLLUX_SESSION_SECRET` via HKDF-SHA-256, 10-minute TTL);
- server-to-server token exchange / refresh / revoke against
  `${POLLUX_AUTH_URL}/api/pollux/{token,revoke}` carrying
  `POLLUX_AUTH_CLIENT_ID` + `POLLUX_AUTH_CLIENT_SECRET`;
- HttpOnly Secure SameSite=Lax path-scoped cookies: access + session
  `Path=/api/pollux` (BFF proxy only), refresh + state
  `Path=/api/pollux/auth`; the READABLE `pollux_csrf` cookie carries
  HMAC-SHA-256(sessionId) and is worthless without the HttpOnly session
  cookie (double-submit with server-side binding);
- proxy helpers: `resolveProxyAuth` (access cookie ▸ DEV-ONLY
  `POLLUX_DEV_BEARER` fallback ▸ anonymous) and `checkMutationDefense`
  (Origin match against `POLLUX_PUBLIC_ORIGIN` + CSRF in cookie mode);
- the `handleAuthAction` dispatcher for the fixed
  login/callback/refresh/logout endpoints (503 when the env is not
  configured).

Negative-path tests: `scripts/pollux/targets/bff-core.unit.spec.mjs` (Node
loads the TS file directly via built-in type stripping — keep the module
dependency-free with erasable syntax only). Rate limiting on the auth
endpoints is delegated to the deployment platform. The mock server's bearer
tokens are capability-tier test doubles only.

### Live end-to-end against the real authorization host (manual)

The offline matrix exercises the dev-bearer mode and the unconfigured-auth
503 path; a full interactive login needs the TypeScript app running with the
authorization host enabled. Exact procedure:

```bash
# 1. authorization host (this repo), with a registered workspace client:
POLLUX_AUTH_CLIENTS='[{"clientId":"workspace-dev","clientSecret":"dev-secret-change-me","callbackUrls":["http://localhost:4310/api/pollux/auth/callback"]}]' \
POLLUX_AUTH_ISSUER=http://localhost:3000 \
POLLUX_AUTH_AUDIENCE=pollux-standalone-api \
POLLUX_AUTH_SIGNING_KEY="$(openssl ecparam -genkey -name prime256v1 -noout | openssl pkcs8 -topk8 -nocrypt)" \
pnpm dev

# 2. generated workspace (any target), pointing at it:
POLLUX_API_URL=http://localhost:8091 \
POLLUX_AUTH_URL=http://localhost:3000 \
POLLUX_AUTH_CLIENT_ID=workspace-dev \
POLLUX_AUTH_CLIENT_SECRET=dev-secret-change-me \
POLLUX_SESSION_SECRET="$(openssl rand -base64 32)" \
POLLUX_PUBLIC_ORIGIN=http://localhost:4310 \
PORT=4310 pnpm start          # (astro: astro dev --port 4310)

# 3. browser: http://localhost:4310/api/pollux/auth/login?returnTo=/manager/<plural>
#    -> Better Auth login on :3000 -> callback sets the cookie set ->
#    the list page's proxied calls now carry the cookie bearer
#    (unset POLLUX_DEV_BEARER to prove it).
```
