# Skeletons

Multi-skeleton infrastructure for the Pollux solution. A **skeleton** is a
boilerplate application shell — main layout, design system, framework wiring —
that generated entity code can target. The solution supports more than one
skeleton so the same entity metadata (`json-files/`) can eventually be rendered
into different frameworks.

## Registry

`registry.json` lists every skeleton. Each entry points to a directory
containing a `skeleton.json` manifest. CLI:

```bash
./pollux list-skeletons [--json]
./pollux describe-skeleton <name> [--json]
./pollux validate-skeletons [--json]
```

## Support matrix (SPEC-007)

Support labels mirror each skeleton's `skeleton.json` `generatorSupport`
exactly; a target is promoted to **supported** (`pollux: true`) only in the
same change that makes its CI matrix leg green and required.

| Skeleton | Framework | Generator target (adapter) | Pollux support | Create + generate | Verification (executable) |
|---|---|---|---|---|---|
| `start-ui-vite` | React + Vite + TanStack Start | in-repo generators (`gen-entity.mjs`, `_templates/pollux`) | **supported** (reference, in place) | `./pollux gen-entity <e>` / `./pollux gen-all` | `./pollux check` · `./pollux test --suite=unit` · CI `release-readiness` |
| `nextjs` | Next.js 15 App Router | `nextjs@0.1.0` (SPEC-004) | **experimental** (`pollux: false`) | `./pollux new-workspace nextjs --dir=<path>` then `./pollux generate --workspace=<path> --entity=<e>` | `node scripts/pollux/test/workspace-matrix.mjs --target nextjs` · CI `pollux-matrix (nextjs)` |
| `remix` | React Router 7 (framework mode) | `react-router@0.1.0` (SPEC-005) | **experimental** (`pollux: false`) | `./pollux new-workspace remix --dir=<path>` then `./pollux generate --workspace=<path> --entity=<e>` | `node scripts/pollux/test/workspace-matrix.mjs --target remix` · CI `pollux-matrix (remix)` |
| `astro` | Astro 5 + React islands (Cloudflare server output) | `astro-react@0.1.0` (SPEC-006) | **experimental** (`pollux: false`) | `./pollux new-workspace astro --dir=<path>` then `./pollux generate --workspace=<path> --entity=<e>` | `node scripts/pollux/test/workspace-matrix.mjs --target astro` · CI `pollux-matrix (astro)` |

`reference` = the skeleton lives elsewhere (here: the repo root) and is
described, not copied. `boilerplate` = the directory IS the app; copy it out
and `pnpm install && pnpm dev`.

Verification claims here are never dated manual statements: each matrix
command above creates a fresh workspace in an empty temp directory,
generates the `rich-valid` fixture entity, installs with the committed
lockfile, runs typecheck/tests/build offline, proves the workspace has no
source-checkout dependency (`scripts/pollux/test/no-source-dependency.mjs`),
then boots the mock v2 API (`test-fixtures/pollux/api/mock-server.mjs`) plus
the app and asserts the SSR list page, the proxied v2 list and the proxy's
client-credential strip. The `pollux-matrix-gate` CI job fails if any leg
fails or is skipped.

## skeleton.json contract (schemaVersion 1)

Registry and manifests are versioned (SPEC-001): `registry.json` and every
`skeleton.json` declare `"schemaVersion": 1`; unknown versions are rejected.
Validation lives in `scripts/pollux/skeletons/{schema,registry}.mjs` (stable
error codes `REGISTRY_INVALID`, `MANIFEST_INVALID`, ...).

Required fields:

- `schemaVersion` — must be `1`.
- `version` — manifest version string (recorded in workspace provenance).
- `name` — kebab-case id, must match the registry entry and directory name.
- `displayName`, `framework`, `language`, `status` (`reference` |
  `boilerplate`) — `framework`/`status` must agree with the registry entry.
- `root` — app root relative to the skeleton dir. Boilerplate roots must stay
  inside the skeleton directory (no `..`, no absolute paths, never the repo
  root). Only a `reference` skeleton may point outside, and it must declare
  the same value in an explicit `referenceRoot` contract (`start-ui-vite`
  declares `"root": "../..", "referenceRoot": "../.."`).
- `packageManager` — only pnpm is supported; boilerplates must pin a version
  (`pnpm@10.24.0`) that exactly matches the Corepack `packageManager` field in
  the skeleton's `package.json`.
- `commands.dev`, `commands.build` — plain argv strings (no shell
  metacharacters); the skeleton `package.json` must have `dev` and `build`
  scripts and a valid npm package name.
- `entrypoints` — at minimum `layout`, `globalStyles`, `home` (paths relative
  to `root`); each must exist, be a real file, and not escape the skeleton
  root via symlinks.
- `designSystem` — `tokens` (path to the tokens stylesheet), `display`
  (never serif), `body`, `tailwind` (major version, number). The global
  stylesheet must `@import` the tokens file.
- `generatorSupport.pollux` — whether the Pollux generators emit into it
  today. When `true`, a `targetAdapter` with `id` and `capabilityLevel` is
  required (placeholder identities are forbidden).

## Design-system contract

`_shared/design-tokens.css` is the single source of truth (extracted from the
`start-ui-vite` skeleton's `src/styles/app.css`). Every boilerplate skeleton
ships a verbatim copy (e.g. `src/styles/tokens.css`) imported from its global
stylesheet after `@import 'tailwindcss'`. Rules:

- Display/headings: **Montserrat**. Body: clean sans (Inter). Mono for
  figures. **Never serif fonts.**
- Components consume only the semantic vars (`--background`, `--primary`,
  `--sidebar-*`, ...); raw scales stay internal to the tokens file.
- Dark mode is class-based (`.dark` on `<html>`).

When tokens change: edit `_shared/design-tokens.css`, then re-copy into each
boilerplate skeleton (`validate-skeletons` fails on drift).

## Layout contract

Every skeleton renders the same admin shell: a left sidebar (brand block +
nav: Dashboard, Entidades, Administração) and a topbar (page title +
theme toggle), content area on the app canvas. UI language is Portuguese.

## Lockfile policy

Each boilerplate commits its own `pnpm-lock.yaml` (generated with
`pnpm install --lockfile-only --ignore-workspace` inside the skeleton dir) and
pins pnpm via the `packageManager` field. The lockfile IS copied into new
workspaces, which install with `pnpm install --frozen-lockfile` — builds are
reproducible from the committed lockfile, not from whatever registry state
exists at copy time. After changing a skeleton's dependencies, regenerate its
lockfile and commit both.

## Starting a new workspace from a skeleton

```bash
./pollux new-workspace <skeleton> --dir=<path> [--name=<pkg>] [--json]
# both --dir=<path> and `--dir <path>` (same for --name) are accepted
./pollux new-workspace nextjs --dir=../pk-admin-next
cd ../pk-admin-next && pnpm install --frozen-lockfile && pnpm dev
```

Creation is a staged, atomic transaction (`scripts/pollux/skeletons/`
`workspace.mjs`): the skeleton is validated first, files are copied into a
staging directory in the destination's parent, the package is renamed and
provenance written, the staged tree is re-validated, and only then is staging
atomically renamed into place. Any failure rolls back completely — no partial
workspace, no staging leftovers. There is no `--force`: recovering a
non-empty destination is an explicit user operation.

Rules and behavior:

- destination must be absent or an empty directory
  (`DESTINATION_NOT_EMPTY` / `DESTINATION_NOT_DIRECTORY` otherwise);
- excludes `node_modules`, VCS dirs and build artifacts, but **includes** the
  committed `pnpm-lock.yaml`; drops `skeleton.json` (the copy is a plain app);
- sets `package.json` `name` to the target dir name (override with `--name`);
  invalid npm names are rejected before anything is written
  (`PACKAGE_NAME_INVALID`);
- refuses `reference` skeletons (`SKELETON_NOT_COPYABLE` — for
  `start-ui-vite`, clone the repo);
- symlinks escaping the skeleton are rejected (`COPY_FAILED`);
- `--json` failures are a single `{ok:false, code, message, details?}` object;
  successes keep the `next` string array and add a structured `steps` array of
  executable `{cwd, command, args}` records; human output shell-quotes the
  destination in the copyable `cd` command.

### Provenance (`.pollux/workspace.json`)

Every workspace records where it came from: `schemaVersion`, skeleton name,
`framework`, manifest version, repo-relative `sourcePath`, source git
revision, CLI version, ISO creation timestamp, `metadataModelVersion`
(placeholder `"0"` until SPEC-002), a `sha256` digest covering the registry,
the selected manifest, the copied skeleton tree and the shared token files,
and a `dirty` flag set when those inputs differ from git `HEAD` (a dirty
workspace is not reproducible from the revision alone — the CLI warns).
`targetStatus` is `experimental` for the three current boilerplates (their
manifests declare `generatorSupport.experimental: true` with a
`targetAdapter`); it becomes `supported` only when a manifest flips
`generatorSupport.pollux` to `true`. No absolute source paths are recorded.

Version gates: `plan`/`generate` reject a workspace whose recorded
`metadataModelVersion` differs from the generator's model version, whose
`targetAdapter.id` matches no registered adapter, or whose `targetStatus`
allows no generation — before any write, with stable error codes
(`PLAN_INVALID`, `TARGET_UNSUPPORTED`, `TARGET_MISMATCH`). Exercised by
`node --test scripts/pollux/test/version-compat.unit.spec.mjs`.

Boilerplate verification is executable, not dated: run
`node scripts/pollux/test/workspace-matrix.mjs --target nextjs|remix|astro`
(see the support matrix above and `docs/operations/pollux-skeletons-runbook.md`).

## Adding a skeleton

1. Create `skeletons/<name>/` with a `skeleton.json` (schemaVersion 1, see
   contract above) and (for boilerplates) the full app source, including a
   verbatim copy of `_shared/design-tokens.css` imported from the global
   stylesheet.
2. For boilerplates: pin `packageManager` in `package.json` and commit a
   `pnpm-lock.yaml` (`pnpm install --lockfile-only --ignore-workspace`).
3. Register it in `registry.json`.
4. Run `./pollux validate-skeletons` and
   `./pollux test --suite=skeletons`.
