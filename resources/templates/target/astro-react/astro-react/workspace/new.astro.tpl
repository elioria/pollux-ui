---
import Layout from '../../../layouts/Layout.astro';
import { __PASCAL__CreateIsland } from '../../../generated/pollux/__ENTITY__/island';
import { __ENTITY__Spec } from '../../../generated/pollux/__ENTITY__/spec';
---

<Layout title={__ENTITY__Spec.titles.create}>
  <section class="mx-auto max-w-2xl space-y-4">
    <noscript>
      <p
        class="rounded-md border border-border bg-card p-3 text-sm text-muted-foreground"
      >
        Este formulário requer JavaScript para criar registros.
      </p>
    </noscript>
    <__PASCAL__CreateIsland client:load />
    <p class="text-sm">
      <a
        href="/manager/__PLURAL__"
        class="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
      >
        ← Voltar para a lista
      </a>
    </p>
  </section>
</Layout>
