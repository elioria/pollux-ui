# pollux-ui — step-by-step user guide

Everything the plugin can do, in the order you'd learn it. Install first
(see [INSTALL.md](./INSTALL.md) — no cloning needed for Claude Code), then
work through the steps below. Each step shows what to *ask the agent* (the
skills trigger from natural language) and, where useful, the underlying CLI
command so you can see what runs.

## 0. Concepts (read once)

- **The plugin is a workflow layer, not the generator.** The generator lives
  in the start-ui-web repository (`./pollux` CLI). The plugin packages the
  templates, design tokens, references, and six guarded skills that drive
  that CLI safely.
- **Two kinds of generation:**
  - *In-repo* — inside the start-ui-web checkout itself: `/manager` verticals,
    legacy-style `/generated` pages, and a standalone Go backend.
  - *Standalone* — a fresh app of its own (Next.js, Remix/React Router,
    Astro, or TanStack Start) that talks to a Pollux backend over the
    external `/api/generated/v2` REST contract. Created from a **skeleton**,
    filled by a **target adapter**.
- **Support status:** `start-ui-vite` (the repo itself) is *supported*; all
  four standalone targets are *experimental* — generation works and is fully
  gated by CI, but promotion waits on the production v2 backend.
- **Safety model:** every generated file carries an ownership header and is
  recorded in `.pollux/generated.json`. Generation is journaled and
  all-or-nothing; hand-edited generated files are refused unless you
  explicitly accept the overwrite. Handwritten files are never touched.

## 1. Session setup

Two ways to run; the skills auto-detect which one you are in:

- **Empty folder (no source repo):** just install the plugin and start a
  session anywhere — skills use the bundled `generator/` snapshot inside
  the installed plugin (standalone surface: workspaces, entity authoring,
  generation, mock API). See "Zero-to-app" in INSTALL.md.
- **Full checkout:** open the session inside start-ui-web for the complete
  surface (in-repo /manager, /generated pages, Go backend):

```bash
cd ~/projects/start-ui-web   # your checkout
pnpm install                 # once
claude                       # or your host of choice
```

Sanity check — ask:

> "Run the pollux doctor and tell me if this checkout is generator-ready."

(`pollux-inspect` → `./pollux doctor --json`.)

## 2. Discover what exists (`pollux-inspect`)

Read-only; safe to ask anything:

> "List all Pollux entities and tell me which have valid metadata."
> "Describe the entity `act` — fields, grid config, validation."
> "Which skeletons are registered and what's their support status?"
> "Describe the tanstack-start skeleton."

Underlying commands: `./pollux list-entities --json`,
`./pollux describe <entity> --json`, `./pollux list-skeletons --json`,
`./pollux describe-skeleton <name> --json`, `./pollux list-templates --json`.

You should see 4 boilerplate skeletons (`nextjs`, `remix`, `astro`,
`tanstack-start`) plus the `start-ui-vite` reference.

## 3. In-repo generation (inside start-ui-web)

> "Generate the native /manager vertical for entity `pesq`."

runs `./pollux gen-entity pesq` (Drizzle schema + oRPC router + feature
pages + i18n + nav). Follow with `pnpm db:push && pnpm lint:ts`.

> "Regenerate all legacy /generated pages."

runs `./pollux gen-all` (hygen/gohygen templates → `/generated/<entity>` and
`/generated-server/<entity>` pages, guarded CRUD runtime, audit log).

> "Generate the Go backend."

runs `./pollux gen-backend --backend=go` → standalone Gin+Bun+pgx REST
service in `generated/pollux-go` (same CrudResult contract; auth delegated to
the TS app's grant-aware authz endpoint).

## 4. Create a standalone workspace (`pollux-create-workspace`)

> "Create a new TanStack Start workspace at ../pollux-demo."

The skill confirms skeleton + destination, then runs:

```bash
./pollux new-workspace tanstack-start --dir=../pollux-demo
cd ../pollux-demo && pnpm install --frozen-lockfile
```

What you get: a runnable admin shell (sidebar, topbar, light/dark theme,
Montserrat/Inter design tokens) with **zero** entities, plus
`.pollux/workspace.json` provenance recording skeleton + adapter versions.
Creation is staged and atomic — a non-empty destination is refused, nothing
is half-written. Same flow for `nextjs`, `remix`, `astro`.

The skill also provisions the database AUTOMATICALLY: `docker-compose.yml`
with the default image `pgvector/pgvector:pg17` (healthcheck, named
volume), `docker/initdb/01-extensions.sql` enabling the `vector`
extension, and a `DATABASE_URL` entry in `.env.example`. Start it with
`docker compose up -d db`. Decline it by saying so ("sem banco").

## 4b. Author a NEW entity from a brief idea (`pollux-author-entity`)

No metadata file yet? Don't write one by hand — describe the entity:

> "I need a new entity for people — name, email, phone, birth date, active
> flag."

The skill infers a sensible field set, writes `json-files/<name>.json`
(dbtool envelope, PT-BR labels/titles, uuid `id` pk, `criado_em` audit
column, grid/form visibility, default sort), then loops
`./pollux validate <name>` until clean and proves normalization with a
no-write `./pollux plan`. It reports every assumption it made so you can
correct fields before generating. Unsupported field kinds (uploads, rich
text, foreign keys) are refused with the closest scalar suggested.

## 5. Generate CRUD into the workspace (`pollux-generate-crud`)

> "Generate the entity `<name>` into ../pollux-demo."

runs (from the checkout):

```bash
./pollux plan     --workspace=../pollux-demo --entity=<name> --json   # dry-run, no writes
./pollux generate --workspace=../pollux-demo --entity=<name>
```

Per entity you get list/create/edit pages under `/manager/<plural>`
(URL-driven pagination, multi-sort, filters, search), a same-origin API
proxy, BFF auth endpoints, and the shared runtime/UI. Generate entities **one
at a time** on standalone targets (shared-file ownership; `--all` is
refused). `plan` first if you want to review exact paths + hashes.

Version gates reject before any write: wrong metadata model, unknown adapter,
tampered provenance → stable error codes (`PLAN_INVALID`,
`TARGET_UNSUPPORTED`, `TARGET_MISMATCH`).

## 6. Run it end-to-end (5-minute demo, no real backend)

Uses the packaged mock v2 API and the `rich-valid` test entity (`amostra`):

```bash
# terminal 1 — mock backend (from the checkout)
node test-fixtures/pollux/api/mock-server.mjs --port 4310

# terminal 2 — workspace (after generating rich-valid as in step 5, with
# --metadata-dir=test-fixtures/pollux/entities)
cd ../pollux-demo
pnpm typecheck && pnpm build
POLLUX_API_URL=http://127.0.0.1:4310 POLLUX_DEV_BEARER=token-admin \
  PORT=3005 pnpm start
```

Open `http://localhost:3005/manager/amostras` — 7 seeded rows, working
sort/filter/pagination, create/edit/delete with idempotency keys. Try
`token-readonly` as the bearer to watch capability gating hide the write
actions (server still enforces).

Environment contract (server-only, never `VITE_`/public):
`POLLUX_API_URL` (upstream), `POLLUX_DEV_BEARER` (dev-only credential),
`POLLUX_API_TIMEOUT_MS`. Real cookie/PKCE login instead of the dev bearer
needs the five BFF vars (`POLLUX_AUTH_URL`, `POLLUX_AUTH_CLIENT_ID`,
`POLLUX_AUTH_CLIENT_SECRET`, `POLLUX_SESSION_SECRET`,
`POLLUX_PUBLIC_ORIGIN`) — see the skeleton README; unconfigured auth
endpoints answer a safe 503 and the workspace stays in dev-bearer mode.

## 7. Apply layouts and tokens (`pollux-apply-layout`)

> "Apply the Pollux admin shell to my nextjs workspace."
> "Port the design tokens into this app."

Copies the packaged, hash-verified layout resource for the named target
(`layout.nextjs`, `layout.react-router`, `layout.astro`,
`layout.tanstack-start`, `layout.start-ui-vite` reference) plus
`design.tokens` (the shared Tailwind v4 token sheet — Montserrat display,
Inter body, mono figures, light/dark). The skill classifies files as
handwritten-host vs generator-owned before touching anything and verifies
both themes + build afterwards.

## 8. Verify and audit (`pollux-verify`)

> "Check my workspace for drift."

```bash
./pollux check-generated --workspace=../pollux-demo
```

flags hand-edited owned files, missing files, pending transaction journals.

> "Run the full matrix gate for tanstack-start."

```bash
node scripts/pollux/test/workspace-matrix.mjs --target tanstack-start
```

15 steps: create → install → fresh-skeleton tests → generate → ownership
check → no-source-dependency scan → typecheck/test/build offline →
client-bundle secret scan → boot mock API + app → SSR smoke → proxy
allowlist → auth-strip → BFF envelope checks. Also available per target:
`nextjs`, `remix`, `astro`. In-repo equivalents: `./pollux check` (drift) and
`./pollux test --suite=<unit|targets|go|selection>`.

## 9. Recover / undo

- Interrupted generation? The next `generate`/`check-generated` recovers the
  pending journal in `.pollux/transactions/` (all-or-nothing rollback).
- Edited a generated file by hand and want to keep regenerating? Either
  revert your edit, or pass `--accept-generated-overwrite` to discard it.
- Want an entity gone from a workspace? Its files are enumerated in
  `.pollux/generated.json` under the entity's `ownedPaths` — remove them and
  the manifest entry together (shared files belong to the first entity;
  don't remove those while other entities remain).

## Troubleshooting quick table

| Symptom / code | Meaning | Fix |
| --- | --- | --- |
| `SKELETON_UNKNOWN` | Name not in registry | `./pollux list-skeletons --json` for valid names |
| `DESTINATION_NOT_EMPTY` | Workspace dir has files | Point at an empty/new dir (no `--force` exists) |
| `TARGET_MISMATCH` | `--target` disagrees with workspace provenance | Drop `--target` (it's inferred) |
| `GENERATED_EDITED` | Hand-edited owned file | Revert, or `--accept-generated-overwrite` |
| `OWNERSHIP_CONFLICT` | Two entities claim one shared file | Generate one entity at a time |
| Auth endpoints answer 503 | BFF env not configured | Expected in dev-bearer mode; set the five `POLLUX_AUTH_*` vars for real login |
| SSR list empty but client fine | SSR self-fetch can't reach proxy | Set `POLLUX_PUBLIC_ORIGIN` (or run built server so `PORT` matches) |
| Skill doesn't trigger | Session not in a checkout | `cd` into start-ui-web, or name the skill explicitly |
