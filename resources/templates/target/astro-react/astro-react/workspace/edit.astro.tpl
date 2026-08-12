---
import Layout from '../../../../layouts/Layout.astro';
import { __PASCAL__EditIsland } from '../../../../generated/pollux/__ENTITY__/island';
import { __ENTITY__Spec } from '../../../../generated/pollux/__ENTITY__/spec';

// The id is a normalized route segment; anything unsafe 404s server-side
// before any client code runs.
const id = Astro.params.id ?? '';
if (!/^[A-Za-z0-9._-]{1,128}$/.test(id)) {
  return new Response(null, { status: 404 });
}
---

<Layout title={__ENTITY__Spec.titles.update}>
  <section class="mx-auto max-w-2xl space-y-4">
    <noscript>
      <p
        class="rounded-md border border-border bg-card p-3 text-sm text-muted-foreground"
      >
        Este formulário requer JavaScript para editar registros.
      </p>
    </noscript>
    <__PASCAL__EditIsland client:load id={id} />
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
