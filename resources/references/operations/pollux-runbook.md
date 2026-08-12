# Pollux generated CRUD — rollout & incident runbook (SPEC-008)

## Rollout model

The hardened contract shipped in one regeneration wave (commit `18c3d6d6`):
shared runtime + all 55 entities. Authorization is the effective enablement
switch — an entity is "enabled" only while its permission rows exist in the
admin role (`src/features/auth/permissions.ts` GEN block). The `user` role has
no generated-entity permissions, so exposure is admin-only by default.

Rollout gates (all currently green):

1. Metadata validation — `node scripts/pollux/validate-metadata.mjs` (55 valid, 2 stubs).
2. Regeneration drift — `./scripts/pollux/check-drift.sh` (regen must be byte-clean).
3. Contract suite — `pnpm test:ci src/server/generated-crud` (authorization matrix, error mapper, output drift gate).
4. `pnpm lint` (oxlint + tsc).
5. Manifest — `node scripts/pollux/build-manifest.mjs` regenerates
   `pollux-rollout-manifest.json` (per-entity metadata hash, template commit,
   entity count) and `pollux-rollout-inventory.md`. Commit both with every
   regeneration; the manifest is the rollback reference.

Batch enablement (if exposing beyond admin later): grant `read` first, watch
denial/latency dashboards for one window, then grant mutations per batch of
~10 entities. Never grant a mutation without `read`.

## Monitoring during rollout

Watch (queries in `pollux-generated-crud.md`):

- authorization denials (`outcome=unauthenticated|forbidden`) — spike means a
  route is exposed without permission or a client is retrying against 403;
- `validation_failed` rate — spike after regen means form/server contract drift;
- p95 `durationMs` per entity/action vs thresholds (750 ms read / 1000 ms write);
- `internal_error + dependency_failed` > 2% over 10 min → rollback candidate;
- audit parity: mutation success count == `generated_crud_audit` rows.

## Rollback

Rollback is a git operation, never a hand-edit of generated files:

1. `git revert <regen commit>` (or check out the previous manifest's
   `templateCommit` for `_templates/pollux` + generated paths) and redeploy.
2. The `generated_crud_audit` table is additive and backward-compatible —
   leave it in place; old code ignores it.
3. Re-run gates 1–4 on the reverted tree before deploy.

## Incidents

**Failed generation** — `gen-all(-go).sh` now prints per-entity diagnostics to
stderr and exits non-zero; metadata validation aborts before any file is
written. A failed entity leaves its previous committed output untouched —
restore any partial render with `git checkout -- "src/app/(private)/generated" src/routes`.

**Permission misconfiguration** — symptom: admin sees 403 or missing
buttons. Check the GEN block in `src/features/auth/permissions.ts` (both
`statement` and `admin` role); `pnpm test:ci src/server/generated-crud`
fails if the 55 entities and json-files drift apart. Sessions cache roles —
users must re-login after role changes.

**Dependency-delete failures** — `REFERENCE_CONFLICT` (SQLSTATE 23503) is an
expected user-facing outcome, logged at warn with constraint context
server-side. A spike usually means a UI offers deletion of referenced rows —
not an outage.

**Stale updates** — `STALE_WRITE` means concurrent editing; the dialog keeps
the user's values and refreshes the list. A sustained spike on one entity
suggests a batch job is rewriting rows while users edit.

**DB outage** — operations return `SERVICE_UNAVAILABLE` (retryable) with
request IDs; no partial writes are possible (single-transaction mutations,
audit included). Recover: restore Postgres (`pnpm dk:start`), no application
cleanup needed.

**Emergency disablement (one entity)** — remove the entity's rows from the
admin role GEN block and redeploy: every operation returns `FORBIDDEN`, the
route renders 403, data stops flowing; the rest of the manager is untouched.
Full removal: delete `src/routes/generated.<e>.tsx`,
`src/routes/generated-server.<e>.tsx`, `src/app/(private)/generated/<e>/`.

**Correlating a user report** — the toast shows `ref: <requestId>` for
unexpected failures; grep server logs for that `requestId` to get entity,
action, userId, duration and the original error object.
