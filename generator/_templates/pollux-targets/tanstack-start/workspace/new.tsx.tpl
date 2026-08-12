// Rota de criação gerada — entidade '__ENTITY__' (/manager/__PLURAL__/new).
//
// A mutação chama o cliente compartilhado direto no navegador (proxy
// same-origin); o formulário compartilhado preserva a entrada do usuário em
// qualquer falha e mapeia fieldErrors do servidor para os campos. Uma
// submissão lógica gera UMA idempotency key, reutilizada em retries; uma
// falha terminal encerra a submissão e a próxima tentativa (dados editados)
// recebe chave nova.
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

export const Route = createFileRoute('/manager/__PLURAL__/new')({
  loader: ({ abortController }) =>
    entityClient().capabilities({ signal: abortController.signal }),
  head: () => ({ meta: [{ title: __TITLE_CREATE_JSON__ }] }),
  component: __PASCAL__CreatePage,
  errorComponent: PageErrorBoundary,
});

function __PASCAL__CreatePage() {
  const result = Route.useLoaderData();
  const navigate = Route.useNavigate();
  const { mutate } = usePolluxMutation();
  const idempotencyKeyRef = useRef<string | null>(null);

  if (!result.ok) {
    if (result.error.code === 'UNAUTHENTICATED') return <UnauthenticatedState />;
    if (result.error.code === 'FORBIDDEN') return <ForbiddenState />;
    return <ErrorState error={result.error} />;
  }
  if (!result.data.create) return <ForbiddenState />;

  const goToList = () => void navigate({ to: '/manager/__PLURAL__' });

  const onSubmit = async (values: WireRecord) => {
    idempotencyKeyRef.current ??= newIdempotencyKey();
    const error = await mutate(() =>
      entityClient().create(values as Partial<__PASCAL__Row>, {
        idempotencyKey: idempotencyKeyRef.current ?? newIdempotencyKey(),
      })
    );
    if (!error) {
      // Sucesso: navegação client-side para a lista; o loader dela recarrega
      // os dados (revalidação sem full reload).
      goToList();
      return null;
    }
    // Falha não-retryable = fim da submissão lógica; corpo editado na próxima
    // tentativa exige chave nova (evita CONFLICT de replay divergente).
    if (!error.retryable) idempotencyKeyRef.current = null;
    return error;
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h2 className="font-display text-2xl font-semibold">
        {__ENTITY__Spec.titles.create}
      </h2>
      <EntityForm
        spec={__ENTITY__Spec}
        operation="create"
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
