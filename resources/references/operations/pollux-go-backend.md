# Pollux Go backend — operations (v1 + v2)

The generated Go service (`generated/pollux-go`, Gin + Bun + pgx) is rendered
from `_templates/pollux/go-service` and `_templates/pollux/go-entity` by
`./pollux gen-backend --backend=go`. Never hand-edit the output — change the
templates and regenerate.

## Route surface

One process serves two contracts below `/api/generated`:

- **v1 — `/api/generated/v1/:entity`** (unchanged legacy contract):
  cookie-session auth, nested error envelope `{ok:false, error:{...}}`,
  bare-array `GET /` list, `POST /page`, `POST /bulk-delete`. Behavior is
  frozen; SPEC-003 explicitly keeps it byte/behavior compatible.
- **v2 — `/api/generated/v2/:entity`** (SPEC-003 standalone contract,
  normative fixture: `test-fixtures/pollux/api/contract.md` +
  `contract.json`): bearer auth, flat envelopes, paged list, strict queries,
  idempotent mutations.

### v2 endpoints

```text
GET    /api/generated/v2/:entity                 list          200
POST   /api/generated/v2/:entity                 create        201  (Idempotency-Key)
GET    /api/generated/v2/:entity/:id             read          200
PATCH  /api/generated/v2/:entity/:id             update        200  (Idempotency-Key)
DELETE /api/generated/v2/:entity/:id             delete        200  (Idempotency-Key)
GET    /api/generated/v2/:entity/capabilities    capabilities  200
```

- Success `{ok:true, data}`; errors are the FLAT envelope
  `{ok:false, code, message, requestId, retryable, fieldErrors?}` with the
  stable taxonomy (`UNAUTHENTICATED` 401, `FORBIDDEN` 403,
  `VALIDATION_FAILED` 400, `NOT_FOUND` 404, `CONFLICT`/`REFERENCE_CONFLICT`
  409, `STALE_WRITE` 412, `RATE_LIMITED` 429 retryable,
  `SERVICE_UNAVAILABLE` 503 retryable, `INTERNAL` 500).
- List queries are strict: `page` (≥1), `pageSize` (1..500, default 10),
  `sort` (JSON `[{"id","desc"}]`, declared sortable ids only), `q`
  (ILIKE across visible string/varchar/text columns), declared filters
  `f_<codeName>` / `f_<codeName>__<op>` with per-scalar operators from
  `contract.json`. Any unknown key/field/operator is `VALIDATION_FAILED`.
  List payload: `{rows, totalRows, page, pageSize, capabilities}`.
- Wire encoding: numeric = decimal-literal JSON **string**, date =
  `YYYY-MM-DD`, timestamp = ISO-8601 UTC, null stays null, empty numeric is
  rejected (never coerced to 0).
- Mutations are strict flat JSON: unknown fields →
  `fieldErrors[field]=["unknown_field"]`, server-managed/known-but-not-
  writable fields → `["not_writable"]`. `DELETE` returns
  `{id, deleted:true}`.
- `X-Request-Id` is echoed when it matches `[A-Za-z0-9._-]{1,128}`,
  generated otherwise; it is always on the response and inside error
  envelopes.
- Unknown entity codes under `/api/generated/v2/` return the `NOT_FOUND`
  envelope (engine `NoRoute` guard); all other unmatched paths keep Gin's
  default empty 404, so v1 is untouched.

### Known deviations from the fixture

- **`If-Match`/`ETag` (`STALE_WRITE`) is not implemented** — the current
  schema has no integer version column. The contract marks it optional; the
  contract suite gates it behind `features.ifMatch`. v1's
  `expectedUpdatedAt` optimistic concurrency remains available on v1.
- Body-hash canonicalization sorts object keys by Unicode code point (Go's
  `encoding/json` map ordering). This equals the contract's UTF-16
  code-unit order for every BMP key (all real field names).

## Authentication and authorization (fail closed)

- v1: forwards the incoming **session cookie** to
  `POLLUX_AUTH_BASE_URL` (`GET /api/auth/get-session`, grant-aware
  `POST /api/rest/authz/has-permission`).
- v2: extracts `Authorization: Bearer <token>` and forwards **that same
  token** to the same two endpoints. Grant precedence is resolved only by
  the TypeScript grant resolver; Go never infers permissions from metadata.
- Denial → `FORBIDDEN`; missing/invalid token → `UNAUTHENTICATED`; authz
  boundary outage → retryable `SERVICE_UNAVAILABLE` (never allow).
- `GET /:entity/capabilities` requires authentication only and resolves
  `{list, read, create, update, delete}` through the same boundary
  (`list` maps to the `read` action). An outage errors instead of guessing.
- Interim (pre-PKCE): the TypeScript app has no bearer-token plugin yet, so
  real bearer tokens are the SPEC-007 integration step of the SPEC-003 auth
  topology (PKCE token service + JWKS). Until then, live v2 calls fail
  closed with `UNAUTHENTICATED`/`SERVICE_UNAVAILABLE`. Unit/contract tests
  cover the boundary with fakes.

## Idempotency (`pollux_idempotency` table)

Every v2 POST/PATCH/DELETE requires `Idempotency-Key` (≤200 chars; missing
key is `VALIDATION_FAILED`).

- **Scope**: `(actor_id, client_id, method, path, idem_key)` — one composite
  UNIQUE constraint. Interim, `client_id` carries the bearer subject (actor
  id); post-PKCE the token's `azp` claim lands there (schema unchanged).
- **Mechanics**: in the SAME transaction as the mutation, the service
  inserts the record (`state=in_progress`, SHA-256 canonical body hash),
  performs the mutation + audit insert, then stores `state=complete`, the
  HTTP status and the exact response-envelope bytes. PostgreSQL's unique
  index serializes concurrent duplicates behind the first transaction, so
  the mutation never runs twice.
- **Replay** (same scope + body hash, completed): stored status/body
  verbatim + `Idempotency-Replayed: true`. **Different body**: `CONFLICT`,
  no mutation. **Concurrent in-progress**: bounded wait
  (`POLLUX_IDEMPOTENCY_WAIT_BOUND`), then replay or retryable
  `SERVICE_UNAVAILABLE`. A failed mutation rolls the record back, so a
  clean retry with the same key executes.
- **Expiry/cleanup**: completed records expire after
  `POLLUX_IDEMPOTENCY_RETENTION` (24h). A boot-started sweeper
  (`POLLUX_IDEMPOTENCY_CLEANUP_INTERVAL`, 1h) deletes only expired
  **completed** records; `in_progress` records are never deleted.
- **Schema**: the Go service owns the table and creates it on boot
  (`idempotency.EnsureSchema`, Bun `CREATE TABLE IF NOT EXISTS`); it is not
  part of the TypeScript Drizzle schema. Startup fails if creation fails.

```text
pollux_idempotency(id pk, actor_id, client_id, method, path, idem_key,
                   body_hash, state, http_status, response_body bytea,
                   created_at, expires_at,
                   UNIQUE (actor_id, client_id, method, path, idem_key))
```

## Environment

All v1 variables are unchanged (see `generated/pollux-go/README.md`). New:

| Variable | Default | Purpose |
| --- | --- | --- |
| `POLLUX_IDEMPOTENCY_RETENTION` | `24h` | completed-record expiry window |
| `POLLUX_IDEMPOTENCY_WAIT_BOUND` | `2s` | bounded wait on concurrent duplicates |
| `POLLUX_IDEMPOTENCY_CLEANUP_INTERVAL` | `1h` | expired-record sweep interval |

## Tests

```bash
./pollux gen-backend --backend=go     # regenerate after any template change
./pollux test --suite=go              # go test ./... + go vet (unit + contract, no DB)
./pollux test --suite=selection       # dispatch + TS immutability + byte-identical rerun

# PostgreSQL-gated integration tests (idempotency replay/conflict/concurrency/
# expiry + repository paging) — needs the repo's docker postgres on :5440:
cd generated/pollux-go && \
  POLLUX_TEST_DATABASE_URL=postgres://startui:startui@localhost:5440/startui \
  go test ./internal/idempotency/ ./internal/entity/fortestsonly/ -v
```

### Running the JS contract suite against a live Go service

The reusable SPEC-003 runtime suite
(`scripts/pollux/contract/contract.suite.mjs`) accepts a base URL and three
capability-tier bearer tokens. Against the Go backend the tokens must be
real Better Auth bearers accepted by the TypeScript app — which requires the
SPEC-003 PKCE/bearer token service (SPEC-007 integration step). The suite's
field-level scenarios also assume the fixture `amostra` model, so point it
at an entity with the equivalent fields (or the synthetic test entity):

```bash
# Prereqs: TS app on :3011 with bearer validation, Go service on :8091.
node --input-type=module -e '
import { createContractSuite } from "./scripts/pollux/contract/contract.suite.mjs";
const suite = createContractSuite({
  baseUrl: process.env.POLLUX_GO_URL ?? "http://localhost:8091",
  entity: process.env.POLLUX_CONTRACT_ENTITY ?? "fortestsonly",
  tokens: {
    admin: process.env.POLLUX_TOKEN_ADMIN,
    readonly: process.env.POLLUX_TOKEN_READONLY,
    none: process.env.POLLUX_TOKEN_NONE,
  },
  features: { ifMatch: false }, // no version column -> STALE_WRITE omitted
});
const report = await suite.run();
console.log(JSON.stringify(report, null, 2));
process.exit(report.failed > 0 ? 1 : 0);
'
```

Do not fake the tokens: the Go service forwards them to the TypeScript authz
boundary, and everything fails closed until that boundary validates bearers.

## Run locally

```bash
cd generated/pollux-go && POLLUX_PORT=8091 \
  POLLUX_DATABASE_URL=postgres://startui:startui@localhost:5440/startui \
  POLLUX_AUTH_BASE_URL=http://localhost:3011 go run ./cmd/api
```

`/healthz` (process), `/readyz` (bounded DB ping). Structured slog access
logs carry `requestId`, entity, action, operation, userId and counts — no
bodies, SQL or headers.
