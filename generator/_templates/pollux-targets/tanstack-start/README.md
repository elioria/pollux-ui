# Pollux target templates — tanstack-start (SPEC-008)

Static sources for the `tanstack-start` adapter
(`scripts/pollux/targets/tanstack-start/adapter.mjs`). Token-substituted
files carry the `.tpl` suffix (`__ENTITY__`, `__PASCAL__`, `__PLURAL__`,
`__PK__`, `__SUBJECT_FIELD__`, `__TITLE_*_JSON__`); plain `.ts` files are
copied verbatim. Shared runtime/UI come from `_templates/pollux-targets/shared`.

Workspace layout produced per entity (skeleton `skeletons/tanstack-start`):

- `src/routes/manager/<plural>/{index,new,$id.edit}.tsx` — file-based routes;
  the framework's route-tree generator registers them (no handwritten route
  registry).
- `src/generated/pollux/<entity>/spec.ts` + `nav/<entity>.ts` +
  `registry/<entity>.ts` — adapter-built fragments.
- Shared (owned by the FIRST generated entity):
  `src/routes/api/pollux/$.ts` (same-origin proxy),
  `src/routes/api/pollux/auth.$action.ts` (BFF auth),
  `src/lib/pollux/{base-url,use-pollux-mutation,bff-core.server}.ts`,
  `src/lib/pollux/runtime/*`, `src/components/pollux/*`.

Target notes:

- TanStack Start has no route actions: mutations call the shared entity
  client from the browser and pages revalidate with `router.invalidate()`.
- Loaders are isomorphic; `base-url.ts` resolves the proxy origin
  (`window.location.origin` client-side; `POLLUX_PUBLIC_ORIGIN` or loopback
  `PORT` during SSR). SSR data fetch therefore authenticates only in
  dev-bearer mode (documented limitation).
- The TanStack Router default search parser JSON-decodes values; templates
  normalize search back to the canonical string form before
  `parseListQuery`.

After ANY change here: `node scripts/pollux/targets/tanstack-start/build-golden.mjs`,
review the diff, commit fixture + change together.
