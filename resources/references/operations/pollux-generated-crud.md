# Pollux generated CRUD — operations

Runtime: `src/server/generated-crud/` (authorization, validation, error
taxonomy, structured logs, durable audit). Every generated server function on
`/generated/*` and `/generated-server/*` goes through
`runGeneratedCrud({ entity, action, ... })`.

Authorization is two-layer since the grant resolver landed
(`src/server/permissions/grant-resolver.ts`): the code-defined better-auth
role ACL PLUS `pergrp`/`perusr` grant tables keyed by `res.code` = entity
name (admin role bypasses, `perusr.isDenied` hard-denies, grants are
additive otherwise). Grants are edited at `/manager/admin`; a 403 for a
non-admin user can therefore come from either missing role permissions or
missing/denied grants — check both `src/features/auth/permissions.ts` and
the `pergrp`/`perusr` rows for the user's groups. Live verification:
`node scripts/e2e-grants-live.mjs` (dev server :3011 + docker postgres).

## Log schema

One structured Pino event per operation, `scope: 'generated-crud'`:

| field | notes |
|---|---|
| `requestId` | UUID, echoed to the client in the safe error envelope |
| `entity` / `action` / `operation` | static template output (e.g. `act` / `read` / `page`) |
| `method` | GET or POST |
| `userId` | present after authentication |
| `durationMs`, `outcome`, `resultCount` | terminal `completed`/`failed` event |
| `errorCode` | public taxonomy code on failure |

Outcomes: `success`, `unauthenticated`, `forbidden`, `validation_failed`,
`conflict`, `not_found`, `stale_write`, `dependency_failed`, `internal_error`.

Data minimization: no form values, search terms, filter values, rows, SQL,
headers or secrets are ever logged. Bulk deletes log counts, not ID lists.

## Audit table

`generated_crud_audit` (append-only, application-level): one row per
successful write (`create`, `update`, `delete`, `bulk_delete`), inserted in
the same transaction as the mutation — audit failure rolls the write back.
`changed_fields` stores sorted field *names* only. No CRUD endpoint exists
for this table.

## Operational queries (pino JSON)

- Failures by entity/action/code: filter `scope=generated-crud outcome!=success`, group by `entity,action,errorCode`.
- p50/p95 latency: percentile over `durationMs` grouped by `entity,action`.
- Authorization denials by actor: `outcome IN (unauthenticated, forbidden)` grouped by `userId`.
- Stale-write rate: `outcome=stale_write` / total updates.
- Reference conflicts: `errorCode=REFERENCE_CONFLICT` grouped by `entity`.
- Write vs audit parity: count `outcome=success` for mutations vs rows in `generated_crud_audit` per window.

## Initial alert thresholds

- list/get slower than 750 ms → warn; mutation slower than 1000 ms → warn.
- `internal_error + dependency_failed` > 2% over 10 min (min 20 ops) → alert.
- One actor with > 20 authorization denials in 5 min → security alert.

## Error taxonomy (client-visible)

`UNAUTHENTICATED`, `FORBIDDEN`, `VALIDATION_FAILED`, `NOT_FOUND`, `CONFLICT`,
`REFERENCE_CONFLICT`, `STALE_WRITE`, `RATE_LIMITED`, `SERVICE_UNAVAILABLE`,
`INTERNAL`. Messages are safe Portuguese strings; database detail stays in
server logs, correlated by `requestId` (shown to users as `ref:` only for
`INTERNAL`/`SERVICE_UNAVAILABLE`).

## Generation workflow

1. `node scripts/pollux/validate-metadata.mjs` — runs automatically at the
   start of `./gen-all.sh` / `./gen-all-go.sh`; invalid metadata aborts before
   any file is written.
2. `./gen-all-go.sh` (or `./gen-all.sh`) — regenerates all valid entities.
3. `pnpm exec oxfmt "src/app/(private)/generated" src/routes/generated*.tsx`
4. `pnpm lint && pnpm test:ci src/server/generated-crud`

`generate-all-entity-pages.sh` is a deprecated alias that delegates to
`gen-all.sh`.

## Disabling one entity

Remove that entity's permission rows from the GEN block in
`src/features/auth/permissions.ts` admin role (server denies every operation
with `FORBIDDEN`) — the route stays reachable but renders 403 and returns no
data. Full removal: delete `src/routes/generated.<e>.tsx`,
`src/routes/generated-server.<e>.tsx` and `src/app/(private)/generated/<e>/`,
then restart dev.
