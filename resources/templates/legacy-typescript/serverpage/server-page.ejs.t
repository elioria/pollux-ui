---
to: src/app/(private)/generated/<%= h.changeCase.param(name) %>/serverpage/server-page.tsx
force: true
---
import { getRouteApi } from '@tanstack/react-router';

import PageContainer from '@/components/layout/page-container';

import { CrudCapabilitiesProvider } from '@/features/generated-crud/capabilities';

import { columns } from '../data-table-components/columns';
import { ServerDataTable } from './data-table';

const route = getRouteApi('/generated-server/<%= h.changeCase.param(name) %>');

export default function <%= h.inflection.classify(name) %>ServerPage() {
  const { rows, pageCount, total, capabilities } = route.useLoaderData();

  return (
    <PageContainer scrollable={true}>
      <div className="pollux-generated-page min-w-0 space-y-4 md:space-y-5">
        <CrudCapabilitiesProvider capabilities={capabilities}>
          <ServerDataTable columns={columns} data={rows} pageCount={pageCount} total={total} />
        </CrudCapabilitiesProvider>
      </div>
    </PageContainer>
  );
}
