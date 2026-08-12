---
to: src/routes/generated-server.<%= h.changeCase.param(name) %>.tsx
force: true
---
<%
let fields = [];
if (data && data.attributes && data.attributes.length) {
    fields = data.attributes.map(function (f) {
      return { ...f, camel: h.camelField(f.name.trim()), dataType: f.dataType.trim().toLowerCase() };
    });
}
// tablecn simple-mode filters: one URL param per filterable column.
const facetCols = fields.filter(function (f) { return f.grdIsinGrid === true && f.dataType === 'boolean'; });
-%>
import { createFileRoute, stripSearchParams } from '@tanstack/react-router';
import { zodValidator } from '@tanstack/zod-adapter';
import { z } from 'zod';

import { get<%= h.changeCase.pascal(name) %>Capabilities } from '@/app/(private)/generated/<%= h.changeCase.param(name) %>/actions/entityActions';
import { get<%= h.inflection.pluralize(h.changeCase.pascal(h.customPluralize(name))) %>Page } from '@/app/(private)/generated/<%= h.changeCase.param(name) %>/serverpage/serverActions';
import { DataTableSkeleton } from '@/app/(private)/generated/<%= h.changeCase.param(name) %>/serverpage/data-table-skeleton';
import <%= h.inflection.classify(name) %>ServerPage from '@/app/(private)/generated/<%= h.changeCase.param(name) %>/serverpage/server-page';
import { GuardAuthenticated } from '@/features/auth/guard-authenticated';
import { GeneratedRouteError } from '@/features/generated-crud/generated-route-error';
import { unwrapCrudLoader } from '@/features/generated-crud/loader';

const defaultSearch = {
  page: 1,
  perPage: 10,
  sort: '',
  q: '',
<% facetCols.forEach(function (f) { -%>
  <%= f.camel %>: '',
<% }) -%>
};

const zSortItem = z.object({ id: z.string(), desc: z.boolean() });

// Parse the tablecn sort encoding: ?sort=[{"id":"name","desc":true}]
// Bounded before JSON.parse; invalid input falls back to no sort.
function parseSort(value: string) {
  if (!value || value.length > 500) return [];
  try {
    return z.array(zSortItem).max(3).catch([]).parse(JSON.parse(value));
  } catch {
    return [];
  }
}

// tablecn-style URL state — the URL is the single source of truth; the
// loader re-runs on every search change (page, perPage, sort, q, filters).
export const Route = createFileRoute('/generated-server/<%= h.changeCase.param(name) %>')({
  validateSearch: zodValidator(
    z.object({
      page: z.coerce.number().int().min(1).max(1_000_000).catch(1),
      perPage: z.coerce.number().int().min(1).max(100).catch(10),
      sort: z.string().max(500).catch(''),
      q: z.string().max(200).catch(''),
<% facetCols.forEach(function (f) { -%>
      <%= f.camel %>: z.string().max(200).catch(''),
<% }) -%>
    })
  ),
  search: {
    middlewares: [stripSearchParams(defaultSearch)],
  },
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    const [result, capabilities] = await Promise.all([
      get<%= h.inflection.pluralize(h.changeCase.pascal(h.customPluralize(name))) %>Page({
        data: {
          page: deps.page,
          perPage: deps.perPage,
          sort: parseSort(deps.sort),
          q: deps.q,
<% if (facetCols.length) { -%>
          filters: [
<% facetCols.forEach(function (f) { -%>
            { id: '<%= f.camel %>', value: deps.<%= f.camel %> ? deps.<%= f.camel %>.split(',') : [] },
<% }) -%>
          ].filter((f) => f.value.length > 0),
<% } else { -%>
          filters: [],
<% } -%>
        },
      }),
      get<%= h.changeCase.pascal(name) %>Capabilities(),
    ]);
    return { ...unwrapCrudLoader(result, '/generated-server/<%= h.changeCase.param(name) %>'), capabilities };
  },
  component: RouteComponent,
  pendingComponent: () => <DataTableSkeleton />,
  errorComponent: GeneratedRouteError,
});

function RouteComponent() {
  return (
    <GuardAuthenticated permissionApps={['manager']}>
      <<%= h.inflection.classify(name) %>ServerPage />
    </GuardAuthenticated>
  );
}
