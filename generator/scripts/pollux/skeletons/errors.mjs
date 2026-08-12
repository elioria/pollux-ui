// Stable error taxonomy for skeleton discovery, validation and workspace
// creation (SPEC-001). Modules under scripts/pollux/skeletons/ throw
// SkeletonError (or return values) — they never call process.exit; the CLI
// is the only layer that maps errors to exit codes and output modes.

export const ERROR_CODES = Object.freeze({
  USAGE: 'USAGE',
  INTERNAL: 'INTERNAL',
  REGISTRY_INVALID: 'REGISTRY_INVALID',
  MANIFEST_INVALID: 'MANIFEST_INVALID',
  SKELETON_UNKNOWN: 'SKELETON_UNKNOWN',
  SKELETON_NOT_COPYABLE: 'SKELETON_NOT_COPYABLE',
  DESTINATION_NOT_DIRECTORY: 'DESTINATION_NOT_DIRECTORY',
  DESTINATION_NOT_EMPTY: 'DESTINATION_NOT_EMPTY',
  PACKAGE_NAME_INVALID: 'PACKAGE_NAME_INVALID',
  COPY_FAILED: 'COPY_FAILED',
  POST_COPY_VALIDATION_FAILED: 'POST_COPY_VALIDATION_FAILED',
  // SPEC-002 — target adapter protocol (scripts/pollux/targets/).
  TARGET_UNSUPPORTED: 'TARGET_UNSUPPORTED',
  TARGET_MISMATCH: 'TARGET_MISMATCH',
  PLAN_INVALID: 'PLAN_INVALID',
  OWNERSHIP_CONFLICT: 'OWNERSHIP_CONFLICT',
  TRANSACTION_INCOMPLETE: 'TRANSACTION_INCOMPLETE',
  GENERATED_EDITED: 'GENERATED_EDITED',
});

export class SkeletonError extends Error {
  /**
   * @param {string} code one of ERROR_CODES
   * @param {string} message human-readable, single line preferred
   * @param {{details?: object, hint?: string}} [extra]
   */
  constructor(code, message, { details, hint } = {}) {
    super(message);
    this.name = 'SkeletonError';
    this.code = code;
    if (details !== undefined) this.details = details;
    if (hint !== undefined) this.hint = hint;
  }

  /** JSON failure envelope: { ok:false, code, message, details? } */
  toJSON() {
    const payload = { ok: false, code: this.code, message: this.message };
    if (this.details !== undefined) payload.details = this.details;
    return payload;
  }
}

/** True when err is a typed skeleton error with a stable code. */
export const isSkeletonError = (err) => err instanceof SkeletonError;
