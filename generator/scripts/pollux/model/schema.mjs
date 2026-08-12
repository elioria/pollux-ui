// SPEC-002 — versioned normalized Pollux entity model (definition half).
//
// This module is the single authoritative definition of the
// `PolluxEntityModel` produced by `scripts/pollux/model/normalize.mjs`.
// It carries only data: enums, diagnostic codes, deterministic maps and a
// structural validator. It never executes metadata-provided code and it has
// no locale or filesystem dependence.
//
// Model overview (modelVersion "1"):
//
//   {
//     modelVersion: '1',
//     entity: {
//       id,                    // entity code, e.g. 'act'
//       table,                 // database table name (dbName)
//       resourceCode,          // stable grant-resolver resource code (= id)
//       routes: { singular, plural },   // plural: +'s', or +'es' if id ends in 's'
//       titles: { list, create, update } // source Portuguese labels preserved
//     },
//     fields: [ PolluxField... ],        // source order
//     validation: [ { field, rules: [...] } ], // data-only rules, field order
//     list: {
//       visibleColumns, sortableFields, filterableFields,   // codeNames
//       defaultSort: [{ field, direction }],
//       pageSizes: [int...], defaultPageSize,
//       filterOperators: { codeName: [operator...] }
//     },
//     operations: {
//       list|read|create|update|delete: {
//         enabled, permission: { resource, action, name }
//       }
//     },
//     unsupportedCapabilities: ['export' | 'operation' ...]
//   }
//
// PolluxField:
//   {
//     sourceName,     // raw column name from metadata (snake_case)
//     codeName,       // safe camelCase identifier
//     label,          // display label (source Portuguese text preserved)
//     dbType,         // raw legacy dataType, e.g. 'timestamptz'
//     scalarType,     // one of SCALAR_TYPES
//     nullable, primaryKey,
//     mutability,     // one of MUTABILITY values
//     defaultBehavior: { kind, value },   // kind: DEFAULT_BEHAVIOR_KINDS
//     constraints: { length, precision, scale },  // numbers or null
//     visibility: { list, create, update }
//   }

/** Version of the normalized model contract. Bump on breaking change. */
export const MODEL_VERSION = '1';

/** Normalized scalar types supported by the first cross-target release. */
export const SCALAR_TYPES = Object.freeze([
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
]);

/**
 * Legacy metadata dataType -> normalized scalar type.
 * Any dataType absent from this map (and from the unsupported classifier
 * maps below) fails normalization with E_UNKNOWN_TYPE.
 */
export const SCALAR_BY_DB_TYPE = Object.freeze({
  uuid: 'uuid',
  char: 'string',
  varchar: 'varchar',
  text: 'text',
  boolean: 'boolean',
  smallint: 'integer',
  integer: 'integer',
  bigint: 'integer',
  real: 'float',
  double: 'float',
  numeric: 'numeric',
  date: 'date',
  time: 'time',
  timetz: 'time',
  timestamp: 'timestamp',
  timestamptz: 'timestamp',
});

/** dataTypes that denote binary/upload payloads — unsupported (SPEC-002). */
export const UPLOAD_DB_TYPES = Object.freeze([
  'attachment',
  'blob',
  'bytea',
  'file',
  'image',
  'upload',
]);

/** dataTypes that denote rich text — unsupported (SPEC-002). */
export const RICH_TEXT_DB_TYPES = Object.freeze([
  'html',
  'markdown',
  'rich_text',
  'richtext',
  'wysiwyg',
]);

/** dataTypes that denote relationships — unsupported (SPEC-002). */
export const RELATIONSHIP_DB_TYPES = Object.freeze([
  'fk',
  'lookup',
  'relation',
  'relationship',
]);

/** Field mutability, derived from form membership + readonly policy. */
export const MUTABILITY = Object.freeze([
  'none', // never client-writable (pk, audit columns, form-absent)
  'createOnly',
  'updateOnly',
  'createAndUpdate',
]);

/** Default-behavior kinds for a field. */
export const DEFAULT_BEHAVIOR_KINDS = Object.freeze([
  'none', // no default; client supplies the value (or null)
  'generated', // server/app-generated identifier (uuid primary key)
  'auditTimestamp', // created_at / updated_at
  'auditActor', // created_by_id / updated_by_id
  'literal', // constant literal default from metadata (carried in `value`)
]);

/** Supported list-filter operators per normalized scalar type. */
export const FILTER_OPERATORS_BY_SCALAR = Object.freeze({
  uuid: Object.freeze(['eq']),
  string: Object.freeze(['contains', 'eq']),
  varchar: Object.freeze(['contains', 'eq']),
  text: Object.freeze(['contains', 'eq']),
  boolean: Object.freeze(['eq']),
  integer: Object.freeze(['eq', 'gt', 'gte', 'lt', 'lte']),
  float: Object.freeze(['eq', 'gt', 'gte', 'lt', 'lte']),
  numeric: Object.freeze(['eq', 'gt', 'gte', 'lt', 'lte']),
  date: Object.freeze(['eq', 'gt', 'gte', 'lt', 'lte']),
  time: Object.freeze(['eq', 'gt', 'gte', 'lt', 'lte']),
  timestamp: Object.freeze(['eq', 'gt', 'gte', 'lt', 'lte']),
});

/** Bounded default page sizes when metadata carries none. */
export const DEFAULT_PAGE_SIZES = Object.freeze([10, 20, 50]);

/** Inclusive bounds accepted for any page size. */
export const PAGE_SIZE_BOUNDS = Object.freeze({ min: 1, max: 500 });

/** CRUD operations of the model, in canonical order. */
export const OPERATIONS = Object.freeze([
  'list',
  'read',
  'create',
  'update',
  'delete',
]);

/** Operation -> grant-resolver action (list and read share `read`). */
export const ACTION_BY_OPERATION = Object.freeze({
  list: 'read',
  read: 'read',
  create: 'create',
  update: 'update',
  delete: 'delete',
});

/**
 * Structured diagnostic codes emitted by normalization. Every failure is a
 * `{ code, message, field? }` object using one of these codes.
 */
export const DIAGNOSTIC_CODES = Object.freeze([
  'E_MISSING_REQUIRED_KEY', // stub payload / missing data.attributes / name / dbName
  'E_MISSING_PRIMARY_KEY', // no attribute flagged isPrimaryKey
  'E_COMPOSITE_PRIMARY_KEY', // more than one primary-key attribute
  'E_DUPLICATE_FIELD', // repeated attribute name
  'E_UNKNOWN_TYPE', // dataType outside every supported/unsupported map
  'E_UNSUPPORTED_RELATIONSHIP', // relationship metadata (dataType or lookup object)
  'E_UNSUPPORTED_UPLOAD', // binary/upload dataType
  'E_UNSUPPORTED_RICH_TEXT', // rich-text dataType
  'E_UNSAFE_IDENTIFIER', // entity/field name unusable as an identifier
  'E_INVALID_BOUNDS', // non-positive length, precision < scale, bad page size
  'E_AMBIGUOUS_MUTABILITY', // conditional readonly, or required + readonly conflict
  'E_UNSUPPORTED_RULE', // executable mandatory/readonly rule fragment
]);

/** Safe snake_case source identifier (also used for entity codes). */
export const SAFE_IDENTIFIER_PATTERN = /^[a-z][a-z0-9_]*$/;

/** ECMAScript reserved words a codeName must not collide with. */
export const RESERVED_WORDS = Object.freeze(
  new Set([
    'await',
    'break',
    'case',
    'catch',
    'class',
    'const',
    'continue',
    'debugger',
    'default',
    'delete',
    'do',
    'else',
    'enum',
    'export',
    'extends',
    'false',
    'finally',
    'for',
    'function',
    'if',
    'implements',
    'import',
    'in',
    'instanceof',
    'interface',
    'let',
    'new',
    'null',
    'package',
    'private',
    'protected',
    'public',
    'return',
    'static',
    'super',
    'switch',
    'this',
    'throw',
    'true',
    'try',
    'typeof',
    'var',
    'void',
    'while',
    'with',
    'yield',
  ])
);

/**
 * Route pluralization shared with the existing generators:
 * append 's', or 'es' when the entity code already ends in 's'.
 * @param {string} name entity code
 * @returns {string}
 */
export const pluralSlug = (name) =>
  name.endsWith('s') ? `${name}es` : `${name}s`;

const isPlainObject = (v) =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Structural validator for an already-built model. Returns a list of
 * human-readable problems (empty when the model conforms to this schema).
 * It exists so adapters and tests can assert a model without re-normalizing.
 * @param {object} model candidate PolluxEntityModel
 * @returns {string[]} problems (empty = valid)
 */
export function validateEntityModel(model) {
  const problems = [];
  const push = (msg) => problems.push(msg);

  if (!isPlainObject(model)) return ['model is not an object'];
  if (model.modelVersion !== MODEL_VERSION) {
    push(`modelVersion must be "${MODEL_VERSION}"`);
  }
  if (!isPlainObject(model.entity)) {
    push('entity must be an object');
  } else {
    for (const key of ['id', 'table', 'resourceCode']) {
      if (typeof model.entity[key] !== 'string' || !model.entity[key]) {
        push(`entity.${key} must be a non-empty string`);
      }
    }
    if (
      !isPlainObject(model.entity.routes) ||
      typeof model.entity.routes.singular !== 'string' ||
      typeof model.entity.routes.plural !== 'string'
    ) {
      push('entity.routes must carry singular and plural strings');
    }
    if (
      !isPlainObject(model.entity.titles) ||
      ['list', 'create', 'update'].some(
        (k) => typeof model.entity.titles?.[k] !== 'string'
      )
    ) {
      push('entity.titles must carry list, create and update strings');
    }
  }

  if (!Array.isArray(model.fields) || model.fields.length === 0) {
    push('fields must be a non-empty array');
  } else {
    model.fields.forEach((field, index) => {
      const at = `fields[${index}]`;
      if (!isPlainObject(field)) {
        push(`${at} must be an object`);
        return;
      }
      for (const key of ['sourceName', 'codeName', 'label', 'dbType']) {
        if (typeof field[key] !== 'string' || !field[key]) {
          push(`${at}.${key} must be a non-empty string`);
        }
      }
      if (!SCALAR_TYPES.includes(field.scalarType)) {
        push(`${at}.scalarType "${field.scalarType}" is not a known scalar`);
      }
      if (typeof field.nullable !== 'boolean')
        push(`${at}.nullable must be boolean`);
      if (typeof field.primaryKey !== 'boolean')
        push(`${at}.primaryKey must be boolean`);
      if (!MUTABILITY.includes(field.mutability)) {
        push(
          `${at}.mutability "${field.mutability}" is not a known mutability`
        );
      }
      if (
        !isPlainObject(field.defaultBehavior) ||
        !DEFAULT_BEHAVIOR_KINDS.includes(field.defaultBehavior.kind)
      ) {
        push(`${at}.defaultBehavior.kind is not a known kind`);
      }
      if (!isPlainObject(field.constraints)) {
        push(`${at}.constraints must be an object`);
      }
      if (
        !isPlainObject(field.visibility) ||
        ['list', 'create', 'update'].some(
          (k) => typeof field.visibility?.[k] !== 'boolean'
        )
      ) {
        push(`${at}.visibility must carry list/create/update booleans`);
      }
    });
    const primaryKeys = model.fields.filter((f) => f?.primaryKey).length;
    if (primaryKeys !== 1)
      push(`model must carry exactly one primary key, found ${primaryKeys}`);
  }

  if (!Array.isArray(model.validation)) push('validation must be an array');

  if (!isPlainObject(model.list)) {
    push('list must be an object');
  } else {
    for (const key of [
      'visibleColumns',
      'sortableFields',
      'filterableFields',
      'defaultSort',
      'pageSizes',
    ]) {
      if (!Array.isArray(model.list[key])) push(`list.${key} must be an array`);
    }
    if (!Number.isInteger(model.list.defaultPageSize)) {
      push('list.defaultPageSize must be an integer');
    }
    if (!isPlainObject(model.list.filterOperators)) {
      push('list.filterOperators must be an object');
    }
  }

  if (!isPlainObject(model.operations)) {
    push('operations must be an object');
  } else {
    for (const op of OPERATIONS) {
      const spec = model.operations[op];
      if (
        !isPlainObject(spec) ||
        typeof spec.enabled !== 'boolean' ||
        !isPlainObject(spec.permission) ||
        typeof spec.permission.resource !== 'string' ||
        spec.permission.action !== ACTION_BY_OPERATION[op] ||
        typeof spec.permission.name !== 'string'
      ) {
        push(`operations.${op} must carry enabled + {resource, action, name}`);
      }
    }
  }

  if (!Array.isArray(model.unsupportedCapabilities)) {
    push('unsupportedCapabilities must be an array');
  }

  return problems;
}
