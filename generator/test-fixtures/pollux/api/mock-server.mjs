// SPEC-003 — mock implementation of the Pollux standalone API contract v2
// (see ./contract.md + ./contract.json). Pure Node (node:http, zero deps).
//
// The entity surface is seeded from `test-fixtures/pollux/entities/rich-valid.json`
// normalized through `scripts/pollux/model/normalize.mjs`, so the mock and the
// real generators key off the same model. Deterministic: stored data never
// reads Date.now — time flows through an injectable `clock`, and record ids
// through an injectable `idFactory`.
//
// Bearer tokens are TEST DOUBLES for capability tiers (not the PKCE/BFF flow):
//   token-admin    -> list/read/create/update/delete
//   token-readonly -> list/read
//   token-none     -> nothing
//
// Usage (tests):
//   const server = await start({ port: 0 });
//   ... fetch(`${server.url}/api/generated/v2/amostra`, ...) ...
//   await server.close();
//
// Usage (CLI): node test-fixtures/pollux/api/mock-server.mjs --port 4310

import { createHash, randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { normalizeEntityModel } from '../../../scripts/pollux/model/normalize.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RICH_VALID = path.join(HERE, '..', 'entities', 'rich-valid.json');

export const CONTRACT_VERSION = '2.0.0';
const BASE_PATH = '/api/generated/v2';
const IDEMPOTENCY_EXPIRY_MS = 24 * 60 * 60 * 1000;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;

const HTTP_BY_CODE = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  VALIDATION_FAILED: 400,
  NOT_FOUND: 404,
  CONFLICT: 409,
  REFERENCE_CONFLICT: 409,
  STALE_WRITE: 412,
  RATE_LIMITED: 429,
  SERVICE_UNAVAILABLE: 503,
  INTERNAL: 500,
};

const RETRYABLE_BY_CODE = {
  UNAUTHENTICATED: false,
  FORBIDDEN: false,
  VALIDATION_FAILED: false,
  NOT_FOUND: false,
  CONFLICT: false,
  REFERENCE_CONFLICT: false,
  STALE_WRITE: false,
  RATE_LIMITED: true,
  SERVICE_UNAVAILABLE: true,
  INTERNAL: false,
};

// Safe Portuguese messages — mirrors src/lib/generated-crud.ts.
const MESSAGE_BY_CODE = {
  UNAUTHENTICATED: 'Sessão expirada. Faça login novamente.',
  FORBIDDEN: 'Você não tem permissão para esta operação.',
  VALIDATION_FAILED: 'Dados inválidos. Verifique os campos e tente novamente.',
  NOT_FOUND: 'Registro não encontrado.',
  CONFLICT: 'Já existe um registro com estes dados.',
  REFERENCE_CONFLICT:
    'Existem registros utilizados em outras tabelas - Nenhuma exclusão foi realizada',
  STALE_WRITE:
    'Este registro foi alterado por outro usuário. Recarregue os dados.',
  RATE_LIMITED: 'Muitas solicitações. Aguarde um instante e tente novamente.',
  SERVICE_UNAVAILABLE: 'Serviço temporariamente indisponível. Tente novamente.',
  INTERNAL: 'Erro inesperado. Tente novamente ou contate o suporte.',
};

const ALL_TRUE = Object.freeze({
  list: true,
  read: true,
  create: true,
  update: true,
  delete: true,
});
const READ_ONLY = Object.freeze({
  list: true,
  read: true,
  create: false,
  update: false,
  delete: false,
});
const ALL_FALSE = Object.freeze({
  list: false,
  read: false,
  create: false,
  update: false,
  delete: false,
});

export const DEFAULT_CAPABILITY_BY_TOKEN = Object.freeze({
  'token-admin': ALL_TRUE,
  'token-readonly': READ_ONLY,
  'token-none': ALL_FALSE,
});

const STRING_FAMILY = new Set(['string', 'varchar', 'text']);

/** Deterministic seed rows for the `amostra` entity (fixed literals only). */
export const SEED_ROWS = Object.freeze([
  {
    id: '00000000-0000-4000-8000-000000000001',
    titulo: 'Ação de Boas-Vindas',
    descricao: 'Primeira amostra — descrição com acentuação (ção, ã, é).',
    ativo: true,
    quantidadeMaxima: 10,
    preco: '199.90',
    dataInicio: '2026-01-05',
    horaInicio: '08:30:00',
    criadoEm: '2026-01-01T10:00:00.000Z',
  },
  {
    id: '00000000-0000-4000-8000-000000000002',
    titulo: 'Bênção Matinal',
    descricao: 'Segunda amostra.',
    ativo: false,
    quantidadeMaxima: null,
    preco: null,
    dataInicio: '2026-02-10',
    horaInicio: null,
    criadoEm: '2026-01-02T10:00:00.000Z',
  },
  {
    id: '00000000-0000-4000-8000-000000000003',
    titulo: 'Círculo de Estudos',
    descricao: null,
    ativo: true,
    quantidadeMaxima: 25,
    preco: '0.50',
    dataInicio: null,
    horaInicio: '19:00:00',
    criadoEm: '2026-01-03T10:00:00.000Z',
  },
  {
    id: '00000000-0000-4000-8000-000000000004',
    titulo: 'Divulgação — referência viva',
    descricao: 'Este registro é referenciado por outra tabela (fixture).',
    ativo: true,
    quantidadeMaxima: 3,
    preco: '15.00',
    dataInicio: '2026-03-01',
    horaInicio: '14:15:00',
    criadoEm: '2026-01-04T10:00:00.000Z',
  },
  {
    id: '00000000-0000-4000-8000-000000000005',
    titulo: 'Encontro Fraterno',
    descricao: 'Quinta amostra.',
    ativo: false,
    quantidadeMaxima: 100,
    preco: '1234.56',
    dataInicio: '2026-04-20',
    horaInicio: '20:45:00',
    criadoEm: '2026-01-05T10:00:00.000Z',
  },
  {
    id: '00000000-0000-4000-8000-000000000006',
    titulo: 'Feira do Livro Espírita',
    descricao: 'Sexta amostra.',
    ativo: true,
    quantidadeMaxima: 7,
    preco: '42.00',
    dataInicio: '2026-05-15',
    horaInicio: '09:00:00',
    criadoEm: '2026-01-06T10:00:00.000Z',
  },
  {
    id: '00000000-0000-4000-8000-000000000007',
    titulo: 'Grupo de Oração',
    descricao: 'Sétima amostra.',
    ativo: true,
    quantidadeMaxima: null,
    preco: '10.10',
    dataInicio: '2026-06-01',
    horaInicio: '18:30:00',
    criadoEm: '2026-01-07T10:00:00.000Z',
  },
]);

/** Row id seeded as "referenced by another table" (delete -> REFERENCE_CONFLICT). */
export const REFERENCED_ROW_ID = '00000000-0000-4000-8000-000000000004';

// ---------------------------------------------------------------------------
// helpers

class ApiError extends Error {
  constructor(code, fieldErrors) {
    super(MESSAGE_BY_CODE[code]);
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

/** Canonical JSON: object keys sorted by UTF-16 code units, arrays kept. */
const canonicalJson = (value) => {
  const sort = (v) => {
    if (Array.isArray(v)) return v.map(sort);
    if (typeof v === 'object' && v !== null) {
      const out = {};
      for (const key of Object.keys(v).sort((a, b) =>
        a < b ? -1 : a > b ? 1 : 0
      )) {
        out[key] = sort(v[key]);
      }
      return out;
    }
    return v;
  };
  return JSON.stringify(sort(value));
};

const hashBody = (body) =>
  createHash('sha256')
    .update(body === undefined ? '' : canonicalJson(body))
    .digest('hex');

const NUMERIC_PATTERN = /^-?\d+(\.\d+)?$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^\d{2}:\d{2}:\d{2}$/;
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

/** Validate + normalize one wire value for a field. Returns error key or null. */
const valueError = (field, value) => {
  if (value === null) return field.nullable ? null : 'required';
  switch (field.scalarType) {
    case 'uuid':
    case 'string':
    case 'varchar':
    case 'text': {
      if (typeof value !== 'string') return 'invalid_type';
      const max = field.constraints.length;
      if (max !== null && value.length > max) return 'max_length';
      return null;
    }
    case 'boolean':
      return typeof value === 'boolean' ? null : 'invalid_type';
    case 'integer':
      return Number.isInteger(value) ? null : 'invalid_type';
    case 'float':
      return typeof value === 'number' && Number.isFinite(value)
        ? null
        : 'invalid_type';
    case 'numeric': {
      if (typeof value !== 'string' || value === '') return 'invalid_type';
      if (!NUMERIC_PATTERN.test(value)) return 'invalid_type';
      const { precision, scale } = field.constraints;
      if (precision !== null) {
        const [ints = '', decs = ''] = value.replace('-', '').split('.');
        const s = scale ?? 0;
        if (decs.length > s || ints.length > precision - s) {
          return 'out_of_range';
        }
      }
      return null;
    }
    case 'date':
      return typeof value === 'string' && DATE_PATTERN.test(value)
        ? null
        : 'invalid_type';
    case 'time':
      return typeof value === 'string' && TIME_PATTERN.test(value)
        ? null
        : 'invalid_type';
    case 'timestamp':
      return typeof value === 'string' && TIMESTAMP_PATTERN.test(value)
        ? null
        : 'invalid_type';
    default:
      return 'invalid_type';
  }
};

const compareValues = (a, b, scalarType) => {
  // Nulls always sort last, regardless of direction.
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  if (scalarType === 'numeric') {
    const diff = Number(a) - Number(b);
    return diff < 0 ? -1 : diff > 0 ? 1 : 0;
  }
  if (typeof a === 'number' && typeof b === 'number') {
    return a < b ? -1 : a > b ? 1 : 0;
  }
  if (typeof a === 'boolean' && typeof b === 'boolean') {
    return a === b ? 0 : a ? 1 : -1;
  }
  const sa = String(a);
  const sb = String(b);
  return sa < sb ? -1 : sa > sb ? 1 : 0;
};

const filterMatch = (rowValue, operator, rawValue, scalarType) => {
  if (operator === 'contains') {
    return (
      rowValue !== null &&
      String(rowValue).toLowerCase().includes(rawValue.toLowerCase())
    );
  }
  // Coerce the query-string value into the wire domain for comparison.
  let candidate = rawValue;
  if (scalarType === 'boolean') {
    if (rawValue !== 'true' && rawValue !== 'false') return false;
    candidate = rawValue === 'true';
  } else if (scalarType === 'integer' || scalarType === 'float') {
    candidate = Number(rawValue);
    if (!Number.isFinite(candidate)) return false;
  }
  if (rowValue === null) return false;
  const cmp = compareValues(rowValue, candidate, scalarType);
  switch (operator) {
    case 'eq':
      return cmp === 0;
    case 'gt':
      return cmp > 0;
    case 'gte':
      return cmp >= 0;
    case 'lt':
      return cmp < 0;
    case 'lte':
      return cmp <= 0;
    default:
      return false;
  }
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// server

/**
 * Start the mock server.
 *
 * @param {object} [options]
 * @param {number} [options.port] port (0 = ephemeral, default)
 * @param {() => number} [options.clock] injectable ms clock (idempotency
 *   expiry + server-derived timestamps); defaults to Date.now
 * @param {() => string} [options.idFactory] id generator for created rows
 * @param {Record<string, object>} [options.capabilityByToken] per-token
 *   capability map override ({ token: {list,read,create,update,delete} })
 * @param {number} [options.idempotencyWaitMs] bounded wait for concurrent
 *   in_progress duplicates before SERVICE_UNAVAILABLE (default 250)
 * @param {number} [options.mutationDelayMs] artificial mutation latency —
 *   test knob to make the in_progress window observable (default 0)
 * @param {string} [options.metadataDir] directory of additional entity
 *   metadata files (dbtool envelope, e.g. a workspace's pollux-metadata/);
 *   each valid file becomes a served entity with deterministic sample rows
 * @returns {Promise<{url: string, port: number, close: () => Promise<void>}>}
 */

/** Deterministic sample rows for an extra (non-fixture) entity. */
const buildSampleSeeds = (model, count = 5) => {
  const pk = model.fields.find((f) => f.primaryKey);
  const seeds = [];
  for (let n = 1; n <= count; n += 1) {
    const record = {};
    let firstString = true;
    for (const field of model.fields) {
      if (field === pk) {
        record[field.codeName] =
          `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
        continue;
      }
      switch (field.scalarType) {
        case 'string':
        case 'varchar':
        case 'text':
          record[field.codeName] = firstString
            ? `${field.label} ${n}`
            : `Exemplo ${n}`;
          firstString = false;
          break;
        case 'boolean':
          record[field.codeName] = n % 2 === 1;
          break;
        case 'integer':
          record[field.codeName] = n * 10;
          break;
        case 'float':
          record[field.codeName] = n * 1.5;
          break;
        case 'numeric':
          record[field.codeName] = `${n * 100}.50`;
          break;
        case 'date':
          record[field.codeName] = `2026-01-0${n}`;
          break;
        case 'time':
          record[field.codeName] = '09:00:00';
          break;
        case 'timestamp':
          record[field.codeName] = `2026-01-0${n}T12:00:00Z`;
          break;
        case 'uuid':
          record[field.codeName] =
            `00000000-0000-4000-9000-${String(n).padStart(12, '0')}`;
          break;
        default:
          record[field.codeName] = field.nullable ? null : `valor-${n}`;
      }
    }
    seeds.push(record);
  }
  return seeds;
};

export async function start(options = {}) {
  const clock = options.clock ?? Date.now;
  const idFactory = options.idFactory ?? randomUUID;
  const capabilityByToken =
    options.capabilityByToken ?? DEFAULT_CAPABILITY_BY_TOKEN;
  const idempotencyWaitMs = options.idempotencyWaitMs ?? 250;
  const mutationDelayMs = options.mutationDelayMs ?? 0;

  // Entity roster: the rich-valid fixture (canonical contract surface) plus
  // any valid metadata files from options.metadataDir (multi-entity mode for
  // local development of authored entities).
  const entityInputs = [
    {
      model: normalizeEntityModel(JSON.parse(readFileSync(RICH_VALID, 'utf8'))),
      seedRows: SEED_ROWS,
      referencedRowId: REFERENCED_ROW_ID,
    },
  ];
  if (options.metadataDir) {
    for (const file of readdirSync(options.metadataDir).sort()) {
      if (!file.endsWith('.json')) continue;
      let parsed;
      try {
        parsed = JSON.parse(
          readFileSync(path.join(options.metadataDir, file), 'utf8')
        );
      } catch {
        continue;
      }
      if (!parsed?.data?.attributes) continue;
      const model = normalizeEntityModel(parsed);
      if (entityInputs.some((e) => e.model.entity.id === model.entity.id)) {
        continue;
      }
      entityInputs.push({
        model,
        seedRows: buildSampleSeeds(model),
        referencedRowId: null,
      });
    }
  }

  /** @type {Map<string, {state: string, bodyHash: string, status?: number, body?: string, replayHeaders?: object, expiresAt?: number, promise: Promise<void>, resolve: () => void}>} */
  const idempotencyStore = new Map();

  let requestCounter = 0;

  const resolveRequestId = (req) => {
    const supplied = req.headers['x-request-id'];
    if (typeof supplied === 'string' && REQUEST_ID_PATTERN.test(supplied)) {
      return supplied;
    }
    requestCounter += 1;
    return `mock-${requestCounter.toString(36)}-${clock().toString(36)}`;
  };

  // Per-entity closure: rows, validation, list + mutation semantics. One
  // store per served entity; the idempotency store stays global (its scope
  // key embeds the canonical path, which carries the entity id).
  const makeStore = ({ model, seedRows, referencedRowId }) => {
    const entityId = model.entity.id;
    const fieldByCode = new Map(model.fields.map((f) => [f.codeName, f]));
    const pkField = model.fields.find((f) => f.primaryKey);
    const searchableColumns = model.fields
      .filter((f) => f.visibility.list && STRING_FAMILY.has(f.scalarType))
      .map((f) => f.codeName);

    /** @type {Map<string, {record: object, version: number, referenced: boolean}>} */
    const rows = new Map();
    for (const seed of seedRows) {
      rows.set(seed[pkField.codeName], {
        record: { ...seed },
        version: 1,
        referenced: seed[pkField.codeName] === referencedRowId,
      });
    }

    const writable = (operation) =>
      model.fields.filter((f) =>
        operation === 'create'
          ? f.mutability === 'createOnly' || f.mutability === 'createAndUpdate'
          : f.mutability === 'updateOnly' || f.mutability === 'createAndUpdate'
      );

    const validateMutationBody = (body, operation) => {
      if (typeof body !== 'object' || body === null || Array.isArray(body)) {
        throw new ApiError('VALIDATION_FAILED');
      }
      const allowed = new Map(writable(operation).map((f) => [f.codeName, f]));
      const fieldErrors = {};
      for (const key of Object.keys(body)) {
        if (!allowed.has(key)) fieldErrors[key] = ['unknown_field'];
      }
      for (const [code, field] of allowed) {
        const provided = Object.hasOwn(body, code);
        const value = provided ? body[code] : undefined;
        const required = model.validation.some(
          (v) =>
            v.field === code &&
            v.rules.some(
              (r) => r.rule === 'required' && r.on.includes(operation)
            )
        );
        if (!provided) {
          if (operation === 'create' && required) {
            fieldErrors[code] = ['required'];
          }
          continue;
        }
        if (value === null && required) {
          fieldErrors[code] = ['required'];
          continue;
        }
        const err = valueError(field, value);
        if (err) fieldErrors[code] = [err];
      }
      if (Object.keys(fieldErrors).length > 0) {
        throw new ApiError('VALIDATION_FAILED', fieldErrors);
      }
    };

    const applyDefaults = (record) => {
      for (const field of model.fields) {
        if (record[field.codeName] !== undefined) continue;
        const { kind, value } = field.defaultBehavior;
        if (kind === 'literal') {
          record[field.codeName] =
            field.scalarType === 'boolean'
              ? value === 'true'
              : field.scalarType === 'integer' || field.scalarType === 'float'
                ? Number(value)
                : value;
        } else {
          record[field.codeName] = null;
        }
      }
    };

    const listHandler = (query, capabilities) => {
      const knownKeys = new Set(['page', 'pageSize', 'sort', 'q']);
      const filters = [];
      const fieldErrors = {};
      for (const [rawKey, rawValue] of query.entries()) {
        if (knownKeys.has(rawKey)) continue;
        const match = rawKey.match(/^f_([A-Za-z0-9]+?)(?:__([a-z]+))?$/);
        const codeName = match?.[1];
        const field = codeName ? fieldByCode.get(codeName) : undefined;
        if (
          !match ||
          !field ||
          !model.list.filterableFields.includes(codeName)
        ) {
          fieldErrors[rawKey] = ['unknown_parameter'];
          continue;
        }
        const operator =
          match[2] ?? (STRING_FAMILY.has(field.scalarType) ? 'contains' : 'eq');
        const allowedOps = model.list.filterOperators[codeName] ?? [];
        if (!allowedOps.includes(operator)) {
          fieldErrors[rawKey] = ['unknown_operator'];
          continue;
        }
        filters.push({ field, operator, value: rawValue });
      }

      const pageRaw = query.get('page') ?? '1';
      const page = Number(pageRaw);
      if (!Number.isInteger(page) || page < 1) {
        fieldErrors.page = ['invalid_page'];
      }
      const pageSizeRaw = query.get('pageSize');
      const pageSize =
        pageSizeRaw === null ? model.list.defaultPageSize : Number(pageSizeRaw);
      if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 500) {
        fieldErrors.pageSize = ['invalid_page_size'];
      }

      let sort = model.list.defaultSort.map((s) => ({
        id: s.field,
        desc: s.direction === 'desc',
      }));
      const sortRaw = query.get('sort');
      if (sortRaw !== null) {
        let parsed;
        try {
          parsed = JSON.parse(sortRaw);
        } catch {
          parsed = null;
        }
        if (
          !Array.isArray(parsed) ||
          parsed.some(
            (s) =>
              typeof s !== 'object' ||
              s === null ||
              typeof s.id !== 'string' ||
              typeof s.desc !== 'boolean' ||
              !model.list.sortableFields.includes(s.id)
          )
        ) {
          fieldErrors.sort = ['invalid_sort'];
        } else if (parsed.length > 0) {
          sort = parsed;
        }
      }

      if (Object.keys(fieldErrors).length > 0) {
        throw new ApiError('VALIDATION_FAILED', fieldErrors);
      }

      const q = query.get('q');
      let selected = [...rows.values()].map((entry) => entry.record);
      if (q) {
        const needle = q.toLowerCase();
        selected = selected.filter((record) =>
          searchableColumns.some(
            (col) =>
              record[col] !== null &&
              String(record[col]).toLowerCase().includes(needle)
          )
        );
      }
      for (const { field, operator, value } of filters) {
        selected = selected.filter((record) =>
          filterMatch(record[field.codeName], operator, value, field.scalarType)
        );
      }
      selected.sort((a, b) => {
        for (const { id, desc } of sort) {
          const field = fieldByCode.get(id);
          const cmp = compareValues(
            a[id],
            b[id],
            field?.scalarType ?? 'string'
          );
          if (cmp !== 0) return desc ? -cmp : cmp;
        }
        // Stable, deterministic tiebreak on the primary key.
        return compareValues(a[pkField.codeName], b[pkField.codeName], 'uuid');
      });

      const totalRows = selected.length;
      const startIndex = (page - 1) * pageSize;
      return {
        status: 200,
        payload: {
          rows: selected.slice(startIndex, startIndex + pageSize),
          totalRows,
          page,
          pageSize,
          capabilities,
        },
      };
    };

    const runMutation = async (operation, id, body, ifMatch) => {
      if (mutationDelayMs > 0) await sleep(mutationDelayMs);
      if (operation === 'create') {
        validateMutationBody(body ?? {}, 'create');
        const record = { ...body };
        record[pkField.codeName] = idFactory();
        applyDefaults(record);
        rows.set(record[pkField.codeName], {
          record,
          version: 1,
          referenced: false,
        });
        return { status: 201, payload: record, version: 1 };
      }
      const entry = rows.get(id);
      if (!entry) throw new ApiError('NOT_FOUND');
      if (operation === 'update') {
        if (ifMatch !== undefined && ifMatch !== String(entry.version)) {
          throw new ApiError('STALE_WRITE');
        }
        validateMutationBody(body ?? {}, 'update');
        Object.assign(entry.record, body ?? {});
        entry.version += 1;
        return { status: 200, payload: entry.record, version: entry.version };
      }
      // delete
      if (entry.referenced) throw new ApiError('REFERENCE_CONFLICT');
      rows.delete(id);
      return { status: 200, payload: { id, deleted: true } };
    };

    return { entityId, rows, listHandler, runMutation };
  };

  const stores = new Map(
    entityInputs.map((input) => {
      const store = makeStore(input);
      return [store.entityId, store];
    })
  );

  const handleIdempotent = async (store, req, operation, id, body) => {
    const key = req.headers['idempotency-key'];
    if (typeof key !== 'string' || key.length === 0 || key.length > 200) {
      throw new ApiError('VALIDATION_FAILED', {
        'Idempotency-Key': ['required'],
      });
    }
    const token = bearerToken(req);
    const actorId = `actor-${token}`;
    const clientId = `client-${token}`;
    const canonicalPath = id
      ? `${BASE_PATH}/${store.entityId}/${id}`
      : `${BASE_PATH}/${store.entityId}`;
    const scope = [actorId, clientId, req.method, canonicalPath, key].join(' ');
    const bodyHash = hashBody(body);
    const now = clock();

    const existing = idempotencyStore.get(scope);
    if (existing) {
      if (existing.state === 'complete' && existing.expiresAt <= now) {
        idempotencyStore.delete(scope); // expired: fall through to fresh run
      } else if (existing.state === 'in_progress') {
        // Bounded wait, then replay or retryable SERVICE_UNAVAILABLE.
        // The mutation never runs concurrently.
        await Promise.race([existing.promise, sleep(idempotencyWaitMs)]);
        const settled = idempotencyStore.get(scope);
        if (settled && settled.state === 'complete') {
          if (settled.bodyHash !== bodyHash) throw new ApiError('CONFLICT');
          return {
            status: settled.status,
            rawBody: settled.body,
            headers: { 'Idempotency-Replayed': 'true' },
          };
        }
        throw new ApiError('SERVICE_UNAVAILABLE');
      } else {
        if (existing.bodyHash !== bodyHash) throw new ApiError('CONFLICT');
        return {
          status: existing.status,
          rawBody: existing.body,
          headers: { 'Idempotency-Replayed': 'true' },
        };
      }
    }

    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const record = {
      state: 'in_progress',
      bodyHash,
      promise: gate,
      resolve: release,
    };
    idempotencyStore.set(scope, record);
    try {
      const result = await store.runMutation(
        operation,
        id,
        body,
        typeof req.headers['if-match'] === 'string'
          ? req.headers['if-match']
          : undefined
      );
      const rawBody = JSON.stringify({ ok: true, data: result.payload });
      record.state = 'complete';
      record.status = result.status;
      record.body = rawBody;
      record.expiresAt = clock() + IDEMPOTENCY_EXPIRY_MS;
      return {
        status: result.status,
        rawBody,
        headers:
          result.version !== undefined ? { ETag: String(result.version) } : {},
      };
    } catch (error) {
      // Failed attempts do not burn the key: the client may retry with it.
      idempotencyStore.delete(scope);
      throw error;
    } finally {
      record.resolve();
    }
  };

  const bearerToken = (req) => {
    const header = req.headers.authorization;
    if (typeof header !== 'string' || !header.startsWith('Bearer ')) {
      return null;
    }
    return header.slice('Bearer '.length);
  };

  const server = http.createServer((req, res) => {
    const requestId = resolveRequestId(req);
    res.setHeader('X-Request-Id', requestId);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');

    const sendError = (code, fieldErrors) => {
      res.statusCode = HTTP_BY_CODE[code] ?? 500;
      res.end(
        JSON.stringify({
          ok: false,
          code,
          message: MESSAGE_BY_CODE[code],
          requestId,
          retryable: RETRYABLE_BY_CODE[code],
          ...(fieldErrors ? { fieldErrors } : {}),
        })
      );
    };

    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      handle(Buffer.concat(chunks)).catch((error) => {
        if (error instanceof ApiError) {
          sendError(error.code, error.fieldErrors);
        } else {
          sendError('INTERNAL');
        }
      });
    });

    const handle = async (rawBody) => {
      const url = new URL(req.url ?? '/', 'http://mock.invalid');
      const segments = url.pathname.split('/').filter(Boolean);
      // Expect: api / generated / v2 / :entity [/ :id | capabilities]
      if (
        segments.length < 4 ||
        segments.length > 5 ||
        segments[0] !== 'api' ||
        segments[1] !== 'generated' ||
        segments[2] !== 'v2'
      ) {
        throw new ApiError('NOT_FOUND');
      }

      const token = bearerToken(req);
      const capabilities =
        token !== null ? capabilityByToken[token] : undefined;
      if (!capabilities) throw new ApiError('UNAUTHENTICATED');

      const store = stores.get(segments[3]);
      if (!store) throw new ApiError('NOT_FOUND');
      const tail = segments[4];

      const requireCapability = (operation) => {
        if (!capabilities[operation]) throw new ApiError('FORBIDDEN');
      };

      const parseBody = () => {
        if (rawBody.length === 0) return undefined;
        const contentType = req.headers['content-type'] ?? '';
        if (!contentType.includes('application/json')) {
          throw new ApiError('VALIDATION_FAILED');
        }
        try {
          return JSON.parse(rawBody.toString('utf8'));
        } catch {
          throw new ApiError('VALIDATION_FAILED');
        }
      };

      const send = (status, payload, headers = {}) => {
        res.statusCode = status;
        for (const [name, value] of Object.entries(headers)) {
          res.setHeader(name, value);
        }
        res.end(JSON.stringify({ ok: true, data: payload }));
      };

      if (req.method === 'GET' && tail === 'capabilities') {
        send(200, { ...capabilities });
        return;
      }
      if (req.method === 'GET' && tail === undefined) {
        requireCapability('list');
        const result = store.listHandler(url.searchParams, {
          ...capabilities,
        });
        send(result.status, result.payload);
        return;
      }
      if (req.method === 'GET') {
        requireCapability('read');
        const entry = store.rows.get(tail);
        if (!entry) throw new ApiError('NOT_FOUND');
        send(200, entry.record, { ETag: String(entry.version) });
        return;
      }

      const operation =
        req.method === 'POST' && tail === undefined
          ? 'create'
          : req.method === 'PATCH' && tail !== undefined
            ? 'update'
            : req.method === 'DELETE' && tail !== undefined
              ? 'delete'
              : null;
      if (!operation || tail === 'capabilities') {
        throw new ApiError('NOT_FOUND');
      }
      requireCapability(operation);
      const body = parseBody();
      const outcome = await handleIdempotent(store, req, operation, tail, body);
      res.statusCode = outcome.status;
      for (const [name, value] of Object.entries(outcome.headers ?? {})) {
        res.setHeader(name, value);
      }
      res.end(outcome.rawBody);
    };
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port ?? 0, '127.0.0.1', resolve);
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;

  return {
    url: `http://127.0.0.1:${port}`,
    port,
    entities: [...stores.keys()],
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

// ---------------------------------------------------------------------------
// CLI entry: node test-fixtures/pollux/api/mock-server.mjs --port 4310

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const portFlag = process.argv.indexOf('--port');
  const port = portFlag !== -1 ? Number(process.argv[portFlag + 1]) : 4310;
  const dirInline = process.argv.find((a) => a.startsWith('--metadata-dir='));
  const metadataDir = dirInline
    ? dirInline.slice('--metadata-dir='.length)
    : undefined;
  start({ port, metadataDir }).then(
    (server) => {
      console.log(
        `pollux mock API v${CONTRACT_VERSION} listening on ${server.url}${BASE_PATH}/{${server.entities.join(',')}}`
      );
      console.log(
        'tokens: token-admin | token-readonly | token-none (Authorization: Bearer <token>)'
      );
    },
    (error) => {
      console.error(error);
      process.exit(1);
    }
  );
}
