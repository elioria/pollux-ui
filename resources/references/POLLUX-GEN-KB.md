# Pollux Generator Knowledge Base

> Repository: `start-ui-web`
>
> Evidence audit: 2026-07-20
>
> Coverage: native manager verticals, legacy-compatible TypeScript pages, and
> the standalone Go backend

## Purpose and authority

This is the durable engineering reference for the generator family called
Pollux in this repository. It explains what is implemented now, how the three
generation paths differ, how to operate them safely, and which improvements
remain proposals.

Use the following precedence when sources disagree:

1. Executable source, generated output, and tests.
2. `CLAUDE.md` and current operations runbooks.
3. `docs/operations/pollux-rollout-manifest.json` and
   `docs/operations/pollux-rollout-inventory.md`.
4. The specification set indexed by `docs/specs/README.md`.

The specifications retain historical gaps and target contracts. They are not,
by themselves, proof that every acceptance criterion is implemented. This KB
labels current evidence, known limitations, and recommendations separately.

## Executive summary

Pollux is not one generator. It is a family of metadata-driven generation
paths built around `json-files/<entity>.json`:

| Path | Main entrypoint | Primary output | Runtime |
| --- | --- | --- | --- |
| Native manager | `node scripts/gen-entity.mjs <entity>\|--all` | `/manager/<plural>` feature verticals, oRPC routers, Drizzle schemas, locales, navigation | TanStack Start + oRPC + Drizzle |
| Legacy-compatible TypeScript | `./pollux gen-entity`, `./pollux gen-all` | `/generated/<entity>` and `/generated-server/<entity>` | TanStack server functions + shared generated CRUD runtime |
| Standalone Go backend | `./pollux gen-backend --backend=go` | `generated/pollux-go` | Gin + Bun + pgx |
| Standalone workspace targets (experimental) | `./pollux new-workspace <skeleton>` + `./pollux generate --workspace=<path> --entity=<e>` | CRUD verticals inside copied Next.js / React Router 7 / Astro workspaces | Framework app + same-origin BFF proxy → Go `/api/generated/v2` |

The current metadata inventory contains:

- **55 valid entities**;
- **2 declared stubs**, `json-files/audit_log.json` and
  `json-files/objcss.json`;
- **55 native feature verticals**, routers, Drizzle entity schemas, and manager
  route directories;
- **55 legacy generated entity directories**;
- **110 legacy route files**, one client-table and one server-table route per
  entity;
- **55 generated Go entity packages**;
- **6 Pollux template groups and 97 EJS templates**;
- **55 hard-delete entities**;
- **53 entities with `updatedAt` concurrency metadata and 2 without it**;
- **0 sensitive-field flags recorded in the current rollout manifest**.

These numbers were derived from `./pollux list-entities --json`,
`./pollux list-templates --json`, filesystem inventories, and the committed
rollout manifest. Re-run the commands before treating the counts as current
after a metadata or template change.

## Terminology and boundaries

### Entity

An entity is a short legacy code such as `act`, `aut`, `pesq`, or `lechis`.
The JSON filename is the canonical generator key. Database table names and
labels come from the JSON payload.

### Metadata

`json-files/<entity>.json` is the checked-in generation input. The files were
originally sourced from the Pollux database tooling, but generation is
local and deterministic from the committed files.

A usable file must contain `data.attributes`. A declared error payload with
`success: false` and no attributes is a skipped stub. Invalid JSON or an
undeclared missing-attributes shape is an error.

### Native generator

The native generator is `scripts/gen-entity.mjs`. It emits modern
`/manager/...` verticals and does not use `_templates/pollux`.

### Pollux templates

`_templates/pollux/` is canonical for the legacy-compatible TypeScript output
and standalone Go service. `_templates/pollux-archive/` is a frozen archive and
must not be changed to alter active generated output.

### Generated output

Generated files must not receive durable hand-only fixes. Change their source
generator or template, regenerate, format, verify drift, and commit source plus
output together.

## End-to-end architecture

```text
json-files/*.json
        |
        +--> metadata validation
        |      `scripts/pollux/validate-metadata.mjs`
        |
        +--> scripts/gen-entity.mjs
        |      native /manager UI + oRPC + Drizzle + locale/nav wiring
        |
        +--> Hygen or gohygen + _templates/pollux
        |      /generated client table
        |      /generated-server SQL-driven table
        |
        +--> gohygen + _templates/pollux/go-*
               standalone generated/pollux-go service

All request paths
        |
        +--> Better Auth session
        +--> role ACL + per-user/per-group grants
        +--> PostgreSQL

Legacy TypeScript and Go mutation paths
        |
        +--> stable CrudResult-style error contract
        +--> transaction containing mutation + generated_crud_audit insert
        +--> structured request-correlated logs
```

The grant resolver is shared authority, but runtime implementation is not fully
unified:

- native oRPC routers call `protectedProcedure`;
- legacy-compatible server functions call `runGeneratedCrud`;
- the Go service calls the TypeScript application's
  `/api/rest/authz/has-permission` endpoint.

## Metadata contract

### Current validation

`scripts/pollux/validate-metadata.mjs` validates the following before the
legacy-compatible generators write output:

- non-empty entity and database names;
- at least one attribute;
- unique attribute names and positions;
- exactly one primary key;
- required boolean flags;
- supported legacy data types;
- supported legacy policy values such as `sim`, `não`, `nunca`,
  `condicional`, and `NULL`;
- declared stubs versus malformed files.

Supported data types are:

```text
char boolean timestamp timestamptz text smallint varchar time timetz
bigint real double numeric integer uuid date
```

Validation is fail-fast for `gen-all.sh`, `gen-all-go.sh`, and the Go backend
generator. It prints a path-specific error report and exits non-zero.

### Important current boundary

The validator checks the raw shape and essential invariants. It is not yet a
single normalized intermediate representation consumed by all three
generators.

`scripts/gen-entity.mjs` has its own `loadEntity()` normalization and type
mapping. It directly parses JSON, silently treats an unusable entity as a
stub, and falls back to string behavior for unknown types. Therefore the
native path is not protected by exactly the same fail-closed contract as the
legacy-compatible and Go wrapper workflows.

### Current inventory facts

The committed rollout manifest reports:

- deletion mode: hard for all 55 entities;
- optimistic concurrency: `updatedAt` for 53 entities, none for 2;
- sensitive-field metadata flags: none;
- permissions: read, create, update, delete for every valid entity.

The manifest records metadata hashes per entity and a template tree hash. It
is the rollback inventory for a regeneration wave.

## Generator path 1: native `/manager` verticals

### Entry points

```bash
node scripts/gen-entity.mjs act
node scripts/gen-entity.mjs --all
```

The generator is idempotent in the sense that it overwrites the same owned
files for the same metadata. It does not stage all output atomically.

### Outputs per entity

For an entity such as `act`, it writes:

- `src/server/db/schema/entities/act.ts`;
- `src/features/act/schema.ts`;
- `src/features/act/manager/form-act.tsx`;
- `src/features/act/manager/columns.tsx`;
- list, new, and update manager pages;
- `src/server/routers/act.ts`;
- `src/routes/manager/acts/index.tsx`;
- `src/routes/manager/acts/new.index.tsx`;
- `src/routes/manager/acts/$id.update.index.tsx`;
- locale JSON files under `src/locales/{en,fr,ar,sw}/`.

It also rewrites shared aggregation points:

- `src/server/db/schema/index.ts`;
- `src/server/router.ts`;
- generated regions in `src/features/auth/permissions.ts`;
- locale indexes;
- `src/layout/manager/nav-generated.ts`.

The route pluralization rule is intentionally simple: append `s`, or append
`es` when the entity code already ends in `s`.

### Runtime behavior

Native routes call entity-specific oRPC routers. Each router uses
`protectedProcedure` with a static entity/action permission:

| Operation | Permission |
| --- | --- |
| list and get by ID | `read` |
| create | `create` |
| update | `update` |
| delete | `delete` |

`protectedProcedure` provides:

- Better Auth session enforcement;
- grant-aware authorization;
- demo-mode mutation blocking;
- structured procedure logs;
- database timing headers;
- common PostgreSQL error mapping.

Create and update payloads are generated from explicit business fields rather
than arbitrary caller spreads.

### Native-path limitations

The native generator is not equivalent to the hardened legacy runtime:

- it returns oRPC outputs and errors, not `CrudResult<T>`;
- it does not write `generated_crud_audit` events;
- its update route does not use an optimistic concurrency token;
- its delete route does not verify an affected-row result;
- its list input exposes a cursor, but the generated query does not apply
  `input.cursor`, so subsequent cursor requests do not advance correctly;
- it has its own metadata normalization and type mapping;
- generation writes directly to final locations.

These are current implementation facts, not claims that the native path is
unauthorized. Authorization is enforced through `protectedProcedure`.

### Required post-generation checks

`CLAUDE.md` currently prescribes:

```bash
pnpm db:push
pnpm lint:ts
```

Because this generator rewrites schema, router, locale, permissions, and
navigation aggregation files, also inspect those shared diffs before commit.

## Generator path 2: legacy-compatible TypeScript

### Entry points

Prefer the agent-facing CLI:

```bash
./pollux gen-entity act
./pollux gen-entity act --renderer=node
./pollux gen-all
./pollux gen-all --renderer=node
```

Direct wrappers remain available:

```bash
./gen-all-go.sh
./gen-all.sh
```

`gohygen` is the default CLI renderer. Its binary is built from the sibling
`../gohygen` checkout and cached at `.cache/gohygen`. The Node renderer uses
Hygen. `generate-all-entity-pages.sh` is a deprecated alias to `gen-all.sh`.

### Template groups

The active template inventory is:

| Group | Templates | Purpose |
| --- | ---: | --- |
| `page` | 16 | client-table page, server actions, dialogs, table components, route |
| `serverpage` | 5 | SQL-driven table, action, route, page, skeleton |
| `form-fields` | 3 | generated form-field scratch snippets |
| `partials` | 41 | type-specific fields, schemas, submit logic, columns |
| `go-entity` | 8 | per-entity Go model, validation, repository, service, handlers, tests |
| `go-service` | 24 | shared Go application, auth, errors, middleware, config, database |

The TypeScript bulk wrappers render `page`, `serverpage`, and `form-fields`
for every valid entity.

### Outputs

For each entity:

- `src/app/(private)/generated/<entity>/page.tsx`;
- `src/app/(private)/generated/<entity>/actions/entityActions.ts`;
- dialogs and client-table components;
- `src/app/(private)/generated/<entity>/serverpage/`;
- form-field `.txt` snippets;
- `src/routes/generated.<entity>.tsx`;
- `src/routes/generated-server.<entity>.tsx`.

Legacy imports are bridged through `src/shims/` and
`src/db/schema.ts`. A newly generated entity also needs its PascalCase row
type exposed by the compatibility barrel when the generator does not add it
automatically.

### `/generated/<entity>` behavior

The client-table route loads data through a generated server function and
renders a TanStack table in the browser.

Current behavior includes:

- authenticated manager-compatible route guard;
- server-side entity `read` check;
- capability loading for create/update/delete UI controls;
- stable error envelope and safe route-error conversion;
- a deterministic ID sort;
- a hard limit of 10,000 selected rows.

The 10,000-row cap technically bounds the read, but it is not normal
pagination and can still produce expensive responses and browser work.

### `/generated-server/<entity>` behavior

This is the scalable server-driven variant:

- SQL `where`, `orderBy`, `limit`, `offset`, and matching `count`;
- page from 1 to 1,000,000;
- `perPage` from 1 to 100;
- up to 3 unique allowlisted sort fields;
- up to 20 unique allowlisted filters;
- search text bounded to 200 characters;
- filter values bounded to 50 entries of 200 characters each;
- escaped SQL LIKE wildcards;
- primary-key ascending tiebreak sorting;
- URL search parameters as the source of truth;
- 300 ms optimistic local mirrors for text/filter controls;
- page reset when filters change.

Invalid sort/filter input is rejected by the server schema. Route search
parsing safely falls back for invalid URL state.

### Hardened server-function runtime

All generated legacy server functions pass through
`src/server/generated-crud/procedure.ts`:

1. resolve or create a request ID;
2. authenticate the Better Auth session;
3. authorize the static entity/action;
4. parse the input with the generated Zod schema;
5. execute the database handler;
6. write a terminal structured log;
7. return a discriminated `CrudResult<T>`.

The database handler cannot execute before authentication, authorization, and
validation succeed.

### Mutation behavior

Generated create/update/delete operations:

- use explicit persistence allowlists;
- derive actor IDs from the authenticated session;
- leave timestamps to database defaults or server code;
- preserve omitted versus explicit-null update semantics;
- reject empty patches;
- lock the current row for updates;
- compare `expectedUpdatedAt` when supplied;
- verify single-delete affected rows;
- bound bulk deletion to 1–100 unique IDs;
- roll back bulk deletion when any requested row is missing;
- insert the audit row in the mutation transaction.

All current entities use hard deletion. Foreign-key failures map to
`REFERENCE_CONFLICT`.

### React and UI constraints

Generated TanStack Table components that read mutable table state start with
`'use no memo'` so the React Compiler does not freeze stale state.

Portal-facing generated UI is Portuguese. Boolean grid filters use `Sim` and
`Não`. Generated Base UI dropdowns must follow the repository wrappers rather
than Radix-specific APIs.

## Generator path 3: standalone Go backend

### Entry point

```bash
./pollux gen-backend --backend=go
```

Equivalent direct command:

```bash
./generate-pollux.sh --backend go
```

The backend selector has no default. Missing or unsupported backends exit with
code 2 before generation. `--backend=typescript` dispatches to `gen-all.sh`.

### Atomic generation

`gen-all-go-backend.sh`:

1. builds or reuses `.cache/gohygen`;
2. validates all metadata;
3. removes and recreates the ephemeral `generated/.pollux-go-staging`
   directory;
4. renders the `go-service` group once;
5. renders `go-entity` for every valid entity;
6. generates the deterministic route registry;
7. runs `go mod tidy`;
8. runs `gofmt`;
9. replaces `generated/pollux-go` only after every prior step succeeds.

A failure before promotion leaves the previous final backend intact.

### Generated architecture

The generated module contains:

- Gin HTTP routing;
- Bun ORM over pgx/PostgreSQL;
- per-entity model, validation, repository, service, handler, and routes;
- strict and bounded JSON decoding;
- request IDs, access logging, recovery, and request timeouts;
- health and readiness endpoints;
- explicit CORS and trusted-proxy configuration;
- Better Auth session and permission forwarding;
- transactional audit writes;
- unit/contract tests and optional PostgreSQL integration tests.

The current generated tree contains 55 entity packages, 67 total Go packages,
461 Go files, and 115 `_test.go` files.

### REST routes

Every entity is mounted below `/api/generated/v1/<entity>`:

| Operation | Method/path | Permission |
| --- | --- | --- |
| capabilities | `GET /capabilities` | authenticated |
| bounded list | `GET /` | `read` |
| server page | `POST /page` | `read` |
| get one | `GET /:id` | `read` |
| create | `POST /` | `create` |
| update | `PATCH /:id` | `update` |
| delete | `DELETE /:id` | `delete` |
| bulk delete | `POST /bulk-delete` | `delete` |

The service also exposes `/healthz` for process health and `/readyz` for a
bounded database readiness check.

### Authentication and permission parity

The Go service does not copy role definitions or grant-table logic.

For each request it:

1. forwards the incoming cookie to Better Auth's session endpoint;
2. calls the TypeScript application's
   `POST /api/rest/authz/has-permission`;
3. requests the exact static entity/action;
4. fails closed on denial or dependency failure.

The TypeScript endpoint uses `checkPermissionWithGrants`, keeping role and
database grants as the single authority.

### Configuration

Required:

- `POLLUX_DATABASE_URL`;
- `POLLUX_AUTH_BASE_URL`.

Important defaults:

| Variable | Default |
| --- | --- |
| `POLLUX_PORT` | `8080` |
| `POLLUX_AUTH_TIMEOUT` | `3s` |
| `POLLUX_REQUEST_TIMEOUT` | `15s` |
| `POLLUX_SHUTDOWN_TIMEOUT` | `10s` |
| `POLLUX_DB_MAX_OPEN_CONNS` | `10` |
| `POLLUX_DB_MAX_IDLE_CONNS` | `5` |
| `POLLUX_DB_CONN_MAX_LIFETIME` | `30m` |
| `POLLUX_DB_CONN_MAX_IDLE_TIME` | `5m` |
| `POLLUX_MAX_BODY_BYTES` | `1048576` |

`POLLUX_TRUSTED_PROXIES` defaults to none. Trusting every proxy is rejected.
`POLLUX_CORS_ALLOWED_ORIGINS` defaults to disabled and rejects `*`.

### Deployment boundary

The Go backend is a standalone process or container. It cannot run inside the
Cloudflare Worker used by the TypeScript application. It needs network access
to PostgreSQL and the TypeScript application's auth/authz endpoints.

Since the SPEC-003 backend-compatibility work, the service also serves the
versioned standalone contract `/api/generated/v2/:entity` beside unchanged v1
routes: flat `{ok, code, requestId, retryable}` error envelopes, strict bounded
list parsing (`page`/`pageSize` 1..500, JSON multi-sort, `f_<codeName>__<op>`
filters, unknown-key rejection), bearer-token authorization resolved through
the TypeScript authz boundary, and transactional `Idempotency-Key` semantics
(`pollux_idempotency` table; byte-exact replay with `Idempotency-Replayed`,
different-body `CONFLICT`, bounded in-progress wait, 24h expiry). Contract
fixture: `test-fixtures/pollux/api/contract.md`; ops doc:
`docs/operations/pollux-go-backend.md`.

## Generator path 4: standalone workspace targets (experimental)

`docs/specs/skeletons/` (SPEC-001..007) defines this path; all seven SPECs are
implemented. It turns the multi-skeleton registry into a workspace factory
with real entity generation for three frameworks:

- **Skeletons** (`skeletons/`): `start-ui-vite` (reference, the live repo),
  plus copyable `nextjs`, `remix` (React Router 7) and `astro` boilerplates
  with committed lockfiles, versioned manifests (schemaVersion 1) and a shared
  design-token contract (`skeletons/_shared/design-tokens.css`).
- **Workspace factory**: `./pollux new-workspace` performs a staged, atomic,
  rollback-safe copy and records `.pollux/workspace.json` provenance (git
  revision, content digest, `targetStatus`).
- **Normalized model** (`scripts/pollux/model/`): every generator input goes
  through `PolluxEntityModel` v1 with precise diagnostics; all 55 real
  entities normalize deterministically.
- **Adapters** (`scripts/pollux/targets/{nextjs,react-router,astro-react}/`):
  deterministic hashed plans, ownership headers plus `.pollux/generated.json`,
  durable transaction journal with automatic rollback/recovery, golden
  fixtures (`.golden` suffix — deliberately exempt from pre-commit
  formatting).
- **Runtime contract**: generated pages call the Go `/api/generated/v2`
  contract through a same-origin server proxy (allowlisted paths/methods/query
  keys, header stripping, byte limits, timeouts). Authentication is the
  SPEC-003 PKCE/BFF topology: the TypeScript app is the authorization host
  (`/api/pollux/{authorize,token,revoke,jwks}`, ES256 JWTs, rotating refresh
  families) and each workspace runs the BFF client flow from
  `_templates/pollux-targets/shared/runtime/bff-core.ts`. `POLLUX_DEV_BEARER`
  is a documented dev-only fallback used by the offline CI matrix.
- **Verification**: `node scripts/pollux/test/workspace-matrix.mjs
  --target <t>` runs create → generate → frozen install → typecheck → test →
  build → mock-API runtime smokes per target; CI has `pollux-unit`,
  `pollux-matrix` and a failing aggregate gate in
  `.github/workflows/code-quality.yml`.

All three targets are `generatorSupport.experimental`; promotion to
`pollux: true` happens only in the change that makes the required CI matrix
green (SPEC-007 rollout rule). Operational recovery procedures live in
`docs/operations/pollux-skeletons-runbook.md`.

## Shared authorization model

`src/server/permissions/grant-resolver.ts` implements the effective decision:

1. role `admin` allows as a superuser;
2. `perusr.isDenied` for the user/resource denies and overrides other grants;
3. the code-defined Better Auth role ACL may allow;
4. direct `perusr` or group `pergrp` flags through `usrgrp` may allow;
5. otherwise deny.

Grant rows target `res` records where `res.code` equals the entity code.
Entities without a matching resource are controlled by the role ACL alone.

Flag mapping:

- `canAdmin` implies every grant-supported action;
- any positive flag implies `read`;
- `canInsert` maps to `create`;
- `canUpdate` maps to `update`;
- `canDelete` maps to `delete`;
- `canExport` maps to `export`.

Non-CRUD actions remain role-ACL-only. Duplicate resource-code rows are merged;
any matching explicit user denial wins.

The admin role receives generated read/create/update/delete permissions for
every valid entity. The normal user role has no generated entity permission by
default, but database grants can add access.

## Capability-aware UI

The client receives effective permissions to decide whether to render
navigation and mutation controls:

- native manager pages use `WithPermissions`;
- legacy loaders call `getGeneratedCapabilities`;
- Go exposes a capabilities endpoint.

This is user-experience gating only. Every server call independently checks its
permission, so hiding a button is never the security boundary.

## Error and result contracts

### Legacy TypeScript and Go

Both expose the same conceptual envelope:

```ts
type CrudResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: {
        code: string;
        message: string;
        requestId: string;
        retryable: boolean;
        fieldErrors?: Record<string, string[]>;
      };
    };
```

Stable public error codes:

- `UNAUTHENTICATED`;
- `FORBIDDEN`;
- `VALIDATION_FAILED`;
- `NOT_FOUND`;
- `CONFLICT`;
- `REFERENCE_CONFLICT`;
- `STALE_WRITE`;
- `RATE_LIMITED`;
- `SERVICE_UNAVAILABLE`;
- `INTERNAL`.

Messages are safe Portuguese text. Raw database messages do not cross the
transport. A `requestId` correlates the client result with structured logs.

The Go backend additionally uses meaningful HTTP status codes while retaining
the JSON envelope.

### Native oRPC

Native manager routers use oRPC errors and output schemas. The common oRPC
middleware maps selected PostgreSQL SQLSTATE codes, but the public contract is
not the same discriminated envelope as the legacy-compatible and Go paths.

## Audit and observability

### Transactional audit

The `generated_crud_audit` table stores one row per successful legacy
TypeScript or Go mutation:

- request ID;
- actor user ID;
- entity;
- operation;
- optional record ID;
- bulk record count;
- sorted changed field names;
- success outcome and timestamp.

It never stores field values. The audit insert occurs in the same transaction
as the mutation. An audit failure rolls the mutation back.

Reads do not create durable audit rows. The audit table has no generated CRUD
endpoint.

Native oRPC entity mutations currently do not write this table.

### Structured logs

Legacy operations emit safe Pino events with:

- request ID;
- entity, action, operation, and method;
- user ID after authentication;
- duration and outcome;
- result count when applicable;
- public error code on failure.

Inputs, rows, free-text values, SQL, cookies, headers, and secrets are excluded.
The Go service follows the same data-minimization intent in its access logger.

Initial documented operational thresholds:

- reads slower than 750 ms: warning;
- mutations slower than 1,000 ms: warning;
- internal/dependency failures above 2% over 10 minutes with at least 20
  operations: alert;
- more than 20 authorization denials for one actor over 5 minutes: security
  alert.

## Pollux CLI reference

`./pollux` wraps `scripts/pollux/cli.mjs`.

| Command | Current behavior |
| --- | --- |
| `help` | command summary |
| `list-entities` | valid entities and skipped stubs |
| `list-templates` | template groups and counts |
| `describe <entity>` | field types, flags, routes, and table |
| `validate [entity...]` | metadata validation |
| `gen-entity <e>` | selected TypeScript groups for one entity |
| `gen-all` | every valid legacy TypeScript entity |
| `gen-backend --backend=typescript\|go` | explicit backend dispatch |
| `fmt` | oxlint import fixes followed by oxfmt |
| `check` | regeneration drift gate |
| `manifest` | rewrites rollout manifest and inventory |
| `test --suite=unit\|skeletons\|targets\|model\|selection\|go\|e2e` | targeted suites |
| `doctor` | local dependency and service diagnostics |
| `list-skeletons` / `describe-skeleton <name>` | registered app skeletons (`skeletons/registry.json`) |
| `validate-skeletons` | versioned manifest schema + shared-token drift gate |
| `new-workspace <skeleton> --dir=<path>` | staged atomic boilerplate copy with `.pollux/workspace.json` provenance and committed lockfile |
| `plan --workspace=<path> --entity=<e>` | dry-run generation plan (no writes) |
| `generate --workspace=<path> --entity=<e>\|--all` | journaled, all-or-nothing entity generation into a standalone workspace |
| `check-generated --workspace=<path>` | hand-edit detection against `.pollux/generated.json` |

Use `--json` for commands whose handlers return through the CLI's `out()`
function, such as `list-entities`, `list-templates`, `describe`, and `doctor`.

### Known CLI JSON defect

The help text currently says every command supports machine-readable
`--json`. That is not true for every wrapper command.

For example, `manifest --json` inherits the manifest builder's human text and
then prints a JSON envelope, producing mixed stdout. `validate`, `check`,
`test`, and backend dispatch also hand control to child processes without
normalizing their output. Do not parse those commands as a single JSON
document until the CLI contract is fixed.

## Canonical workflows

### Inspect an entity without writing

```bash
./pollux list-entities --json
./pollux describe act --json
./pollux list-templates --json
./pollux validate act
```

### Regenerate one legacy TypeScript entity

```bash
./pollux validate act
./pollux gen-entity act
./pollux fmt
./pollux test --suite=unit
./pollux check
```

`gen-entity` defaults to `page,serverpage,form-fields` and the gohygen
renderer. Use `--groups=` or `--renderer=node` only deliberately.

### Regenerate all legacy TypeScript entities

```bash
./pollux validate
./pollux gen-all
./pollux fmt
./pollux test --suite=unit
./pollux check
./pollux manifest
```

Commit templates, generated output, and refreshed manifest/inventory together.
Restart `pnpm dev` after bulk route generation; mass route rewrites can corrupt
the running Vite SSR module graph.

### Canonical formatting order

The order is load-bearing:

1. oxlint import sorting/fixes;
2. oxfmt last.

Equivalent direct commands:

```bash
pnpm exec oxlint --fix "src/app/(private)/generated" src/routes
find "src/app/(private)/generated" \
  \( -name '*.ts' -o -name '*.tsx' -o -name '*.css' \) \
  -print0 | xargs -0 pnpm exec oxfmt
ls src/routes/generated*.tsx | xargs pnpm exec oxfmt
```

Directory-mode oxfmt can skip files, so explicit file lists are intentional.
Reversing the formatter/import-fix order is not a stable fixpoint.

### Regenerate the Go backend

```bash
./pollux validate
./pollux gen-backend --backend=go
./pollux test --suite=go
./pollux test --suite=selection
```

The selection suite checks invalid/missing selector behavior, dispatch,
TypeScript immutability, and byte-identical Go regeneration.

### Regenerate native manager verticals

```bash
node scripts/gen-entity.mjs act
pnpm db:push
pnpm lint:ts
```

For all entities:

```bash
node scripts/gen-entity.mjs --all
pnpm db:push
pnpm lint:ts
```

Review shared router, permissions, schema barrel, locale index, and navigation
changes before commit.

## Deterministic drift and manifests

`scripts/pollux/check-drift.sh` regenerates all legacy TypeScript output,
applies the canonical format order, and compares generated paths with Git.

Precondition: generated paths must be clean. Run it before unrelated changes
touch `src/app/(private)/generated` or `src/routes`.

The rollout manifest contains:

- generation timestamp;
- template commit;
- template tree hash;
- valid entity count and stubs;
- per-entity metadata hash;
- field count;
- permission list;
- sensitive flags;
- deletion and concurrency modes;
- route and generated-directory inventory.

`./pollux manifest` is a write command. It refreshes timestamps and commit
provenance; do not use it as a read-only query.

## Verification matrix

| Area | Command | What it proves |
| --- | --- | --- |
| Metadata | `pnpm pollux:validate` | raw metadata passes current schema |
| Legacy drift | `pnpm pollux:drift` or `./pollux check` | committed legacy output matches regeneration |
| Legacy unit contracts | `./pollux test --suite=unit` | generated CRUD permissions, errors, output contracts |
| Backend selection | `./pollux test --suite=selection` | selector behavior, TS immutability, two fresh Go generations match |
| Go unit/vet | `./pollux test --suite=go` | Go packages compile, tests pass, vet is clean |
| TypeScript | `pnpm lint:ts` | TypeScript graph typechecks |
| Static lint | `pnpm exec oxlint --deny-warnings .` | repository lint is warning-free |
| Browser/unit | `pnpm test:ci` | configured Vitest suite passes |
| Pollux E2E | `./pollux test --suite=e2e` | generated routes and optional Go service work live |
| Full production | `pnpm build` and `pnpm build:cf` | Node and Cloudflare targets bundle |

The E2E suite needs PostgreSQL and the app on port 3011. The Go backend part
self-skips unless the service answers on port 8091 or `POLLUX_GO_URL`.

`node scripts/e2e-grants-live.mjs` is the deeper live grant test. It creates an
OTP user, seeds grants, runs 18 checks, and cleans up the rows it owns. Its
pre-grant assertion currently assumes the effective-permission map has no keys.
That assumption is false when unrelated `res` rows already exist: the resolver
returns those resource codes with every action false. Evaluate authorization
assertions separately from this state-sensitive inventory assertion until the
fixture is hardened.

The current CLI E2E command hardcodes four Playwright workers. That overrides
the configuration's single-worker CI setting. On a cold Vite module graph with
110 generated routes, the full parallel sweep can time out while routes are
being transformed. For a deterministic diagnostic run, use:

```bash
VITE_BASE_URL=http://localhost:3011 pnpm exec dotenv -- \
  playwright test --project=chromium --workers=1 \
  e2e/generated-crud.spec.ts e2e/generated-server.spec.ts \
  e2e/generated-guard.spec.ts e2e/go-backend.spec.ts
```

## CI and release readiness

`.github/workflows/code-quality.yml` runs one ordered job on pushes to `main`
and non-draft pull requests:

1. Pollux metadata validation;
2. generated-output drift;
3. oxlint with warnings denied;
4. TypeScript;
5. Vitest;
6. Node production build;
7. Cloudflare Workers production build.

It uses Node 24 and installs Playwright/Chromium.

The default release-readiness job does not currently run:

- Go tests and vet;
- backend-selection tests;
- live Playwright Pollux E2E;
- the 18-check live grant suite.

Those omissions matter when Go templates, backend selection, or live auth/grant
behavior changes.

## Deployment constraints

### TypeScript application

The application can build for Node or Cloudflare Workers:

```bash
pnpm build
pnpm build:cf
```

Cloudflare uses one SSR Worker plus static assets. Production still needs:

- PostgreSQL through Hyperdrive;
- R2 or hosted S3 rather than local MinIO;
- SMTP on supported Worker socket ports 587/465 or an HTTP mail provider;
- secrets installed through Wrangler.

The Node production build sets a 6 GiB build-only V8 heap limit because the
full generated route graph exceeds the default heap.

### Go application

The generated Go backend must run separately. Deploy it only where it can
reach:

- PostgreSQL;
- the TypeScript Better Auth session endpoint;
- `/api/rest/authz/has-permission`.

Its auth URL must be trusted for the forwarded Origin used by permission POSTs.

## Troubleshooting

### Metadata validation fails

Symptoms:

- generation exits before rendering;
- output names a JSON file and attribute path.

Actions:

1. run `./pollux validate <entity>`;
2. run `./pollux describe <entity> --json` when the shape is valid enough;
3. correct metadata rather than bypassing validation;
4. do not classify malformed JSON as a stub.

### Stub is unexpectedly skipped

Only declared error payloads without `data.attributes` are legitimate stubs.
Current stubs are `audit_log` and `objcss`. A new skip should be reviewed as a
metadata acquisition failure, not accepted automatically.

### gohygen is missing

Run `./gen-all-go.sh` once to build `.cache/gohygen`, or use:

```bash
./pollux gen-entity <entity> --renderer=node
```

The sibling `../gohygen` checkout and Go toolchain are required to build the
cached renderer.

### Drift check reports dirty generated paths

Commit or otherwise isolate legitimate generated-path work before running the
check. Do not run it over unreviewed local edits: the current script restores
generated paths with `git checkout --` when it detects post-regeneration drift.

### Drift appears only after formatting

Run `./pollux fmt`. Import sorting must happen before oxfmt. Do not substitute
directory-mode formatting for the explicit file pipeline.

### Generated routes return 404/500 after regeneration

Restart `pnpm dev`. Bulk route rewrites can invalidate the Vite SSR module
graph.

### SSR smoke test does not contain visible table text

The table renders client-side. Inspect the TanStack Router hydration payload
for route data such as `pageCount`; do not use visible table text as the only
SSR assertion.

Unauthenticated SSR can return the application shell with a structured
`UNAUTHENTICATED` failure and client redirect to `/login`.

### Permission denied unexpectedly

Check in this order:

1. active Better Auth session;
2. admin role bypass;
3. explicit `perusr.isDenied`;
4. generated role ACL in `src/features/auth/permissions.ts`;
5. `res.code` matches the entity;
6. direct `perusr` flags;
7. group membership through `usrgrp` and `pergrp` flags.

Users may need to re-login after role changes because session role data can be
cached.

### Mutation returns a reference conflict

`REFERENCE_CONFLICT` maps PostgreSQL SQLSTATE `23503`. It is an expected
business outcome when dependent rows exist, not necessarily an outage.

### Update returns stale write

The row changed after the client loaded it. Preserve the form state, reload
the record, and let the user reconcile. A sustained spike can indicate a batch
writer competing with interactive edits.

### Database outage

Legacy-compatible and Go operations return retryable dependency/service errors
with request IDs. Transactional mutations do not partially commit their audit
row or entity write.

### Go service is unhealthy

Check:

```bash
curl -i http://localhost:8091/healthz
curl -i http://localhost:8091/readyz
./pollux doctor
```

`healthz` proves the process is running. `readyz` also proves bounded database
connectivity.

### Pollux E2E times out on a cold dev server

The current `./pollux test --suite=e2e` command forces four workers. Concurrent
first-time transformation of the large generated route graph can exceed the
30-second route assertions or temporarily enter a generic route error boundary.

Restart `pnpm dev`, wait for Vite readiness, and rerun the affected test with
one worker. During the 2026-07-20 audit, the failing anonymous and authenticated
route cases passed individually in 2.6–6.4 seconds after doing so. Treat a
serial pass plus a parallel cold-start failure as runner/concurrency evidence;
do not hide a repeatable serial functional failure by increasing timeouts.

### Emergency entity disablement

Remove the entity's generated permissions from the admin role region and
redeploy. The server will deny operations while other manager features remain
available.

Full route removal also requires deleting both generated route files and the
entity output directory, then restarting the development server. Prefer a
versioned generator/template change over manual generated-file deletion.

### Rollback

Rollback is a Git operation:

1. revert the regeneration commit or restore the template/generated paths from
   the prior manifest provenance;
2. keep the additive `generated_crud_audit` table;
3. rerun metadata, drift, contract, lint, and build gates;
4. redeploy the verified artifact.

Never repair a production generator incident by maintaining hand-only changes
inside generated output.

## Known limitations and technical debt

### Three partially divergent runtime contracts

The native, legacy-compatible, and Go outputs share metadata and authorization
concepts but not one generated service contract. Error handling, auditing,
pagination, concurrency, and mutation semantics can drift.

### No shared normalized metadata representation

Raw legacy flags are interpreted in multiple places. The standalone validator
does not produce the normalized contract consumed by every generator.

### Native cursor pagination is incomplete

Generated native routers accept and return a cursor, but do not apply the
incoming cursor to the database query.

### Native mutations lack generated audit parity

Native oRPC mutation routes do not write `generated_crud_audit` and do not
share the legacy/Go optimistic-concurrency behavior.

### Client-table legacy route remains large

`/generated/<entity>` reads up to 10,000 rows. This prevents an unbounded SQL
query but does not provide scalable transport or rendering.

### Legacy TypeScript bulk generation is not atomic

`gen-all.sh` and `gen-all-go.sh` render directly into final paths. A later
entity failure can leave earlier entities rewritten. The Go backend generator,
by contrast, stages and atomically promotes the complete output.

### Committed Go output has no drift gate

The selection suite compares two freshly generated Go trees but does not
compare the regenerated tree with Git. During the 2026-07-20 audit, it
deterministically changed the `loc`/`loca` registration order in
`generated/pollux-go/internal/app/register_gen.go` while still reporting its
repeatability check as passed.

### Drift check can overwrite working changes

The drift script checks only part of Git's dirty-state surface and uses
`git checkout --` after detected drift. Staged or untracked generated work
needs stronger protection.

### CLI machine-readable contract is inconsistent

Several commands bypass the CLI JSON envelope or mix child stdout with it.
Automation cannot safely assume the help text's universal `--json` claim.

### Manifest generation is inherently mutating

The manifest command updates `generatedAt` and the current commit even when
metadata and templates are unchanged. There is no read-only `manifest
--check` mode.

### Verification layers are not all in default CI

Go tests, backend selection, Pollux E2E, and live grant checks are available
but not part of the normal code-quality workflow.

### Pollux E2E overrides the CI worker policy

The Playwright configuration selects one worker in CI, but the Pollux CLI adds
`--workers=4`. A cold full-entity route sweep can therefore time out or enter a
transient route error boundary even when the same cases pass serially.

### The live grant test assumes an empty resource table

`scripts/e2e-grants-live.mjs` expects the pre-grant effective-permission map to
have zero keys. `loadEffectiveGrantMap()` intentionally returns all known
resource codes, including entries with no allowed action. An otherwise clean
authorization run therefore reports 17/18 when unrelated `res` fixtures exist.

### Documentation counts are hand-maintained

Spec, runbook, and CLI-skill entity/route/package counts were corrected to
55/110/67 on 2026-07-20, but they remain hand-edited numbers with no automated
check, so they can drift again after the next entity or template change.

### Synthetic fixture ships with normal entities

`fortestsonly` is described as the all-types test entity but is generated into
the same native, legacy, permission, route, and Go inventories as production
entities. Its production exposure policy is not encoded separately.

## Improvement recommendations

The following items are proposals. None should be read as implemented.

## Immediate recommendations

### Make the CLI JSON contract truthful

- **Observed gap:** wrapper commands inherit arbitrary child stdout, while
  help promises JSON for every command.
- **Proposed change:** capture child stdout/stderr when `--json` is present and
  emit one schema-stable envelope containing status, stdout lines, stderr
  lines, and command-specific data. Add CLI contract tests for every verb.
- **Benefit:** reliable agent and CI automation without ad hoc parsing.
- **Acceptance signal:** every `./pollux <verb> --json` invocation produces
  exactly one valid JSON document on stdout; diagnostics remain on stderr or
  inside the envelope.

### Generate documentation counts from one inventory

- **Observed gap:** counts were hand-corrected to 55/110/67 on 2026-07-20, but
  nothing stops them drifting again after the next entity change.
- **Proposed change:** make the manifest builder emit a small reusable
  statistics artifact or inject generated count regions into the CLI skill and
  runbook.
- **Benefit:** prevents operational instructions from drifting after an entity
  is added.
- **Acceptance signal:** one check fails CI when documented counts do not match
  `list-entities`, route inventory, and `go list ./...`.

### Make drift verification non-destructive

- **Observed gap:** `scripts/pollux/check-drift.sh` restores generated paths with
  `git checkout --` and its preflight does not fully guard staged/untracked
  changes.
- **Proposed change:** regenerate in a temporary worktree or staging directory,
  format there, and compare trees without touching the caller's working tree.
- **Benefit:** a verification command can never destroy local work.
- **Acceptance signal:** staged, unstaged, and untracked fixture changes
  survive a drift failure byte-for-byte.

### Add a read-only manifest check

- **Observed gap:** `manifest` rewrites timestamps and provenance on every run,
  and `manifest --json` is not parseable as one JSON document.
- **Proposed change:** separate `manifest build` from `manifest check`; compare
  semantic hashes in check mode and only write during an explicit build.
- **Benefit:** CI can validate provenance without generating noisy changes.
- **Acceptance signal:** `./pollux manifest check` is read-only and exits
  non-zero only when semantic inventory differs.

### Expand path-sensitive CI

- **Observed gap:** default CI omits Go, backend selection, Pollux E2E, and live
  grants.
- **Proposed change:** run Go and selection suites when Go templates or
  generator scripts change; run authenticated E2E in a service-enabled job;
  schedule the live grant suite.
- **Benefit:** failures are caught at the layer affected without making every
  unrelated pull request pay the full cost.
- **Acceptance signal:** path filters select the appropriate suites, and a
  deliberately broken Go template, backend selector, or grant rule fails CI.

### Add committed-output drift checking for Go

- **Observed gap:** two fresh Go regenerations can match while the committed Go
  artifact is stale.
- **Proposed change:** generate in staging, format, and compare the staged tree
  with `generated/pollux-go` before promotion; add a read-only CI check.
- **Benefit:** committed Go source is proven to match current templates and
  metadata.
- **Acceptance signal:** changing or reordering any committed generated Go file
  causes the drift job to fail without modifying the worktree.

### Respect the Playwright worker policy

- **Observed gap:** the Pollux E2E wrapper hardcodes four workers and overrides
  the repository's CI stability setting.
- **Proposed change:** remove the hardcoded worker count or make it an explicit
  `POLLUX_E2E_WORKERS` override that defaults to Playwright configuration.
  Pre-warm representative generated routes before a parallel deep sweep.
- **Benefit:** deterministic cold-start coverage without confusing transform
  pressure with application regressions.
- **Acceptance signal:** a clean checkout passes the full Pollux E2E suite
  repeatedly against a freshly started server in CI.

### Make the live grant suite independent of database inventory

- **Observed gap:** the pre-grant check asserts an empty map rather than
  asserting that the test user has no allowed actions.
- **Proposed change:** snapshot unrelated resource rows or filter assertions to
  the test's entity codes; assert that every pre-grant action is false. Keep
  ownership-tagged cleanup in `finally` so failures cannot leak fixtures.
- **Benefit:** repeatable security verification on developer and CI databases
  without deleting pre-existing data.
- **Acceptance signal:** the suite reports 18/18 with zero, one, or many
  unrelated resource rows and leaves the database unchanged.

### Decide the `fortestsonly` production policy

- **Observed gap:** the synthetic all-types fixture is emitted and permissioned
  like a production entity.
- **Proposed change:** either classify it as a real production entity with an
  owner, or exclude it from production route/permission/backend manifests and
  render it only in isolated fixtures.
- **Benefit:** test data structures cannot become accidental production API
  surface.
- **Acceptance signal:** its intended exposure is explicit and enforced by an
  inventory test.

## Near-term recommendations

### Introduce one versioned normalized entity contract

- **Observed gap:** native JavaScript, EJS templates, validation, manifest
  generation, and Go templates reinterpret raw fields separately.
- **Proposed change:** validate and normalize metadata once into a versioned
  intermediate representation containing types, nullability, visibility,
  mutability, system ownership, permissions, deletion, and concurrency.
- **Benefit:** removes semantic drift while keeping multiple renderers.
- **Acceptance signal:** every generator consumes the same normalized fixture,
  and no renderer reads legacy policy flags directly.

### Make legacy TypeScript generation atomic

- **Observed gap:** bulk TypeScript rendering writes directly to the final
  application tree.
- **Proposed change:** use the Go backend's staging/promote pattern per full
  generation wave or per entity, including formatting and type checks before
  promotion.
- **Benefit:** failed generation leaves a known-good tree.
- **Acceptance signal:** an injected failure in the last entity leaves all
  committed generated paths unchanged.

### Correct native pagination and add contract tests

- **Observed gap:** the incoming native cursor is not applied.
- **Proposed change:** implement a deterministic cursor predicate using a
  stable sort plus primary-key tiebreak, or replace the interface with explicit
  offset pagination.
- **Benefit:** users can traverse datasets without repeated first pages.
- **Acceptance signal:** a multi-page test returns disjoint ordered records and
  terminates with no next cursor.

### Converge native mutation guarantees

- **Observed gap:** native mutations lack transactional generated audit,
  affected-row delete checks, and optimistic concurrency parity.
- **Proposed change:** extract a shared entity service or adapt native oRPC
  routers to the hardened mutation primitives.
- **Benefit:** security and data-integrity guarantees no longer depend on which
  UI route a user opens.
- **Acceptance signal:** the same create/update/delete contract suite passes
  against native oRPC, legacy server functions, and Go REST.

### Retire or paginate the 10,000-row client route

- **Observed gap:** `/generated/<entity>` can transport and render 10,000 rows.
- **Proposed change:** make `/generated-server` canonical, add real pagination
  to the client route, or retain the client route only for explicitly small
  entities with an enforced metadata policy.
- **Benefit:** predictable database, network, memory, and browser cost.
- **Acceptance signal:** no production route returns more than the configured
  page maximum.

### Add renderer and fixture parity tests

- **Observed gap:** current selection tests prove Go backend repeatability, but
  do not comprehensively compare Node Hygen and gohygen legacy TypeScript
  output over normalized edge-case fixtures.
- **Proposed change:** add fixtures for every supported type, nullable/required
  combination, audit/system field, invalid policy, filter, and concurrency
  mode; render with both engines and compare formatted trees.
- **Benefit:** renderer upgrades cannot silently alter output.
- **Acceptance signal:** byte-identical parity tests cover the complete
  metadata feature matrix.

## Strategic recommendations

### Consolidate around one service definition

- **Observed gap:** three generators emit overlapping CRUD behavior.
- **Proposed change:** use one versioned entity contract and operation model,
  with TypeScript UI/oRPC, TanStack server-function, and Go HTTP adapters.
- **Benefit:** one place defines authorization, validation, pagination,
  concurrency, mutation, audit, and error semantics.
- **Acceptance signal:** behavioral changes are made once and verified by an
  adapter conformance suite.

### Treat generated artifacts as versioned release products

- **Observed gap:** manifests record useful hashes, but provenance is tied to a
  mutable generation command and local Git state.
- **Proposed change:** generate deterministic artifact manifests with contract
  version, generator version, metadata hash set, template tree hash, toolchain
  versions, and verification results; attach them to releases.
- **Benefit:** reproducible rollback and auditable promotion across Node,
  Worker, and Go deployments.
- **Acceptance signal:** a clean checkout can reproduce the same artifact hash
  from a release manifest.

### Define lifecycle and ownership per entity

- **Observed gap:** all valid metadata files automatically enter most
  generated surfaces, including the synthetic fixture.
- **Proposed change:** add an explicit entity lifecycle registry with owner,
  environments, enabled paths, sensitivity class, deletion policy, and
  deprecation state.
- **Benefit:** generation inventory becomes a governed product surface rather
  than filesystem discovery alone.
- **Acceptance signal:** new entities cannot enter production manifests without
  owner and lifecycle metadata.

## Source-of-truth index

| Concern | Canonical source |
| --- | --- |
| Repository operating rules | `CLAUDE.md` |
| Entity metadata | `json-files/*.json` |
| Metadata validation | `scripts/pollux/validate-metadata.mjs` |
| Agent-facing Pollux CLI | `pollux`, `scripts/pollux/cli.mjs` |
| Native generator | `scripts/gen-entity.mjs` |
| Active legacy/Go templates | `_templates/pollux/` |
| Frozen legacy archive | `_templates/pollux-archive/` |
| Legacy Node bulk wrapper | `gen-all.sh` |
| Legacy gohygen bulk wrapper | `gen-all-go.sh` |
| Backend selector | `generate-pollux.sh` |
| Go backend generation | `gen-all-go-backend.sh` |
| Legacy generated runtime | `src/server/generated-crud/` |
| Public CRUD envelope | `src/lib/generated-crud.ts` |
| Effective permissions | `src/server/permissions/grant-resolver.ts` |
| Go authz bridge | `src/server/routers/authz.ts` |
| Audit schema | `src/server/db/schema/generated-crud-audit.ts` |
| Multi-skeleton SPECs | `docs/specs/skeletons/` |
| Skeleton registry + manifests | `skeletons/registry.json`, `skeletons/*/skeleton.json` |
| Skeleton/workspace modules | `scripts/pollux/skeletons/` |
| Normalized entity model | `scripts/pollux/model/` |
| Target adapter protocol + adapters | `scripts/pollux/targets/` |
| Shared standalone runtime/UI/BFF templates | `_templates/pollux-targets/shared/` |
| Per-target templates | `_templates/pollux-targets/{nextjs,react-router,astro-react}/` |
| v2 API contract fixture + mock server | `test-fixtures/pollux/api/` |
| v2 contract suite | `scripts/pollux/contract/contract.suite.mjs` |
| Golden fixtures (`.golden` suffix, hook-exempt) | `test-fixtures/pollux/golden/` |
| Workspace matrix harness | `scripts/pollux/test/workspace-matrix.mjs` |
| Authorization host (PKCE/JWT/JWKS) | `src/server/pollux-auth/`, `src/routes/api/pollux.*.ts` |
| Skeletons runbook | `docs/operations/pollux-skeletons-runbook.md` |
| Go backend v2 ops doc | `docs/operations/pollux-go-backend.md` |
| Legacy generated output | `src/app/(private)/generated/` |
| Legacy route adapters | `src/routes/generated*.tsx` |
| Native generated features | `src/features/<entity>/` |
| Native generated routers | `src/server/routers/<entity>.ts` |
| Native generated routes | `src/routes/manager/` |
| Go generated output | `generated/pollux-go/` |
| Drift gate | `scripts/pollux/check-drift.sh` |
| Manifest builder | `scripts/pollux/build-manifest.mjs` |
| Rollout manifest | `docs/operations/pollux-rollout-manifest.json` |
| Rollout inventory | `docs/operations/pollux-rollout-inventory.md` |
| Runtime operations | `docs/operations/pollux-generated-crud.md` |
| Incident/rollback runbook | `docs/operations/pollux-runbook.md` |
| Intended residual contracts | `docs/specs/README.md` and its indexed SPEC files |
| Release CI | `.github/workflows/code-quality.yml` |
| Cross-model plugin package | `plugins/pollux-ui/` (specs: `docs/specs/ai-plugins/`) |
| Plugin CI | `.github/workflows/pollux-plugin.yml` |

## Cross-model plugin package (`plugins/pollux-ui/`)

SPEC set: `docs/specs/ai-plugins/SPEC-001` … `SPEC-007`; approved design:
`docs/superpowers/specs/2026-08-11-pollux-cross-model-plugin-design.md`.

Architecture: one neutral, versioned capability manifest
(`pollux.plugin.json`, schema `pollux.plugin.schema.json`) built from
`manifest.config.json` + live Git provenance; a generated, hash-addressed
resource snapshot (`resources/`, described by `resources/catalog.json` against
`resources/catalog.schema.json`); five shared Agent Skills
(`skills/pollux-{inspect,create-workspace,apply-layout,generate-crud,verify}/SKILL.md`,
portable frontmatter floor: `name` + `description` only); and two generated
host projections (`.codex-plugin/plugin.json`,
`.claude-plugin/plugin.json`, plus `skills/*/agents/openai.yaml`). All
builders/validators are zero-dependency Node scripts under
`plugins/pollux-ui/scripts/`.

Commands:

```bash
node plugins/pollux-ui/scripts/build-manifest.mjs       # neutral manifest; normalized digest excludes builtAt
node plugins/pollux-ui/scripts/build-resources.mjs      # staged + atomic snapshot; catalog.json written last
node plugins/pollux-ui/scripts/build-projections.mjs    # [--check] drift-gates generated host manifests
node plugins/pollux-ui/scripts/validate-package.mjs     # schema, hashes, packaged bytes, skill frontmatter, projection parity
node plugins/pollux-ui/scripts/verify-source-drift.mjs  # fails with exact resource ID + changed path
node plugins/pollux-ui/scripts/validate-hosts.mjs       # fail-closed current Codex + Claude validation
node plugins/pollux-ui/scripts/evaluate-triggers.mjs --host=codex|claudeCode
node plugins/pollux-ui/scripts/evaluate-workflows.mjs --host=codex|claudeCode
pnpm pollux:plugin:workflows:artifacts               # 9 temporary-fixture artifact cases
node plugins/pollux-ui/scripts/build-release.mjs        # release.json + reproducible dist tarball; SOURCE_DIRTY gate
node --test "plugins/pollux-ui/tests/*.unit.spec.mjs"   # package suite (manifest/catalog/paths/projections/evals)
pnpm pollux:plugin:release:test                      # duplicate clean builds + extracted validation
```

Current evidence (2026-08-11): neutral build and the full package suite pass; Codex
0.147.0 compatibility + all five skill validators pass; Claude Code 2.1.220
strict validation passes with no warnings; generator unit (194), backend
selection (10), Go tests/vet, regeneration drift, all skeleton validation, and
nextjs/remix/astro build/runtime matrices pass. Clean duplicate release builds
produced byte-identical archives.

Current status (release stage 4 — cross-model experimental): CI has all six
SPEC-006 jobs and fails closed. On 2026-08-11, Codex CLI 0.147.0 and Claude
Code 2.1.220 each passed the complete 17-case trigger matrix (precision 1,
recall 1, unauthorized mutation false positives 0) and all 9 model-selected
artifact workflows, including legacy TypeScript, Go, standalone, and failure
preservation. Evaluators can write prompt-free, digest-bound evidence with
`--evidence=<path>`; CI uploads all four reports. `build-release.mjs
--evidence-dir=<dir>` validates them before recording Stage 4. Native
marketplace installation and rollback to a prior plugin artifact remain
unproven, so Stage 5 is blocked. No MCP, hooks, marketplace publication, or
network capability.
Rollback: reinstall the prior `dist/pollux-ui-<version>.tar.gz`; never edit an
installed plugin cache. Versioning/governance: `plugins/pollux-ui/VERSIONING.md`.

## KB maintenance checklist

Update this file when any of the following changes:

(The plugin snapshot under `plugins/pollux-ui/resources/` embeds this file as
`reference.pollux-kb`; after editing the KB, rebuild the snapshot with
`pnpm pollux:plugin` or `verify-source-drift` will fail.)

- a metadata entity is added, removed, or becomes a stub;
- a template group or renderer changes;
- native or legacy output paths change;
- permission precedence or grant tables change;
- public error codes or result envelopes change;
- audit schema or logging fields change;
- pagination, filtering, concurrency, or deletion semantics change;
- a generator becomes atomic or changes formatting order;
- Pollux CLI verbs or JSON contracts change;
- CI adds or removes a verification layer;
- Node, Cloudflare, or Go deployment boundaries change.

Refresh evidence with:

```bash
./pollux list-entities --json
./pollux list-templates --json
pnpm pollux:validate
pnpm pollux:drift
./pollux test --suite=unit
./pollux test --suite=selection
./pollux test --suite=go
pnpm lint:ts
```

Run live E2E and grant checks when the required services are available.

Before committing a KB refresh:

1. compare every count with executable inventory;
2. confirm every current-source path exists;
3. distinguish historical spec language from runtime truth;
4. keep proposals under the recommendation headings;
5. avoid hand-editing generated manifests or output;
6. run `git diff --check`;
7. commit the KB with the generator/template changes that made it necessary.
