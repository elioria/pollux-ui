# Pollux skeletons + multi-target generation — operations runbook

Operational procedures for the multi-skeleton workspace factory
(`./pollux new-workspace|plan|generate|check-generated`, SPEC-001..007).
Companion docs: `skeletons/README.md` (contracts, support matrix),
`docs/operations/pollux-generated-crud.md` and `pollux-runbook.md`
(legacy `/generated` pages inside this repo).

Support status at the time of writing: `start-ui-vite` is the supported
reference target; `nextjs`, `remix` (adapter `react-router`), `astro`
(adapter `astro-react`) and `tanstack-start` are **experimental**
(`generatorSupport.pollux: false`). Promotion is deferred until the Go v2 backend + PKCE/BFF auth land
and the target's CI matrix leg is green — never edit a manifest's support
flags by hand outside that change.

## 1. Failed workspace creation — cleanup

`new-workspace` is staged and atomic: files are copied into
`.pollux-staging-<destname>-<random>` in the destination's **parent**
directory, validated there, and only then renamed into place. On any failure
the command rolls back completely (staging removed, destination left exactly
as found).

If a machine crash or `kill -9` interrupts it:

1. The destination either does not exist, is the untouched pre-existing
   directory, or is a fully validated workspace — never a partial copy.
2. Look for leftover `.pollux-staging-*` directories in the destination's
   parent and delete them; they are inert copies:

   ```bash
   ls -d <parent>/.pollux-staging-* 2>/dev/null
   rm -rf <parent>/.pollux-staging-*
   ```

3. Re-run `./pollux new-workspace ...`. There is no `--force`: if the
   destination exists and is not empty (`DESTINATION_NOT_EMPTY`), inspect and
   remove it yourself first.

## 2. Interrupted or failed generation — transaction rollback

`generate` writes through a durable journal at
`.pollux/transactions/<id>/journal.json` inside the workspace: backups of
every replaced file are staged before the first change, and a commit record
is written last.

- **Normal path:** any error during publication auto-rolls back; the
  workspace is left byte-identical and the CLI reports the failure envelope.
- **Hard interrupt (power loss, SIGKILL):** the journal remains. The next
  mutating command (`generate`) runs recovery first — uncommitted journals
  are rolled back, committed ones completed — and reports
  `recovered: [...]` in `--json`. To inspect without mutating:

  ```bash
  ./pollux check-generated --workspace=<path>   # lists PENDING transaction ids, exit 1
  ./pollux generate --workspace=<path> --entity=<e>   # recovers, then regenerates
  ```

Never delete `.pollux/transactions/<id>/` by hand while it contains a
journal — that discards the backups recovery needs.

## 3. Generated-file conflicts

Two distinct conflicts, two codes:

- **`GENERATED_EDITED`** — a file owned by the generator (listed in
  `.pollux/generated.json`) was hand-edited. `plan` reports it under
  `editedOwned`; `generate` refuses. Either move your change into
  handwritten files (the skeletons keep clear handwritten hosts:
  registry/nav aggregators, shells) and regenerate, or accept the loss:

  ```bash
  ./pollux plan --workspace=<path> --entity=<e> --json   # see editedOwned
  ./pollux generate --workspace=<path> --entity=<e> --accept-generated-overwrite
  ```

  `--accept-generated-overwrite` overwrites ONLY generator-owned files; it
  never touches handwritten ones.

- **`OWNERSHIP_CONFLICT`** — a planned output path collides with an existing
  file the generator does not own (e.g. you created
  `app/routes/pollux/<plural>/index.tsx` by hand). Rename or remove the
  handwritten file; the generator will not take ownership of files it did
  not create.

Ongoing hygiene: `./pollux check-generated --workspace=<path>` in the
workspace's own CI catches drift early (exit 1 on edits, missing files or
pending journals; missing owned files are recreated on the next generate).

## 4. Version incompatibility and migration

Workspace provenance (`.pollux/workspace.json`) records
`metadataModelVersion`, `targetAdapter {id, version}` and `targetStatus`.
`plan`/`generate` verify them **before any write**:

| Symptom (code) | Meaning | Action |
|---|---|---|
| `PLAN_INVALID` — "workspace provenance records metadata model version 'X', generator requires 'Y'" | workspace was created by a different model generation | regenerate from a current skeleton, or migrate: create a fresh workspace with the current CLI, `generate --all`, port handwritten files over. Never edit `metadataModelVersion` by hand to silence the gate. |
| `TARGET_UNSUPPORTED` — "no generator adapter is registered for target 'X'" | provenance names an adapter this checkout does not ship | run from a checkout that ships the adapter, or recreate the workspace from a current skeleton |
| `TARGET_MISMATCH` | explicit `--target` disagrees with recorded provenance | omit `--target` |

Guarantee (tested by
`node --test scripts/pollux/test/version-compat.unit.spec.mjs`): rejection
happens before writes — no partial output, no `.pollux/generated.json`, no
leftover journal. Breaking schema/contract changes require a migration
command or a new major version; silently regenerating incompatible
workspaces is forbidden (SPEC-007).

## 5. Target rollback / removing a target from support

To demote or withdraw a target (e.g. a promoted target regresses):

1. Flip the skeleton manifest: `generatorSupport.pollux: false` (demotion to
   experimental) — or additionally remove the adapter module path from
   `PRODUCTION_ADAPTER_MODULES` (withdrawal). Update `skeletons/README.md`'s
   support matrix in the same change (docs must match manifests exactly).
2. CI: a demoted target's matrix leg stays in `pollux-matrix` (experimental
   legs are exercised, and `pollux-matrix-gate` still fails on a red leg); a
   withdrawn target's leg is removed from the matrix AND the gate comment is
   updated in the same commit.
3. **Existing workspaces are not corrupted:** provenance is data, not code.
   A workspace recorded as `experimental` keeps generating with any checkout
   that still ships its adapter; against a checkout that withdrew the
   adapter it fails cleanly with `TARGET_UNSUPPORTED` before writes. Never
   mass-edit `.pollux/workspace.json` files in user workspaces.
4. Generated files already in workspaces remain valid, buildable output —
   withdrawal only stops future regeneration.

## 6. Lockfile refresh procedure

Each boilerplate skeleton commits its own `pnpm-lock.yaml`; workspaces copy
it and install with `--frozen-lockfile`. After changing a skeleton's
`package.json` dependencies:

```bash
cd skeletons/<name>
pnpm install --lockfile-only --ignore-workspace
cd ../..
./pollux validate-skeletons
node scripts/pollux/test/workspace-matrix.mjs --target <name>   # full gate incl. install/build/smoke
```

Commit `package.json` + `pnpm-lock.yaml` together. Keep the `packageManager`
pin (`pnpm@10.24.0`) in `package.json` and `skeleton.json` in sync. The CI
matrix caches the **pnpm store** keyed on the skeleton lockfile — never
cache a generated workspace's `node_modules` or build output.

## 7. Verification commands (the executable truth)

```bash
# full per-target gate (empty temp dir -> create -> generate -> install ->
# typecheck/test/build -> no-source-dependency -> mock-API runtime smoke)
node scripts/pollux/test/workspace-matrix.mjs --target nextjs|remix|astro|tanstack-start [--keep]

# generated workspace has no dependency on this checkout (also run inside the matrix)
node scripts/pollux/test/no-source-dependency.mjs --workspace <path>

# version gates reject before writes
node --test scripts/pollux/test/version-compat.unit.spec.mjs

# unit layers (same globs as the CI pollux-unit job)
node --test "scripts/pollux/skeletons/*.unit.spec.mjs" \
  "scripts/pollux/model/*.unit.spec.mjs" \
  "scripts/pollux/targets/*.unit.spec.mjs" \
  "scripts/pollux/targets/*/adapter.unit.spec.mjs" \
  "scripts/pollux/contract/*.unit.spec.mjs" \
  "scripts/pollux/test/*.unit.spec.mjs"
```

CI jobs (`.github/workflows/code-quality.yml`): `pollux-unit`,
`pollux-matrix` (legs nextjs/remix/astro/tanstack-start, experimental targets),
`pollux-matrix-gate` (fails if any leg fails or is skipped). Deferred until
promotion: running the full shared API contract suite
(`scripts/pollux/contract/contract.suite.mjs`) against the real Go v2
backend instead of the mock, and flipping `generatorSupport.pollux` — both
land with the Go v2 + PKCE auth work.
