---
name: pollux-create-workspace
description: Create a new application workspace from a registered Pollux skeleton (Next.js, React Router/Remix, Astro, TanStack Start). Use when a user asks to scaffold, bootstrap, or start a new Pollux app from a skeleton.
---

# pollux-create-workspace

Create a fresh app workspace from a registered boilerplate skeleton. The
`./pollux new-workspace` command owns staging, atomic rename, and provenance;
this skill owns selection, preconditions, and evidence. Do not copy skeleton
files by hand.

## Preconditions

- Explicit user request naming (or answering) both:
  1. the skeleton — one of `./pollux list-skeletons --json` entries with
     `status: boilerplate` (`nextjs`, `astro`, `remix`, `tanstack-start`);
  2. the destination directory.
- If either is missing, ask one bounded question listing the valid skeletons.
- Never create into a non-empty directory; never add `--force` (the CLI has
  none); never copy the `start-ui-vite` reference skeleton.
- All four boilerplate targets are **experimental** Pollux generator targets.
  State this before mutating.

## Steps

1. Inspect first (read-only):
   - `./pollux list-skeletons --json`
   - `./pollux describe-skeleton <name> --json` — confirm entrypoints,
     design-system tokens, and `generatorSupport`.
2. Verify the destination: resolve it to an absolute path, confirm it is
   empty or absent, and confirm it does not escape the user-approved location
   (`PATH_UNSAFE` otherwise).
3. Delegate to the canonical command:
   `./pollux new-workspace <skeleton> --dir=<path> [--name=<pkg>] --json`
   - The CLI stages the copy in the destination parent and renames
     atomically; on failure there is no partial destination.
   - On `SKELETON_UNKNOWN`, `DESTINATION_NOT_EMPTY`, or
     `PACKAGE_NAME_INVALID`, report the stable code and stop — do not retry
     with manual copies.
4. Confirm provenance: `<dir>/.pollux/workspace.json` exists and records the
   skeleton, target adapter, and versions.
5. **Provision the database (AUTOMATIC — do not wait to be asked).** Every
   new app gets Docker infra for the PostgreSQL that will back its Pollux
   backend, default image `pgvector/pgvector:pg17`. Write into the
   workspace (these are handwritten host files, never adapter-owned):
   - `docker-compose.yml`:

     ```yaml
     services:
       db:
         image: pgvector/pgvector:pg17
         restart: unless-stopped
         environment:
           POSTGRES_USER: ${POSTGRES_USER:-pollux}
           POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-pollux}
           POSTGRES_DB: ${POSTGRES_DB:-pollux}
         ports:
           - '${POSTGRES_PORT:-5440}:5432'
         volumes:
           - db_data:/var/lib/postgresql/data
           - ./docker/initdb:/docker-entrypoint-initdb.d:ro
         healthcheck:
           test: ['CMD-SHELL', 'pg_isready -U $${POSTGRES_USER:-pollux} -d $${POSTGRES_DB:-pollux}']
           interval: 5s
           timeout: 5s
           retries: 10

     volumes:
       db_data:
     ```

   - `docker/initdb/01-extensions.sql` containing
     `CREATE EXTENSION IF NOT EXISTS vector;`
   - Append to `.env.example`:
     `DATABASE_URL=postgres://pollux:pollux@localhost:5440/pollux`
     (commented note: consumed by the Pollux backend, not by the frontend
     workspace — `POLLUX_API_URL` stays the app's only upstream).

   Rules: credentials only as `${VAR:-default}` (never a real secret);
   named volume mandatory; keep the healthcheck (dependents use
   `depends_on: { db: { condition: service_healthy } }`); if the user names
   a different port/image, honor it but state that `pgvector/pgvector:pg17`
   is the default. Skip this step ONLY if the user explicitly declines a
   database or the workspace directory already carries a compose file.

## Output contract

1. **Created** — absolute destination path and skeleton used.
2. **Provenance** — contents summary of `.pollux/workspace.json`.
3. **Install** — the package-manager command (e.g. `pnpm install
   --frozen-lockfile`) from the skeleton manifest.
4. **Verify** — the target verification command, typically
   `node scripts/pollux/test/workspace-matrix.mjs --target <nextjs|remix|astro|tanstack-start>`
   from the source repo, or the skeleton's own `test`/`build` commands.
5. **Database** — compose file path, image (`pgvector/pgvector:pg17`),
   host port, `docker compose up -d db` command, and the `DATABASE_URL`
   added to `.env.example` (or the reason the step was skipped).
6. **Status** — repeat that the target is experimental until its CI matrix is
   green.
7. **Next** — offer both follow-ups: generate an EXISTING entity
   (pollux-generate-crud) or author a NEW one from a brief description
   (pollux-author-entity — do not tell the user to hand-write
   json-files metadata).

## Failure behavior

- Failed precondition → no staging tree, no partial destination, stable error
  code, stop.
- Do not delete or overwrite any pre-existing directory you did not create in
  this run.

## References

- `resources/references/skeletons/README.md` — skeleton contracts.
- `resources/references/operations/pollux-skeletons-runbook.md` — workspace
  operations and recovery.
