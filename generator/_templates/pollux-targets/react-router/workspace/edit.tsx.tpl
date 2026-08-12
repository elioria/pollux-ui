// Rota de edição gerada — entidade '__ENTITY__'
// (/manager/__PLURAL__/:id/edit).
//
// O loader busca o registro + capacidades pelo proxy same-origin; a mutação
// roda na action via fetcher. Em conflito (CONFLICT/STALE_WRITE) o formulário
// compartilhado preserva a entrada do usuário e exibe o envelope seguro.
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
  return [{ title: __TITLE_UPDATE_JSON__ }];
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const client = serverClient(request);
  const [record, capabilities] = await Promise.all([
    client.get(params.id ?? '', { signal: request.signal }),
    client.capabilities({ signal: request.signal }),
  ]);
  return { record, capabilities };
}

export async function action({ request, params }: ActionFunctionArgs) {
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
  return serverClient(request).update(params.id ?? '', payload.values, {
    idempotencyKey: payload.idempotencyKey,
  });
}

export default function __PASCAL__EditPage() {
  const { record, capabilities } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const { mutate } = usePolluxMutation();
  const idempotencyKeyRef = useRef<string | null>(null);

  if (!record.ok) {
    if (record.error.code === 'UNAUTHENTICATED') return <UnauthenticatedState />;
    if (record.error.code === 'FORBIDDEN') return <ForbiddenState />;
    return <ErrorState error={record.error} />;
  }
  if (capabilities.ok && !capabilities.data.update) return <ForbiddenState />;

  const onSubmit = async (values: WireRecord) => {
    idempotencyKeyRef.current ??= newIdempotencyKey();
    const error = await mutate({
      values,
      idempotencyKey: idempotencyKeyRef.current,
    });
    if (!error) {
      void navigate(LIST_PATH);
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
