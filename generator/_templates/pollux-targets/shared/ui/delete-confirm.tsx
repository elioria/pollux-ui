// SPEC-003 shared UI — accessible delete confirmation dialog.
//
// Framework-neutral: the deletion itself is injected via `onConfirm` (the
// adapter wraps its mutation and supplies one idempotency key per confirm,
// reused if the user retries a retryable failure). REFERENCE_CONFLICT and
// other safe envelopes render inline; retry appears only when retryable.

import { useEffect, useRef, useState } from 'react';

import type { ApiErrorShape } from '../runtime/api-types';
import { errorMessage, uiLabels } from '../runtime/errors-pt';

export type DeleteConfirmProps = {
  open: boolean;
  /** What is being deleted, shown in the dialog body (e.g. record title). */
  subject?: string;
  /** Injected mutation: resolves null on success, safe envelope on failure. */
  onConfirm: () => Promise<ApiErrorShape | null>;
  /** Close without deleting (also wired to Escape). */
  onCancel: () => void;
  /** Called after a successful deletion (adapter refreshes its list). */
  onDeleted: () => void;
};

export function DeleteConfirm({
  open,
  subject,
  onConfirm,
  onCancel,
  onDeleted,
}: DeleteConfirmProps) {
  const [error, setError] = useState<ApiErrorShape | null>(null);
  const [deleting, setDeleting] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) {
      setError(null);
      setDeleting(false);
      cancelRef.current?.focus();
    }
  }, [open]);

  if (!open) return null;

  const runDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    setError(null);
    try {
      const failure = await onConfirm();
      if (failure) setError(failure);
      else onDeleted();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div
      role="presentation"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !deleting) onCancel();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="pollux-delete-title"
        aria-describedby="pollux-delete-description"
        className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-lg"
      >
        <h2
          id="pollux-delete-title"
          className="text-lg font-semibold text-foreground"
        >
          {uiLabels.deleteTitle}
        </h2>
        <div
          id="pollux-delete-description"
          className="mt-2 flex flex-col gap-1 text-sm text-muted-foreground"
        >
          <p>{uiLabels.deleteMessage}</p>
          {subject ? (
            <p className="font-medium text-foreground">{subject}</p>
          ) : null}
          <p>{uiLabels.deleteIrreversible}</p>
        </div>

        {error ? (
          <div
            role="alert"
            className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-foreground"
          >
            <p>{errorMessage(error)}</p>
            {error.requestId ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {uiLabels.requestId(error.requestId)}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={deleting}
            className="rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
          >
            {uiLabels.cancel}
          </button>
          {error && !error.retryable ? null : (
            <button
              type="button"
              onClick={runDelete}
              disabled={deleting}
              className="rounded-md bg-destructive px-4 py-2 text-sm font-medium text-white hover:bg-destructive/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
            >
              {deleting
                ? uiLabels.deleting
                : error?.retryable
                  ? uiLabels.retry
                  : uiLabels.delete}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
