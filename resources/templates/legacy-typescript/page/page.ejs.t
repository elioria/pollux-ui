---
to: src/app/(private)/generated/<%= h.changeCase.param(name) %>/page.tsx
force: true
---
import { getRouteApi } from '@tanstack/react-router';
import { Suspense } from 'react';

import PageContainer from '@/components/layout/page-container';

import { CrudCapabilitiesProvider } from '@/features/generated-crud/capabilities';

import { columns } from './data-table-components/columns';
import { DataTable } from './data-table-components/data-table';

const route = getRouteApi('/generated/<%= h.changeCase.param(name) %>');

export default function <%= h.inflection.classify(name) %>Page() {
  const { rows, capabilities } = route.useLoaderData();

  return (
    <PageContainer scrollable={true}>
      <div className="pollux-generated-page min-w-0 space-y-4 md:space-y-5">
        <CrudCapabilitiesProvider capabilities={capabilities}>
          <Suspense
            fallback={
              <div className="flex min-h-72 items-center justify-center rounded-2xl border bg-card text-sm text-muted-foreground shadow-sm">
                Carregando dados...
              </div>
            }
          >
            <DataTable columns={columns} data={rows} />
          </Suspense>
        </CrudCapabilitiesProvider>
      </div>
    </PageContainer>
  );
}
