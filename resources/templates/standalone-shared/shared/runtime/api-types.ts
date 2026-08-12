// SPEC-003 shared runtime — typed envelopes for the Pollux standalone API v2.
// Framework-neutral: no framework imports; copied verbatim into generated
// workspaces by the SPEC-004..006 adapters.
//
// Contract fixture: test-fixtures/pollux/api/contract.{md,json} (v2.0.0).

export const API_CONTRACT_VERSION = '2.0.0';

/** Stable error taxonomy (never extended without a contract version bump). */
export const apiErrorCodes = [
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'VALIDATION_FAILED',
  'NOT_FOUND',
  'CONFLICT',
  'REFERENCE_CONFLICT',
  'STALE_WRITE',
  'RATE_LIMITED',
  'SERVICE_UNAVAILABLE',
  'INTERNAL',
] as const;

export type ApiErrorCode = (typeof apiErrorCodes)[number];

/** Safe error envelope returned by every non-2xx response. */
export type ApiErrorShape = {
  code: ApiErrorCode;
  message: string;
  requestId: string;
  retryable: boolean;
  fieldErrors?: Record<string, string[]>;
};

/** Discriminated result mirroring the CrudResult convention. */
export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ApiErrorShape };

/** Per-operation effective capabilities for the calling actor. */
export type EntityCapabilities = {
  list: boolean;
  read: boolean;
  create: boolean;
  update: boolean;
  delete: boolean;
};

export const noCapabilities: EntityCapabilities = {
  list: false,
  read: false,
  create: false,
  update: false,
  delete: false,
};

/** One sort entry of the `sort` list parameter (JSON `[{id, desc}]`). */
export type SortSpec = { id: string; desc: boolean };

/** Payload of `GET /api/generated/v2/:entity`. */
export type ListResponse<Row> = {
  rows: Row[];
  totalRows: number;
  page: number;
  pageSize: number;
  capabilities: EntityCapabilities;
};

/** Payload of `DELETE /api/generated/v2/:entity/:id`. */
export type DeleteResponse = { id: string; deleted: true };

/** Normalized scalar types of the Pollux entity model (modelVersion "1"). */
export const scalarTypes = [
  'uuid',
  'string',
  'varchar',
  'text',
  'boolean',
  'integer',
  'float',
  'numeric',
  'date',
  'time',
  'timestamp',
] as const;

export type ScalarType = (typeof scalarTypes)[number];

/**
 * Wire value for one field: strings for uuid/string/varchar/text/numeric/
 * date/time/timestamp, booleans, plain numbers for integer/float, or null.
 * Numeric travels as a decimal-literal string to preserve precision.
 */
export type WireValue = string | number | boolean | null;

export type WireRecord = Record<string, WireValue>;

export type FieldMutability =
  | 'none'
  | 'createOnly'
  | 'updateOnly'
  | 'createAndUpdate';

/**
 * Minimal per-field spec the shared UI needs. Adapters project it from the
 * normalized entity model (scripts/pollux/model/schema.mjs) at generation
 * time; labels keep the source Portuguese text.
 */
export type FieldSpec = {
  codeName: string;
  label: string;
  scalarType: ScalarType;
  nullable: boolean;
  primaryKey: boolean;
  mutability: FieldMutability;
  requiredOnCreate: boolean;
  requiredOnUpdate: boolean;
  maxLength: number | null;
  visibility: { list: boolean; create: boolean; update: boolean };
};

/** Entity-level spec consumed by the shared UI templates. */
export type EntitySpec = {
  id: string;
  titles: { list: string; create: string; update: string };
  fields: FieldSpec[];
  sortableFields: string[];
  filterableFields: string[];
  pageSizes: number[];
  defaultPageSize: number;
  defaultSort: SortSpec[];
};

export const isApiErrorShape = (value: unknown): value is ApiErrorShape => {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.code === 'string' &&
    (apiErrorCodes as readonly string[]).includes(v.code) &&
    typeof v.message === 'string' &&
    typeof v.requestId === 'string' &&
    typeof v.retryable === 'boolean'
  );
};
