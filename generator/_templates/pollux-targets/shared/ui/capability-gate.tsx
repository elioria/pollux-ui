// SPEC-003 shared UI — capability gate.
//
// Hides controls the API reports as not permitted. PRESENTATION ONLY: the
// API is authoritative and re-checks every call; this gate must never be the
// only enforcement (SPEC-003 "capabilities agree with enforcement").

import type { ReactNode } from 'react';

import type { EntityCapabilities } from '../runtime/api-types';

export function CapabilityGate({
  capabilities,
  require,
  fallback = null,
  children,
}: {
  capabilities: EntityCapabilities;
  /** Operation(s) that must ALL be permitted for children to render. */
  require: keyof EntityCapabilities | Array<keyof EntityCapabilities>;
  /** Rendered when not permitted (default: nothing). */
  fallback?: ReactNode;
  children: ReactNode;
}) {
  const required = Array.isArray(require) ? require : [require];
  const allowed = required.every((operation) => capabilities[operation]);
  return <>{allowed ? children : fallback}</>;
}
