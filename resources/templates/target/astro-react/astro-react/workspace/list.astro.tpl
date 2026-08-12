---
import Layout from '../../../layouts/Layout.astro';
import { __PASCAL__ListIsland } from '../../../generated/pollux/__ENTITY__/island';
import { __ENTITY__Spec } from '../../../generated/pollux/__ENTITY__/spec';
import { parseListQuery } from '../../../lib/pollux/runtime/query';

// Astro owns page metadata + the server shell; the island (client:load) owns
// every interaction. The initial query state is validated SERVER-SIDE from
// the URL (single source of truth), so direct requests, reloads and shared
// URLs render the same list state after hydration.
const initialQuery = parseListQuery(Astro.url.searchParams, __ENTITY__Spec);
---

<Layout title={__ENTITY__Spec.titles.list}>
  <section class="space-y-4">
    <noscript>
      <p
        class="rounded-md border border-border bg-card p-3 text-sm text-muted-foreground"
      >
        Esta página requer JavaScript para listar e modificar registros.
      </p>
    </noscript>
    <__PASCAL__ListIsland client:load initialQuery={initialQuery} />
  </section>
</Layout>
