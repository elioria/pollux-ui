// Rota de edição gerada — entidade '__ENTITY__'
// (/manager/__PLURAL__/$id/edit).
//
// O loader busca o registro + capacidades pelo proxy same-origin; a mutação
// chama o cliente compartilhado direto no navegador. Em conflito
// (CONFLICT/STALE_WRITE) o formulário compartilhado preserva a entrada do
// usuário e exibe o envelope seguro.
import { createFileRoute } from '@tanstack/react-router';
import { useRef } from 'react';

import { EntityForm } from '../../../components/pollux/entity-form';
import {
  ErrorState,
  ForbiddenState,
  UnauthenticatedState,
} from '../../../components/pollux/states';
import { __ENTITY__Spec, type __PASCAL__Row } from '../../../generated/pollux/__ENTITY__/spec';
import { polluxBaseUrl } from '../../../lib/pollux/base-url';
import { usePolluxMutation } from '../../../lib/pollux/use-pollux-mutation';
import type { WireRecord } from '../../../lib/pollux/runtime/api-types';
import { createEntityClient, newIdempotencyKey } from '../../../lib/pollux/runtime/client';
import { errorMessages, uiLabels } from '../../../lib/pollux/runtime/errors-pt';

const entityClient = () =>
  createEntityClient<__PASCAL__Row>(__ENTITY__Spec, {
    baseUrl: polluxBaseUrl(),
    entity: '__ENTITY__',
  });

export const Route = createFileRoute('/manager/__PLURAL__/$id/edit')({
  loader: async ({ params, abortController }) => {
    const client = entityClient();
    const [record, capabilities] = await Promise.all([
      client.get(params.id, { signal: abortController.signal }),
      client.capabilities({ signal: abortController.signal }),
    ]);
    return { record, capabilities };
  },
  head: () => ({ meta: [{ title: __TITLE_UPDATE_JSON__ }] }),
  component: __PASCAL__EditPage,
  errorComponent: PageErrorBoundary,
});

function __PASCAL__EditPage() {
  const { record, capabilities } = Route.useLoaderData();
  const { id } = Route.useParams();
  const navigate = Route.useNavigate();
  const { mutate } = usePolluxMutation();
  const idempotencyKeyRef = useRef<string | null>(null);

  if (!record.ok) {
    if (record.error.code === 'UNAUTHENTICATED') return <UnauthenticatedState />;
    if (record.error.code === 'FORBIDDEN') return <ForbiddenState />;
    return <ErrorState error={record.error} />;
  }
  if (capabilities.ok && !capabilities.data.update) return <ForbiddenState />;

  const goToList = () => void navigate({ to: '/manager/__PLURAL__' });

  const onSubmit = async (values: WireRecord) => {
    idempotencyKeyRef.current ??= newIdempotencyKey();
    const error = await mutate(() =>
      entityClient().update(id, values as Partial<__PASCAL__Row>, {
        idempotencyKey: idempotencyKeyRef.current ?? newIdempotencyKey(),
      })
    );
    if (!error) {
      goToList();
      return null;
    }
    if (!error.retryable) idempotencyKeyRef.current = null;
    return error;
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h2 className="font-display text-2xl font-semibold">
        {__ENTITY__Spec.titles.update}
      </h2>
      <EntityForm
        spec={__ENTITY__Spec}
        operation="update"
        initial={record.data}
        onSubmit={onSubmit}
        onCancel={goToList}
      />
    </div>
  );
}

function PageErrorBoundary() {
  return (
    <div className="rounded-lg border border-border bg-card p-8">
      <h2 className="font-display text-xl font-semibold">
        {uiLabels.errorTitle}
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {errorMessages.INTERNAL}
      </p>
    </div>
  );
}
