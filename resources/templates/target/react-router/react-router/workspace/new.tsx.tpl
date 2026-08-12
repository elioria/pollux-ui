// Rota de criação gerada — entidade '__ENTITY__' (/manager/__PLURAL__/new).
//
// A mutação roda na action da rota via fetcher (sem recarregar o documento);
// o formulário compartilhado preserva a entrada do usuário em qualquer falha
// e mapeia fieldErrors do servidor para os campos. Uma submissão lógica gera
// UMA idempotency key, reutilizada em retries; uma falha terminal encerra a
// submissão e a próxima tentativa (dados editados) recebe chave nova.
import { useRef } from 'react';
import { useLoaderData, useNavigate } from 'react-router';
import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';

import { EntityForm } from '../../../components/pollux/entity-form';
import {
  ForbiddenState,
  UnauthenticatedState,
  ErrorState,
} from '../../../components/pollux/states';
import { __ENTITY__Spec, type __PASCAL__Row } from '../../../generated/pollux/__ENTITY__/spec';
import { usePolluxMutation } from '../../../lib/pollux/use-pollux-mutation';
import type { ApiErrorShape, WireRecord } from '../../../lib/pollux/runtime/api-types';
import { createEntityClient, newIdempotencyKey } from '../../../lib/pollux/runtime/client';
import { errorMessages, uiLabels } from '../../../lib/pollux/runtime/errors-pt';

const LIST_PATH = '/manager/__PLURAL__';

const serverClient = (request: Request) =>
  createEntityClient<__PASCAL__Row>(__ENTITY__Spec, {
    baseUrl: `${new URL(request.url).origin}/api/pollux`,
    entity: '__ENTITY__',
  });

export function meta() {
  return [{ title: __TITLE_CREATE_JSON__ }];
}

export async function loader({ request }: LoaderFunctionArgs) {
  return serverClient(request).capabilities({ signal: request.signal });
}

export async function action({ request }: ActionFunctionArgs) {
  const payload = (await request.json()) as {
    values?: WireRecord;
    idempotencyKey?: string;
  };
  if (!payload.values || !payload.idempotencyKey) {
    const error: ApiErrorShape = {
      code: 'VALIDATION_FAILED',
      message: errorMessages.VALIDATION_FAILED,
      requestId: '',
      retryable: false,
    };
    return { ok: false as const, error };
  }
  return serverClient(request).create(payload.values, {
    idempotencyKey: payload.idempotencyKey,
  });
}

export default function __PASCAL__CreatePage() {
  const result = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const { mutate } = usePolluxMutation();
  const idempotencyKeyRef = useRef<string | null>(null);

  if (!result.ok) {
    if (result.error.code === 'UNAUTHENTICATED') return <UnauthenticatedState />;
    if (result.error.code === 'FORBIDDEN') return <ForbiddenState />;
    return <ErrorState error={result.error} />;
  }
  if (!result.data.create) return <ForbiddenState />;

  const onSubmit = async (values: WireRecord) => {
    idempotencyKeyRef.current ??= newIdempotencyKey();
    const error = await mutate({
      values,
      idempotencyKey: idempotencyKeyRef.current,
    });
    if (!error) {
      // Sucesso: navegação client-side para a lista; o loader dela recarrega
      // os dados (revalidação sem full reload).
      void navigate(LIST_PATH);
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
        onCancel={() => void navigate(LIST_PATH)}
      />
    </div>
  );
}

export function ErrorBoundary() {
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
