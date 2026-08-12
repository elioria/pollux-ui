---
to: src/routes/generated.<%= h.changeCase.param(name) %>.tsx
force: true
---
import { createFileRoute } from '@tanstack/react-router';

import {
  get<%= h.changeCase.pascal(name) %>Capabilities,
  get<%= h.inflection.pluralize(h.changeCase.pascal(h.customPluralize(name))) %>,
} from '@/app/(private)/generated/<%= h.changeCase.param(name) %>/actions/entityActions';
import <%= h.inflection.classify(name) %>Page from '@/app/(private)/generated/<%= h.changeCase.param(name) %>/page';
import { GuardAuthenticated } from '@/features/auth/guard-authenticated';
import { GeneratedRouteError } from '@/features/generated-crud/generated-route-error';
import { unwrapCrudLoader } from '@/features/generated-crud/loader';

export const Route = createFileRoute('/generated/<%= h.changeCase.param(name) %>')({
  loader: async () => {
    const [result, capabilities] = await Promise.all([
      get<%= h.inflection.pluralize(h.changeCase.pascal(h.customPluralize(name))) %>(),
      get<%= h.changeCase.pascal(name) %>Capabilities(),
    ]);
    return { rows: unwrapCrudLoader(result, '/generated/<%= h.changeCase.param(name) %>'), capabilities };
  },
  component: RouteComponent,
  errorComponent: GeneratedRouteError,
});

function RouteComponent() {
  return (
    <GuardAuthenticated permissionApps={['manager']}>
      <<%= h.inflection.classify(name) %>Page />
    </GuardAuthenticated>
  );
}
