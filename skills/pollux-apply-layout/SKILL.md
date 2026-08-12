---
name: pollux-apply-layout
description: Apply or port the Pollux admin layout — sidebar, topbar, design tokens, theme behavior, content canvas — into a supported framework target. Use when a user asks to reuse the Pollux shell, port the layout, or sync design tokens.
---

# pollux-apply-layout

Apply a Pollux admin shell to one explicit framework target. Layouts are
complete shell boundaries — root layout, global styles, token import,
sidebar, topbar, navigation host, content canvas, theme behavior — never
isolated markup. Shared visual semantics come from `design.tokens`
(`skeletons/_shared/design-tokens.css`); host source stays
framework-specific.

## Preconditions

- Explicit user request naming the target: `start-ui-vite`, `nextjs`,
  `react-router` (remix skeleton), or `astro`.
- Run `pollux-inspect` first (or reproduce its read-only steps) so dirty
  paths, skeleton provenance, and support status are known.
- Verify the layout resource exists in `resources/catalog.json` and its
  digest matches (`node plugins/pollux-ui/scripts/verify-source-drift.mjs`
  when working from the source repo).

## Layout resources

| Target | Resource ID | Root entrypoint |
| --- | --- | --- |
| start-ui-vite | `layout.start-ui-vite` | `src/routes/__root.tsx` + `src/layout/manager/layout.tsx` |
| nextjs | `layout.nextjs` | `app/layout.tsx` |
| react-router | `layout.react-router` | `app/root.tsx` |
| astro | `layout.astro` | `src/layouts/Layout.astro` |

`start-ui-vite` is the live reference repo: read it as the canonical shell,
do not copy its framework integration into another target.

## Steps

1. Classify every file you will touch before editing:
   - `handwritten-host` — shell/registry integration you may edit;
   - `generator-owned` — recorded in `.pollux/generated.json`; change only
     through regeneration;
   - `generated` — has an ownership header; never hand-edit;
   - `unrelated` — never stage, rewrite, or format.
2. Select exactly one target layout resource plus `design.tokens`.
3. Apply the shell: layout entrypoint, global stylesheet importing the
   tokens, sidebar, topbar, navigation registry host, content canvas, and
   light/dark theme behavior. Keep Montserrat (display) / Inter (body) and
   Portuguese default labels.
4. Preserve behavior: routes, loaders, actions, handlers, authorization, form
   semantics, and generated navigation registries stay intact unless the user
   explicitly asked for a behavior change.
5. Never flatten targets: no Next.js `next/*` imports in React Router or
   Astro code, no TanStack router APIs outside `start-ui-vite`, no crossing
   of framework boundaries in either direction.

## Verification (all required)

- Light and dark themes render and persist after reload.
- Responsive shell: mobile navigation and desktop sidebar both work.
- Keyboard navigation and semantic landmarks intact.
- Portuguese default labels present.
- `./pollux validate-skeletons` when skeleton files changed (token drift
  gate).
- Target build/typecheck from the skeleton manifest `commands`
  (e.g. `pnpm build` in the workspace).

## Failure behavior

- Experimental target → report `TARGET_EXPERIMENTAL` status, proceed only
  with explicit user acknowledgment.
- Unknown target or ambiguous goal → one bounded question, no edits.
- Ownership conflict on generator-owned files → stop; name the files; the fix
  is regeneration, not editing.

## References

Load only the selected target's material from the plugin package:

- `resources/layouts/<target>/` — packaged shell sources.
- `resources/design-system/design-tokens.css` — token contract.
- `resources/references/CLAUDE.md` — layout and ownership rules.
