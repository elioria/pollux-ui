# Pollux standalone API contract — v2 (fixture)

Contract version: **2.0.0** (`contract.json` is the machine-readable half; this
document is normative prose). This is the SPEC-003 external contract consumed by
the standalone Next.js / React Router / Astro adapters (SPEC-004..006) and
served — in a later phase — by the generated Go v2 backend. It is versioned
independently from the metadata model (`modelVersion "1"`), and it is additive:
the shipped `/api/generated/v1` routes remain untouched.

Deferred to the next phase (NOT covered by this fixture): the Better-Auth/PKCE
BFF login topology, proxy hardening (CSRF, header allowlists, byte limits), and
the Go v2 implementation. The mock server's bearer tokens are test doubles for
capability tiers, not real access tokens.

## Endpoints

```text
GET    /api/generated/v2/:entity                 list          200
POST   /api/generated/v2/:entity                 create        201  (Idempotency-Key required)
GET    /api/generated/v2/:entity/:id             read          200
PATCH  /api/generated/v2/:entity/:id             update        200  (Idempotency-Key required)
DELETE /api/generated/v2/:entity/:id             delete        200  (Idempotency-Key required)
GET    /api/generated/v2/:entity/capabilities    capabilities  200
```

`:entity` is a registered entity code (safe identifier). An unknown entity is
`NOT_FOUND`. All endpoints require `Authorization: Bearer <token>`; a missing or
invalid token yields the `UNAUTHENTICATED` envelope — the API always fails
closed.

## Envelopes

Success responses use the `CrudResult`-style discriminated envelope:

```jsonc
{ "ok": true, "data": { /* payload */ } }
```

Error responses (any non-2xx) use exactly:

```jsonc
{
  "ok": false,
  "code": "VALIDATION_FAILED",       // stable taxonomy, below
  "message": "safe Portuguese text", // never SQL/stack/upstream detail
  "requestId": "…",                  // echoed or generated, see headers
  "retryable": false,
  "fieldErrors": { "titulo": ["required"] } // only when field-mappable
}
```

### Error taxonomy (stable)

| code | HTTP | retryable |
| --- | --- | --- |
| `UNAUTHENTICATED` | 401 | no |
| `FORBIDDEN` | 403 | no |
| `VALIDATION_FAILED` | 400 | no |
| `NOT_FOUND` | 404 | no |
| `CONFLICT` | 409 | no |
| `REFERENCE_CONFLICT` | 409 | no |
| `STALE_WRITE` | 412 | no |
| `RATE_LIMITED` | 429 | yes |
| `SERVICE_UNAVAILABLE` | 503 | yes |
| `INTERNAL` | 500 | no |

Retryability is explicit in the envelope; clients must not infer it from the
HTTP status.

## List requests

Query parameters are **strict**: any key outside the set below (or outside the
entity's declared filterable fields) is `VALIDATION_FAILED`.

- `page` — integer ≥ 1, default 1. A page past the last returns empty `rows`
  with an accurate `totalRows` (not an error).
- `pageSize` — integer within 1..500 (and further bounded by the entity's
  declared page sizes on real backends); out of bounds is `VALIDATION_FAILED`.
  Default: the model's `defaultPageSize`.
- `sort` — JSON array `[{"id": "<codeName>", "desc": bool}, …]`; ids must be
  declared sortable. Malformed JSON or unknown/unsortable id is
  `VALIDATION_FAILED`. Default: the model's `defaultSort`.
- `q` — case-insensitive substring search across the entity's visible
  string/varchar/text columns.
- Declared filters — one key per field: `f_<codeName>` (default operator:
  `contains` for the string family, `eq` otherwise) or explicit
  `f_<codeName>__<op>` where `<op>` comes from the model's per-scalar operator
  table (`eq`, `contains`, `gt`, `gte`, `lt`, `lte`). Unknown field or operator
  not allowed for that scalar is `VALIDATION_FAILED`.

List payload:

```jsonc
{
  "rows": [ /* canonical records */ ],
  "totalRows": 42,
  "page": 1,
  "pageSize": 10,
  "capabilities": { "list": true, "read": true, "create": false, "update": false, "delete": false }
}
```

`capabilities` are the caller's **effective** capabilities for the entity — the
same values the capabilities endpoint returns. The client uses them only to
hide controls; the server re-checks every call.

## Wire encoding (canonical records)

Records carry every model field keyed by `codeName`. Wire values are preserved
end-to-end; formatting happens only at the presentation boundary.

| scalar | wire |
| --- | --- |
| `uuid`, `string`, `varchar`, `text` | JSON string |
| `boolean` | JSON boolean |
| `integer` | JSON number (integral) |
| `float` | JSON number |
| `numeric` | **JSON string** decimal literal (precision preserved, e.g. `"1234.50"`) |
| `date` | `"YYYY-MM-DD"` |
| `time` | `"HH:MM:SS"` |
| `timestamp` | ISO-8601 UTC string |

Nullable fields transmit JSON `null`. An empty numeric input is **null, never
0** — the server rejects `""` for numeric/integer/float fields with
`VALIDATION_FAILED`; clients must send `null` (the shared codecs do this).
Labels and text values preserve source bytes (accented Portuguese round-trips
unchanged).

## Mutations

- Strict JSON (`Content-Type: application/json`). A non-JSON body is
  `VALIDATION_FAILED`.
- **Unknown fields are rejected** (`VALIDATION_FAILED`, with
  `fieldErrors[<field>] = ["unknown_field"]`), as are fields not writable for
  the operation per model mutability (`none` / `createOnly` / `updateOnly`).
- Type and rule validation errors map to `fieldErrors` keyed by `codeName`.
- `POST` returns the canonical created record (201). `PATCH` returns the
  canonical updated record (200). `DELETE` returns
  `{ "id": "<id>", "deleted": true }` (200).
- `PATCH` may carry `If-Match: <version>` (from the record's `ETag`); a
  mismatch is `STALE_WRITE` with no mutation.
- Deleting a record referenced elsewhere is `REFERENCE_CONFLICT` with no
  deletion.

## Idempotency (`Idempotency-Key`)

Every `POST`, `PATCH`, and `DELETE` requires an `Idempotency-Key` header,
generated **once** by the BFF for the user's logical submission and reused
across refresh/retry. A missing key is `VALIDATION_FAILED`.

- **Scope**: `(actorId, clientId, method, canonicalPath, key)`.
- On first use, the server atomically records `in_progress` plus a SHA-256 hash
  of the canonical request body (object keys sorted by UTF-16 code units; an
  absent body hashes the empty string), performs the mutation in the same
  transaction, then stores `complete` with the HTTP status and the exact safe
  response envelope.
- **Replay** — same scope and same body hash against a `complete` record:
  the stored status and body are returned verbatim with header
  `Idempotency-Replayed: true`. No second mutation occurs.
- **Different body** — same scope, different body hash: `CONFLICT` (409),
  no mutation.
- **Concurrent duplicate** — same scope while `in_progress`: the duplicate
  waits a bounded interval, then replays the completed response, or returns
  retryable `SERVICE_UNAVAILABLE` if the original has not completed. The
  mutation is never executed concurrently.
- **Expiry**: completed records expire after 24 hours; cleanup may delete only
  expired `complete` records, never live `in_progress` records.

## Headers

| header | direction | semantics |
| --- | --- | --- |
| `Authorization` | request | `Bearer <token>`, required everywhere |
| `Idempotency-Key` | request | required on POST/PATCH/DELETE |
| `If-Match` | request | optional optimistic-concurrency guard on PATCH |
| `X-Request-Id` | both | echoed when present (sanitized to `[A-Za-z0-9._-]{1,128}`), generated otherwise; always on the response and in error envelopes |
| `ETag` | response | record version on read/create/update |
| `Idempotency-Replayed` | response | `true` only on idempotent replays |

## Capabilities

`GET /api/generated/v2/:entity/capabilities` requires authentication only and
returns the caller's effective per-operation capabilities:

```jsonc
{ "ok": true, "data": { "list": true, "read": true, "create": true, "update": false, "delete": false } }
```

The capabilities payload must **agree with enforcement**: an operation reported
`false` is rejected with `FORBIDDEN` when attempted, and one reported `true` is
never rejected with `FORBIDDEN` for that actor at the same instant. On real
backends the values resolve through the TypeScript
`POST /api/rest/authz/has-permission` boundary (grant resolver stays the single
source of truth); capabilities are never inferred from metadata.
