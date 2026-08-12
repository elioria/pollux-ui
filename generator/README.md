# Pollux generator — standalone snapshot

Self-contained copy of the Pollux generator so the plugin works **from an
empty folder** — no access to the start-ui-web source repository required.

```bash
cd generator
pnpm install          # only dependency: zod
./pollux help
```

## What works here (standalone surface)

```bash
./pollux list-skeletons --json
./pollux describe-skeleton tanstack-start --json
./pollux new-workspace <nextjs|remix|astro|tanstack-start> --dir=<path>
./pollux validate [entity...]              # json-files/ metadata
./pollux plan     --workspace=<p> --entity=<e> --json
./pollux generate --workspace=<p> --entity=<e> [--metadata-dir=<dir>]
./pollux check-generated --workspace=<p>
node test-fixtures/pollux/api/mock-server.mjs --port 4310   # mock v2 backend
node scripts/pollux/test/workspace-matrix.mjs --target <t>  # full gate
```

Author new entity metadata into `json-files/<name>.json` (the
`pollux-author-entity` skill does this from a brief description; a complete
working example lives at `test-fixtures/pollux/entities/rich-valid.json`).

## What does NOT work here

The in-repo surfaces need the full start-ui-web checkout and are absent by
design: `gen-entity` / `gen-all` / `gen-backend` (native /manager verticals,
legacy /generated pages, Go backend), `fmt`, `check`, the repo test suites.

## Database

Workspace creation provisions Docker infra automatically (see the
`pollux-create-workspace` skill): `docker-compose.yml` with the default
image `pgvector/pgvector:pg17`, `docker/initdb/01-extensions.sql`
(`CREATE EXTENSION IF NOT EXISTS vector;`) and a `DATABASE_URL` entry in
`.env.example`.

## Provenance

Mirrored from the canonical start-ui-web repository (dirs: `scripts/pollux`,
`skeletons`, `_templates/pollux-targets`, `test-fixtures/pollux`, `pollux`
launcher). Regenerate with `scripts/sync-generator.sh` from a checkout —
never hand-edit files here.
