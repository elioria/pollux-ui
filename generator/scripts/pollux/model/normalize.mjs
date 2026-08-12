// SPEC-002 — normalization half of the Pollux entity model.
//
// Transforms one raw `json-files/<entity>.json` payload (shape:
// `{ success, data: { name, dbName, ...grid/form flags, attributes: [...] } }`)
// into a deeply frozen, versioned `PolluxEntityModel` (see `schema.mjs`).
//
// Guarantees:
// - fail-closed: composite/missing primary keys, relationships, uploads,
//   rich text, unknown types, duplicate fields, unsafe identifiers, invalid
//   bounds, executable rule fragments and ambiguous mutability all fail with
//   structured `{ code, message, field? }` diagnostics collected into one
//   `PolluxNormalizationError` (never a silent coercion, never process.exit);
// - export/report metadata is not an error: it is recorded under
//   `unsupportedCapabilities` so target planning can refuse it later;
// - deterministic: field order = source attribute order, object key order is
//   fixed at construction, and `serializeModel` re-canonicalizes with a
//   locale-free byte-order key sort — the same metadata always serializes to
//   the same JSON bytes on any machine.
import {
  ACTION_BY_OPERATION,
  DEFAULT_PAGE_SIZES,
  FILTER_OPERATORS_BY_SCALAR,
  MODEL_VERSION,
  OPERATIONS,
  PAGE_SIZE_BOUNDS,
  pluralSlug,
  RELATIONSHIP_DB_TYPES,
  RESERVED_WORDS,
  RICH_TEXT_DB_TYPES,
  SAFE_IDENTIFIER_PATTERN,
  SCALAR_BY_DB_TYPE,
  UPLOAD_DB_TYPES,
} from './schema.mjs';

/** Audit columns are server-managed and never client-writable. */
const AUDIT_TIMESTAMP_FIELDS = new Set(['created_at', 'updated_at']);
const AUDIT_ACTOR_FIELDS = new Set(['created_by_id', 'updated_by_id']);

/**
 * Error thrown when metadata cannot be normalized. Carries every collected
 * diagnostic so callers can report all problems in one pass.
 */
export class PolluxNormalizationError extends Error {
  /**
   * @param {string} entity entity code (best effort)
   * @param {Array<{code: string, message: string, field?: string}>} diagnostics
   */
  constructor(entity, diagnostics) {
    const summary = diagnostics
      .map((d) => `${d.code}${d.field ? `(${d.field})` : ''}: ${d.message}`)
      .join('; ');
    super(`entity "${entity}" failed normalization — ${summary}`);
    this.name = 'PolluxNormalizationError';
    this.entity = entity;
    this.diagnostics = diagnostics;
  }
}

/** Legacy metadata uses the literal string "NULL" as an empty marker. */
const isBlank = (v) =>
  v === null || v === undefined || v === '' || v === 'NULL';

const textOrNull = (v) => (isBlank(v) ? null : String(v));

/** camelCase a snake_case source name (locale-free). */
const toCamel = (s) => s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());

/** Locale-free UTF-16 code-unit comparison (never localeCompare). */
const byCodeUnit = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

const classifyUnsupportedType = (dbType) => {
  if (UPLOAD_DB_TYPES.includes(dbType)) return 'E_UNSUPPORTED_UPLOAD';
  if (RICH_TEXT_DB_TYPES.includes(dbType)) return 'E_UNSUPPORTED_RICH_TEXT';
  if (RELATIONSHIP_DB_TYPES.includes(dbType)) {
    return 'E_UNSUPPORTED_RELATIONSHIP';
  }
  return 'E_UNKNOWN_TYPE';
};

/** True when a legacy policy value means "yes". */
const policyYes = (v) => v === 'sim';
/** True when a legacy policy value needs a runtime rule to resolve. */
const policyConditional = (v) => v === 'condicional';

const readBound = (value, { min = 1, allowZero = false } = {}) => {
  if (value === null || value === undefined) return { value: null, ok: true };
  const n = Number(value);
  const ok = Number.isInteger(n) && (allowZero ? n >= 0 : n >= min);
  return { value: ok ? n : null, ok };
};

/** Recursively freeze the model so no consumer can mutate shared state. */
const deepFreeze = (value) => {
  if (typeof value === 'object' && value !== null) {
    for (const key of Object.keys(value)) deepFreeze(value[key]);
    Object.freeze(value);
  }
  return value;
};

/**
 * Normalize one raw metadata payload into a frozen PolluxEntityModel.
 *
 * @param {object} raw parsed content of `json-files/<entity>.json`
 * @returns {object} deeply frozen PolluxEntityModel (modelVersion "1")
 * @throws {PolluxNormalizationError} with all collected diagnostics
 */
export function normalizeEntityModel(raw) {
  /** @type {Array<{code: string, message: string, field?: string}>} */
  const diagnostics = [];
  const fail = (code, message, field) => {
    diagnostics.push(field ? { code, message, field } : { code, message });
  };

  const data = raw?.data;
  const entityName =
    typeof data?.name === 'string' && data.name.trim()
      ? data.name.trim()
      : null;

  if (
    !data ||
    !Array.isArray(data.attributes) ||
    data.attributes.length === 0
  ) {
    fail(
      'E_MISSING_REQUIRED_KEY',
      'metadata has no data.attributes array (stub or malformed payload)'
    );
    throw new PolluxNormalizationError(entityName ?? '<unknown>', diagnostics);
  }
  if (!entityName) {
    fail('E_MISSING_REQUIRED_KEY', 'data.name is missing or empty');
  } else if (!SAFE_IDENTIFIER_PATTERN.test(entityName)) {
    fail(
      'E_UNSAFE_IDENTIFIER',
      `entity name "${entityName}" is not a safe identifier`
    );
  }
  const table =
    typeof data.dbName === 'string' && data.dbName.trim()
      ? data.dbName.trim()
      : entityName;
  if (!table) {
    fail('E_MISSING_REQUIRED_KEY', 'data.dbName is missing or empty');
  }

  // ---- fields ----------------------------------------------------------
  const seenNames = new Set();
  const fields = [];
  const validation = [];
  let primaryKeyCount = 0;

  for (const [index, attr] of data.attributes.entries()) {
    const sourceName =
      typeof attr?.name === 'string' && attr.name.trim()
        ? attr.name.trim()
        : null;
    const fieldRef = sourceName ?? `attributes[${index}]`;

    if (!sourceName) {
      fail(
        'E_MISSING_REQUIRED_KEY',
        `attribute at index ${index} has no name`,
        fieldRef
      );
      continue;
    }
    if (seenNames.has(sourceName)) {
      fail(
        'E_DUPLICATE_FIELD',
        `attribute "${sourceName}" is declared more than once`,
        sourceName
      );
      continue;
    }
    seenNames.add(sourceName);

    const codeName = toCamel(sourceName);
    if (
      !SAFE_IDENTIFIER_PATTERN.test(sourceName) ||
      RESERVED_WORDS.has(codeName)
    ) {
      fail(
        'E_UNSAFE_IDENTIFIER',
        `attribute name "${sourceName}" cannot become a safe code identifier`,
        sourceName
      );
      continue;
    }

    const dbType = typeof attr.dataType === 'string' ? attr.dataType : '';
    if (!dbType) {
      fail('E_MISSING_REQUIRED_KEY', 'attribute has no dataType', sourceName);
      continue;
    }
    const scalarType = SCALAR_BY_DB_TYPE[dbType] ?? null;
    if (!scalarType) {
      fail(
        classifyUnsupportedType(dbType),
        `dataType "${dbType}" is not supported by model version ${MODEL_VERSION}`,
        sourceName
      );
      continue;
    }
    // Lookup/relationship widgets are unsupported even on scalar columns.
    if (
      !isBlank(attr.fnrInputObjName) ||
      !isBlank(attr.fedInputObjName) ||
      attr.relationship !== undefined
    ) {
      fail(
        'E_UNSUPPORTED_RELATIONSHIP',
        `attribute "${sourceName}" references a lookup/relationship input object`,
        sourceName
      );
      continue;
    }

    const primaryKey = attr.isPrimaryKey === true;
    if (primaryKey) primaryKeyCount += 1;
    const nullable = attr.isNullable !== false;

    const visibility = {
      list: attr.grdIsinGrid === true,
      create: attr.fnrIsinFormAdd === true,
      update: attr.fedIsinFormUpd === true,
    };

    // ---- mutability -----------------------------------------------------
    // Executable rule fragments cannot be represented as data.
    for (const [ruleKey, policyKey] of [
      ['fnrMandatoryRule', 'fnrMandatory'],
      ['fedMandatoryRule', 'fedMandatory'],
      ['fnrReadonlyRule', 'fnrReadonly'],
      ['fedReadonlyRule', 'fedReadonly'],
    ]) {
      if (!isBlank(attr[ruleKey])) {
        fail(
          'E_UNSUPPORTED_RULE',
          `attribute "${sourceName}" carries an executable ${policyKey} rule fragment`,
          sourceName
        );
      }
    }

    let ambiguous = false;
    if (
      (visibility.create && policyConditional(attr.fnrReadonly)) ||
      (visibility.update && policyConditional(attr.fedReadonly))
    ) {
      fail(
        'E_AMBIGUOUS_MUTABILITY',
        `attribute "${sourceName}" has a conditional readonly policy that cannot be resolved statically`,
        sourceName
      );
      ambiguous = true;
    }
    const createMandatory = visibility.create && policyYes(attr.fnrMandatory);
    const updateMandatory = visibility.update && policyYes(attr.fedMandatory);
    const createReadonly = visibility.create && policyYes(attr.fnrReadonly);
    const updateReadonly = visibility.update && policyYes(attr.fedReadonly);
    if (
      (createMandatory && createReadonly) ||
      (updateMandatory && updateReadonly)
    ) {
      fail(
        'E_AMBIGUOUS_MUTABILITY',
        `attribute "${sourceName}" is simultaneously required and readonly in the same form`,
        sourceName
      );
      ambiguous = true;
    }
    if (ambiguous) continue;

    const isAudit =
      AUDIT_TIMESTAMP_FIELDS.has(sourceName) ||
      AUDIT_ACTOR_FIELDS.has(sourceName);
    const createWritable =
      !primaryKey && !isAudit && visibility.create && !createReadonly;
    const updateWritable =
      !primaryKey && !isAudit && visibility.update && !updateReadonly;
    const mutability = createWritable
      ? updateWritable
        ? 'createAndUpdate'
        : 'createOnly'
      : updateWritable
        ? 'updateOnly'
        : 'none';

    // ---- default behavior ----------------------------------------------
    const rawDefault = textOrNull(attr.defaultValue);
    let defaultBehavior;
    if (primaryKey && scalarType === 'uuid') {
      defaultBehavior = { kind: 'generated', value: null };
    } else if (AUDIT_TIMESTAMP_FIELDS.has(sourceName)) {
      defaultBehavior = { kind: 'auditTimestamp', value: null };
    } else if (AUDIT_ACTOR_FIELDS.has(sourceName)) {
      defaultBehavior = { kind: 'auditActor', value: null };
    } else if (rawDefault !== null) {
      defaultBehavior = { kind: 'literal', value: rawDefault };
    } else {
      defaultBehavior = { kind: 'none', value: null };
    }

    // ---- length/precision constraints ----------------------------------
    const length = readBound(attr.length ?? null);
    const precision = readBound(attr.precision ?? null);
    const scale = readBound(attr.scale ?? null, { allowZero: true });
    if (!length.ok) {
      fail(
        'E_INVALID_BOUNDS',
        `attribute "${sourceName}" declares a non-positive length`,
        sourceName
      );
    }
    if (!precision.ok) {
      fail(
        'E_INVALID_BOUNDS',
        `attribute "${sourceName}" declares a non-positive precision`,
        sourceName
      );
    }
    if (!scale.ok) {
      fail(
        'E_INVALID_BOUNDS',
        `attribute "${sourceName}" declares a negative scale`,
        sourceName
      );
    }
    if (
      precision.ok &&
      scale.ok &&
      precision.value !== null &&
      scale.value !== null &&
      scale.value > precision.value
    ) {
      fail(
        'E_INVALID_BOUNDS',
        `attribute "${sourceName}" declares scale greater than precision`,
        sourceName
      );
    }

    const label =
      textOrNull(attr.grdLabel) ??
      textOrNull(attr.fnrLabel) ??
      textOrNull(attr.fedLabel) ??
      codeName;

    fields.push({
      sourceName,
      codeName,
      label,
      dbType,
      scalarType,
      nullable,
      primaryKey,
      mutability,
      defaultBehavior,
      constraints: {
        length: length.ok ? length.value : null,
        precision: precision.ok ? precision.value : null,
        scale: scale.ok ? scale.value : null,
      },
      visibility,
      // transient sort metadata, stripped before the model is assembled
      _sort: {
        orderable: attr.grdOrderAble === true,
        isDefault: attr.grdSort === true,
        sequence: Number.isInteger(attr.grdSortSequence)
          ? attr.grdSortSequence
          : 0,
        ascending: attr.grdSortAscending !== false,
      },
    });

    // ---- data-only validation rules ------------------------------------
    const rules = [];
    const requiredOn = [
      ...(createMandatory ? ['create'] : []),
      ...(updateMandatory ? ['update'] : []),
    ];
    if (requiredOn.length) rules.push({ rule: 'required', on: requiredOn });
    if (length.ok && length.value !== null) {
      rules.push({ rule: 'maxLength', value: length.value });
    }
    if (scalarType === 'integer') rules.push({ rule: 'integer' });
    if (scalarType === 'numeric' && precision.ok && precision.value !== null) {
      rules.push({
        rule: 'precision',
        precision: precision.value,
        scale: scale.ok && scale.value !== null ? scale.value : 0,
      });
    }
    if (rules.length) validation.push({ field: codeName, rules });
  }

  if (primaryKeyCount === 0) {
    fail('E_MISSING_PRIMARY_KEY', 'metadata declares no primary-key attribute');
  } else if (primaryKeyCount > 1) {
    fail(
      'E_COMPOSITE_PRIMARY_KEY',
      `composite primary keys are not supported (found ${primaryKeyCount} key columns)`
    );
  }

  // ---- page sizes -------------------------------------------------------
  let pageSizes = [...DEFAULT_PAGE_SIZES];
  const rawSizes = textOrNull(data.gridFooterTotalLines);
  if (rawSizes !== null) {
    const parsed = rawSizes.split(',').map((part) => Number(part.trim()));
    const valid = parsed.every(
      (n) =>
        Number.isInteger(n) &&
        n >= PAGE_SIZE_BOUNDS.min &&
        n <= PAGE_SIZE_BOUNDS.max
    );
    if (!valid || parsed.length === 0) {
      fail(
        'E_INVALID_BOUNDS',
        `gridFooterTotalLines "${rawSizes}" is not a list of page sizes within ${PAGE_SIZE_BOUNDS.min}..${PAGE_SIZE_BOUNDS.max}`
      );
    } else {
      pageSizes = parsed;
    }
  }

  if (diagnostics.length) {
    throw new PolluxNormalizationError(entityName ?? '<unknown>', diagnostics);
  }

  // ---- list capabilities ------------------------------------------------
  const listFields = fields.filter((f) => f.visibility.list);
  const visibleColumns = listFields.map((f) => f.codeName);
  const sortableFields = listFields
    .filter((f) => f._sort.orderable)
    .map((f) => f.codeName);
  const defaultSort = listFields
    .filter((f) => f._sort.isDefault)
    .sort((a, b) => a._sort.sequence - b._sort.sequence)
    .map((f) => ({
      field: f.codeName,
      direction: f._sort.ascending ? 'asc' : 'desc',
    }));
  if (defaultSort.length === 0) {
    const pk = fields.find((f) => f.primaryKey);
    defaultSort.push({ field: pk.codeName, direction: 'asc' });
  }
  const filterableFields = listFields.map((f) => f.codeName);
  const filterOperators = {};
  for (const f of listFields) {
    filterOperators[f.codeName] = [...FILTER_OPERATORS_BY_SCALAR[f.scalarType]];
  }

  // ---- unsupported capabilities (recorded, not fatal) --------------------
  const unsupportedCapabilities = [];
  if (data.gridButtonReport === true || data.makeFormReport === true) {
    unsupportedCapabilities.push('export');
  }
  if (data.gridButtonOperation === true || data.makeFormOperation === true) {
    unsupportedCapabilities.push('operation');
  }
  unsupportedCapabilities.sort(byCodeUnit);

  // ---- operations --------------------------------------------------------
  const enabledByOperation = {
    list: true,
    read: true,
    create: data.makeFormAdd !== false,
    update: data.makeFormUpdate !== false,
    delete: data.gridButtonDelete !== false,
  };
  const operations = {};
  for (const op of OPERATIONS) {
    const action = ACTION_BY_OPERATION[op];
    operations[op] = {
      enabled: enabledByOperation[op],
      permission: {
        resource: entityName,
        action,
        name: `${entityName}:${action}`,
      },
    };
  }

  // ---- titles ------------------------------------------------------------
  const listTitle = textOrNull(data.gridTitle) ?? entityName;
  const titles = {
    list: listTitle,
    create: textOrNull(data.formAddTitle) ?? listTitle,
    update: textOrNull(data.formUpdateTitle) ?? listTitle,
  };

  const model = {
    modelVersion: MODEL_VERSION,
    entity: {
      id: entityName,
      table,
      resourceCode: entityName,
      routes: { singular: entityName, plural: pluralSlug(entityName) },
      titles,
    },
    fields: fields.map(({ _sort, ...field }) => field),
    validation,
    list: {
      visibleColumns,
      sortableFields,
      filterableFields,
      defaultSort,
      pageSizes,
      defaultPageSize: pageSizes[0],
      filterOperators,
    },
    operations,
    unsupportedCapabilities,
  };

  return deepFreeze(model);
}

/**
 * Non-throwing wrapper: `{ ok: true, model }` or `{ ok: false, entity,
 * diagnostics }` with the same structured diagnostics.
 * @param {object} raw parsed metadata payload
 */
export function tryNormalizeEntityModel(raw) {
  try {
    return { ok: true, model: normalizeEntityModel(raw) };
  } catch (error) {
    if (error instanceof PolluxNormalizationError) {
      return {
        ok: false,
        entity: error.entity,
        diagnostics: error.diagnostics,
      };
    }
    throw error;
  }
}

/**
 * Canonical, deterministic JSON serialization of a model. Arrays keep their
 * order (field order = source order); object keys are sorted by UTF-16 code
 * units, independent of construction order, locale and platform. The same
 * model always yields byte-identical output.
 * @param {object} model PolluxEntityModel
 * @returns {string} canonical JSON (2-space indent, no trailing newline)
 */
export function serializeModel(model) {
  const canonicalize = (value) => {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (typeof value === 'object' && value !== null) {
      const out = {};
      for (const key of Object.keys(value).sort(byCodeUnit)) {
        out[key] = canonicalize(value[key]);
      }
      return out;
    }
    return value;
  };
  return JSON.stringify(canonicalize(model), null, 2);
}
