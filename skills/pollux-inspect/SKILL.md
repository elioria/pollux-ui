---
name: pollux-inspect
description: Inspect Pollux generators, templates, layouts, skeletons, and support status before generation or layout work. Use when a user asks what Pollux can generate, whether a Next.js, React Router, Astro, or TanStack Start target is production-ready or supported, which target or template applies, or what checks are required.
---

# pollux-inspect

Read-only discovery. This skill never writes files, never mutates Git state,
and never infers support from the presence of a directory. Every claim in the
output must come from a command, a manifest, or the packaged resource catalog.


## Generator resolution

Commands below run from the generator root — resolve it in this order:
1. a start-ui-web checkout the user is working in (full surface);
2. the plugin's bundled snapshot at `${CLAUDE_PLUGIN_ROOT}/generator`
   (standalone surface only — run `pnpm install` there once). From an empty
   folder this is the default; state which root you are using.

## Preconditions

- You are inside a checkout that contains the `./pollux` CLI (repo root has
  `pollux`, `scripts/pollux/cli.mjs`, `_templates/pollux/`, `skeletons/`).
- If any precondition fails, stop with `WORKFLOW_PRECONDITION_FAILED` and name
  the missing piece. Do not improvise a substitute inspection.

## Steps

1. Record Git state:
   `git rev-parse --abbrev-ref HEAD` and `git status --porcelain`.
   List dirty paths verbatim; never stash, reset, or format them.
2. Discover generator surfaces with machine-readable commands:
   - `./pollux list-entities --json` — valid metadata entities vs skipped stubs.
   - `./pollux list-templates --json` — legacy template groups under
     `_templates/pollux`.
   - `./pollux list-skeletons --json` — registered skeletons and status.
   - `./pollux describe-skeleton <name> --json` — per-target support, including
     `generatorSupport.pollux` and `generatorSupport.targetAdapter`.
3. Classify the generator surface the user means:
   - native TanStack `/manager` verticals (`scripts/gen-entity.mjs` feature
     code — invoke and verify only, not a template tree);
   - legacy TypeScript `/generated` + `/generated-server`
     (`_templates/pollux/{page,serverpage,form-fields}`);
   - standalone Go backend (`_templates/pollux/{go-service,go-entity}`);
   - standalone framework targets (`_templates/pollux-targets/*` +
     `skeletons/{nextjs,remix,astro,tanstack-start}`).
4. Resolve required resource IDs from `resources/catalog.json` in this plugin
   package. A capability is only executable when every required resource ID
   exists and `supportStatus` is not below the capability's
   `minSupportStatus` (see `pollux.plugin.json`).
5. For an existing workspace, inspect provenance instead of guessing:
   read `<workspace>/.pollux/workspace.json` and run
   `./pollux check-generated --workspace=<path>` when ownership matters.

## What you must not infer

- Template presence does not prove support. Only `skeleton.json`
  `generatorSupport` and CI evidence do.
- `start-ui-vite` is a reference skeleton (`status: reference`): it cannot be
  copied by `new-workspace`.
- `nextjs`, `remix` (react-router), `astro`, and `tanstack-start` targets are **experimental**
  (`generatorSupport.pollux: false`). Say so explicitly.
- Target names and skeleton aliases are not interchangeable without manifest
  evidence (`remix` skeleton ↔ `react-router` target adapter).
- Generated output is never source of truth.

## Output contract

Report, in order:

1. **Surface** — which of the four generator surfaces applies and why.
2. **Target/status** — exact skeleton name, target adapter ID/version, support
   status (`supported` | `experimental` | `reference-only`).
3. **Dirty paths** — verbatim list; state that they will be preserved.
4. **Proposed operation** — skill to invoke next, exact affected paths, and
   required resource IDs from the catalog.
5. **Verification gates** — the commands the follow-up skill must run.

## Failure behavior

- Unknown skeleton or entity → stop, list the valid options from the CLI.
- Ambiguous user goal → ask exactly one bounded question (e.g. "legacy
  /generated pages or a standalone Next.js workspace?"). Never start a
  mutation from an ambiguous prompt.
- Any path escaping the repo/workspace/plugin root → `PATH_UNSAFE`, stop.

## References

Load only when the selected surface needs them:

- `resources/references/POLLUX-GEN-KB.md` — generator knowledge base.
- `resources/references/operations/pollux-skeletons-runbook.md` — skeleton and
  workspace operations.
- `resources/references/skeletons/README.md` — skeleton contracts.
- `resources/catalog.json` — resource IDs, digests, compatibility.
