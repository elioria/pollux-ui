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
- All three boilerplate targets are **experimental** Pollux generator targets.
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

## Output contract

1. **Created** — absolute destination path and skeleton used.
2. **Provenance** — contents summary of `.pollux/workspace.json`.
3. **Install** — the package-manager command (e.g. `pnpm install
   --frozen-lockfile`) from the skeleton manifest.
4. **Verify** — the target verification command, typically
   `node scripts/pollux/test/workspace-matrix.mjs --target <nextjs|remix|astro|tanstack-start>`
   from the source repo, or the skeleton's own `test`/`build` commands.
5. **Status** — repeat that the target is experimental until its CI matrix is
   green.

## Failure behavior

- Failed precondition → no staging tree, no partial destination, stable error
  code, stop.
- Do not delete or overwrite any pre-existing directory you did not create in
  this run.

## References

- `resources/references/skeletons/README.md` — skeleton contracts.
- `resources/references/operations/pollux-skeletons-runbook.md` — workspace
  operations and recovery.
