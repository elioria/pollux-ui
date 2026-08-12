// SPEC-002 — target-adapter error surface. Targets share the skeleton error
// taxonomy (one class, stable codes, one JSON failure envelope); this module
// only re-exports it so target code reads naturally and the CLI keeps a
// single `{ ok:false, code, message, details? }` contract.
export {
  ERROR_CODES,
  isSkeletonError,
  SkeletonError,
} from '../skeletons/errors.mjs';
