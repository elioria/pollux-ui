// SPEC-003 shared UI — stable, accessible state components.
//
// Covers the SPEC-003 states: initial loading, background refresh, empty
// result, forbidden, unauthenticated and retryable outage. Framework-neutral
// (React + Tailwind v4 semantic tokens only); navigation is injected via
// props. Portuguese defaults come from the runtime locale module.

import type { ReactNode } from 'react';

import type { ApiErrorShape } from '../runtime/api-types';
import { errorMessage, uiLabels } from '../runtime/errors-pt';

export function LoadingState({ label = uiLabels.loading }: { label?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="flex items-center justify-center gap-2 rounded-lg border border-border bg-card p-8 text-sm text-muted-foreground"
    >
      <span
        aria-hidden="true"
        className="size-4 animate-spin rounded-full border-2 border-muted-foreground/40 border-t-foreground"
      />
      {label}
    </div>
  );
}

/** Non-blocking indicator for background refreshes (data stays visible). */
export function RefreshingIndicator({
  refreshing,
  label = uiLabels.refreshing,
}: {
  refreshing: boolean;
  label?: string;
}) {
  if (!refreshing) return null;
  return (
    <span
      role="status"
      aria-live="polite"
      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
    >
      <span
        aria-hidden="true"
        className="size-3 animate-spin rounded-full border-2 border-muted-foreground/40 border-t-foreground"
      />
      {label}
    </span>
  );
}

export function EmptyState({
  message = uiLabels.empty,
  action,
}: {
  message?: string;
  action?: ReactNode;
}) {
  return (
    <div
      role="status"
      className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground"
    >
      <p>{message}</p>
      {action}
    </div>
  );
}

export function ForbiddenState({
  message = uiLabels.forbidden,
}: {
  message?: string;
}) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-border bg-card p-8 text-center"
    >
      <p className="text-sm font-medium text-foreground">{message}</p>
    </div>
  );
}

export function UnauthenticatedState({
  message = uiLabels.unauthenticated,
  onLogin,
}: {
  message?: string;
  /** Injected by the adapter (navigates to its login route). */
  onLogin?: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-4 rounded-lg border border-border bg-card p-8 text-center"
    >
      <p className="text-sm font-medium text-foreground">{message}</p>
      {onLogin ? (
        <button
          type="button"
          onClick={onLogin}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {uiLabels.login}
        </button>
      ) : null}
    </div>
  );
}

/**
 * Generic error surface for a safe ApiErrorShape. Shows the retry action
 * only when the envelope says the failure is retryable; always shows the
 * request id for support correlation. UNAUTHENTICATED / FORBIDDEN callers
 * should prefer the dedicated states above.
 */
export function ErrorState({
  error,
  onRetry,
}: {
  error: ApiErrorShape;
  /** Injected retry (re-runs the load or replays the idempotent mutation). */
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-3 rounded-lg border border-destructive/40 bg-card p-8 text-center"
    >
      <p className="text-sm font-semibold text-foreground">
        {uiLabels.errorTitle}
      </p>
      <p className="text-sm text-muted-foreground">{errorMessage(error)}</p>
      {error.requestId ? (
        <p className="text-xs text-muted-foreground/80">
          {uiLabels.requestId(error.requestId)}
        </p>
      ) : null}
      {error.retryable && onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {uiLabels.retry}
        </button>
      ) : null}
    </div>
  );
}
