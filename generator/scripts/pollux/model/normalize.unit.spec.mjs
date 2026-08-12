// SPEC-002 — node:test suite for the normalized Pollux entity model.
// Run with: node --test scripts/pollux/model/
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

import {
  normalizeEntityModel,
  PolluxNormalizationError,
  serializeModel,
  tryNormalizeEntityModel,
} from './normalize.mjs';
import { MODEL_VERSION, validateEntityModel } from './schema.mjs';

const repoRoot = resolve(new URL('.', import.meta.url).pathname, '../../..');
const fixturesDir = resolve(repoRoot, 'test-fixtures/pollux/entities');

const loadFixture = (name) =>
  JSON.parse(readFileSync(resolve(fixturesDir, `${name}.json`), 'utf8'));
const loadRepoEntity = (name) =>
  JSON.parse(
    readFileSync(resolve(repoRoot, 'json-files', `${name}.json`), 'utf8')
  );

/** Assert normalization fails and return the collected diagnostics. */
const diagnosticsOf = (raw) => {
  const result = tryNormalizeEntityModel(raw);
  assert.equal(result.ok, false, 'expected normalization to fail');
  assert.ok(result.diagnostics.length > 0);
  for (const d of result.diagnostics) {
    assert.equal(typeof d.code, 'string');
    assert.equal(typeof d.message, 'string');
  }
  return result.diagnostics;
};

/** Minimal in-memory raw payload builder following the json-files shape. */
const makeRaw = (overrides = {}, attributes = []) => ({
  success: true,
  data: {
    name: 'fixt',
    dbName: 'fixt',
    gridTitle: 'Fixture',
    attributes: [
      {
        name: 'id',
        dataType: 'uuid',
        isPrimaryKey: true,
        isNullable: false,
        defaultValue: 'NULL',
        position: 1,
        grdIsinGrid: false,
        fnrIsinFormAdd: false,
        fedIsinFormUpd: false,
      },
      ...attributes,
    ],
    ...overrides,
  },
});

const makeAttr = (overrides = {}) => ({
  name: 'campo',
  dataType: 'char',
  isPrimaryKey: false,
  isNullable: true,
  defaultValue: 'NULL',
  position: 2,
  grdIsinGrid: true,
  grdLabel: 'Campo',
  fnrIsinFormAdd: true,
  fnrLabel: 'Campo',
  fnrMandatory: 'não',
  fnrReadonly: 'não',
  fedIsinFormUpd: true,
  fedLabel: 'Campo',
  fedMandatory: 'não',
  fedReadonly: 'nunca',
  ...overrides,
});

describe('rich valid fixture', () => {
  const model = normalizeEntityModel(loadFixture('rich-valid'));

  it('produces a schema-valid frozen model', () => {
    assert.deepEqual(validateEntityModel(model), []);
    assert.equal(model.modelVersion, MODEL_VERSION);
    assert.ok(Object.isFrozen(model));
    assert.ok(Object.isFrozen(model.fields));
    assert.ok(Object.isFrozen(model.fields[0]));
    assert.ok(Object.isFrozen(model.list.defaultSort));
  });

  it('normalizes entity identity, slugs and Portuguese titles', () => {
    assert.deepEqual(model.entity, {
      id: 'amostra',
      table: 'amostra',
      resourceCode: 'amostra',
      routes: { singular: 'amostra', plural: 'amostras' },
      titles: {
        list: 'Amostras de Verificação',
        create: 'Nova Amostra',
        update: 'Editar Amostra',
      },
    });
  });

  it('keeps field order and maps every scalar type', () => {
    assert.deepEqual(
      model.fields.map((f) => [f.codeName, f.scalarType]),
      [
        ['id', 'uuid'],
        ['titulo', 'string'],
        ['descricao', 'text'],
        ['ativo', 'boolean'],
        ['quantidadeMaxima', 'integer'],
        ['preco', 'numeric'],
        ['dataInicio', 'date'],
        ['horaInicio', 'time'],
        ['criadoEm', 'timestamp'],
      ]
    );
  });

  it('preserves accented labels and nullability', () => {
    const byName = Object.fromEntries(model.fields.map((f) => [f.codeName, f]));
    assert.equal(byName.titulo.label, 'Título');
    assert.equal(byName.titulo.nullable, false);
    assert.equal(byName.descricao.label, 'Descrição');
    assert.equal(byName.descricao.nullable, true);
    assert.equal(byName.quantidadeMaxima.label, 'Quantidade Máxima');
    assert.equal(byName.preco.label, 'Preço');
    assert.equal(byName.dataInicio.label, 'Data de Início');
  });

  it('derives mutability and visibility differences', () => {
    const byName = Object.fromEntries(model.fields.map((f) => [f.codeName, f]));
    assert.equal(byName.id.mutability, 'none');
    assert.equal(byName.titulo.mutability, 'createAndUpdate');
    // descricao is on the create form but not the update form
    assert.equal(byName.descricao.mutability, 'createOnly');
    assert.deepEqual(byName.descricao.visibility, {
      list: true,
      create: true,
      update: false,
    });
    // criadoEm is list-only
    assert.equal(byName.criadoEm.mutability, 'none');
    assert.deepEqual(byName.criadoEm.visibility, {
      list: true,
      create: false,
      update: false,
    });
  });

  it('derives default behavior, constraints and data-only validation', () => {
    const byName = Object.fromEntries(model.fields.map((f) => [f.codeName, f]));
    assert.deepEqual(byName.id.defaultBehavior, {
      kind: 'generated',
      value: null,
    });
    assert.deepEqual(byName.ativo.defaultBehavior, {
      kind: 'literal',
      value: 'true',
    });
    assert.deepEqual(byName.titulo.constraints, {
      length: 120,
      precision: null,
      scale: null,
    });
    assert.deepEqual(byName.preco.constraints, {
      length: null,
      precision: 10,
      scale: 2,
    });
    assert.deepEqual(model.validation, [
      {
        field: 'titulo',
        rules: [
          { rule: 'required', on: ['create', 'update'] },
          { rule: 'maxLength', value: 120 },
        ],
      },
      { field: 'quantidadeMaxima', rules: [{ rule: 'integer' }] },
      {
        field: 'preco',
        rules: [{ rule: 'precision', precision: 10, scale: 2 }],
      },
    ]);
  });

  it('derives list capabilities: columns, sort, filters, page sizes', () => {
    assert.deepEqual(model.list.visibleColumns, [
      'titulo',
      'descricao',
      'ativo',
      'quantidadeMaxima',
      'preco',
      'dataInicio',
      'horaInicio',
      'criadoEm',
    ]);
    assert.deepEqual(model.list.sortableFields, [
      'titulo',
      'ativo',
      'quantidadeMaxima',
      'preco',
      'dataInicio',
      'criadoEm',
    ]);
    assert.deepEqual(model.list.defaultSort, [
      { field: 'titulo', direction: 'asc' },
      { field: 'criadoEm', direction: 'desc' },
    ]);
    assert.deepEqual(model.list.pageSizes, [5, 10, 25, 50]);
    assert.equal(model.list.defaultPageSize, 5);
    assert.deepEqual(model.list.filterOperators.titulo, ['contains', 'eq']);
    assert.deepEqual(model.list.filterOperators.ativo, ['eq']);
    assert.deepEqual(model.list.filterOperators.preco, [
      'eq',
      'gt',
      'gte',
      'lt',
      'lte',
    ]);
    assert.deepEqual(model.list.filterOperators.criadoEm, [
      'eq',
      'gt',
      'gte',
      'lt',
      'lte',
    ]);
  });

  it('derives operations with permission names', () => {
    assert.deepEqual(model.operations.list, {
      enabled: true,
      permission: { resource: 'amostra', action: 'read', name: 'amostra:read' },
    });
    assert.equal(model.operations.read.permission.name, 'amostra:read');
    assert.equal(model.operations.create.permission.name, 'amostra:create');
    assert.equal(model.operations.update.permission.name, 'amostra:update');
    assert.equal(model.operations.delete.permission.name, 'amostra:delete');
    assert.ok(model.operations.create.enabled);
    assert.ok(model.operations.delete.enabled);
    assert.deepEqual(model.unsupportedCapabilities, []);
  });
});

describe('deterministic serialization', () => {
  it('normalizing the same fixture twice yields byte-equal JSON', () => {
    const a = serializeModel(normalizeEntityModel(loadFixture('rich-valid')));
    const b = serializeModel(normalizeEntityModel(loadFixture('rich-valid')));
    assert.equal(a, b);
  });

  it('serialization is independent of raw metadata key order', () => {
    const raw = loadFixture('rich-valid');
    const reordered = JSON.parse(JSON.stringify(raw));
    // Rebuild data with reversed key insertion order (same content).
    reordered.data = Object.fromEntries(
      Object.entries(reordered.data).reverse()
    );
    reordered.data.attributes = raw.data.attributes.map((attr) =>
      Object.fromEntries(Object.entries(attr).reverse())
    );
    assert.equal(
      serializeModel(normalizeEntityModel(raw)),
      serializeModel(normalizeEntityModel(reordered))
    );
  });

  it('serialized model parses back to the same structure', () => {
    const model = normalizeEntityModel(loadFixture('rich-valid'));
    assert.deepEqual(
      JSON.parse(serializeModel(model)),
      JSON.parse(serializeModel(model))
    );
    assert.deepEqual(
      validateEntityModel(JSON.parse(serializeModel(model))),
      []
    );
  });
});

describe('unsupported and invalid metadata diagnostics', () => {
  it('missing-key fixture: E_MISSING_PRIMARY_KEY', () => {
    const diagnostics = diagnosticsOf(loadFixture('missing-key'));
    assert.ok(diagnostics.some((d) => d.code === 'E_MISSING_PRIMARY_KEY'));
  });

  it('duplicate-field fixture: E_DUPLICATE_FIELD names the field', () => {
    const diagnostics = diagnosticsOf(loadFixture('duplicate-field'));
    const hit = diagnostics.find((d) => d.code === 'E_DUPLICATE_FIELD');
    assert.ok(hit);
    assert.equal(hit.field, 'nome');
  });

  it('unsupported-type fixture: E_UNKNOWN_TYPE names the field', () => {
    const diagnostics = diagnosticsOf(loadFixture('unsupported-type'));
    const hit = diagnostics.find((d) => d.code === 'E_UNKNOWN_TYPE');
    assert.ok(hit);
    assert.equal(hit.field, 'carga');
  });

  it('unsafe-identifier fixture: E_UNSAFE_IDENTIFIER names the field', () => {
    const diagnostics = diagnosticsOf(loadFixture('unsafe-identifier'));
    const hit = diagnostics.find((d) => d.code === 'E_UNSAFE_IDENTIFIER');
    assert.ok(hit);
    assert.equal(hit.field, 'nome-completo!');
  });

  it('invalid-bounds fixture: E_INVALID_BOUNDS for length and page sizes', () => {
    const diagnostics = diagnosticsOf(loadFixture('invalid-bounds'));
    const bounds = diagnostics.filter((d) => d.code === 'E_INVALID_BOUNDS');
    assert.equal(bounds.length, 2);
    assert.ok(bounds.some((d) => d.field === 'titulo'));
    assert.ok(bounds.some((d) => d.message.includes('gridFooterTotalLines')));
  });

  it('ambiguous-mutability fixture: E_AMBIGUOUS_MUTABILITY names the field', () => {
    const diagnostics = diagnosticsOf(loadFixture('ambiguous-mutability'));
    const hit = diagnostics.find((d) => d.code === 'E_AMBIGUOUS_MUTABILITY');
    assert.ok(hit);
    assert.equal(hit.field, 'situacao');
  });

  it('composite primary key: E_COMPOSITE_PRIMARY_KEY', () => {
    const raw = makeRaw({}, [
      makeAttr({ name: 'outro_id', dataType: 'uuid', isPrimaryKey: true }),
    ]);
    const diagnostics = diagnosticsOf(raw);
    assert.ok(diagnostics.some((d) => d.code === 'E_COMPOSITE_PRIMARY_KEY'));
  });

  it('relationship lookup object: E_UNSUPPORTED_RELATIONSHIP', () => {
    const raw = makeRaw({}, [makeAttr({ fnrInputObjName: 'lookup_pes' })]);
    const diagnostics = diagnosticsOf(raw);
    const hit = diagnostics.find(
      (d) => d.code === 'E_UNSUPPORTED_RELATIONSHIP'
    );
    assert.ok(hit);
    assert.equal(hit.field, 'campo');
  });

  it('upload dataType: E_UNSUPPORTED_UPLOAD', () => {
    const raw = makeRaw({}, [makeAttr({ dataType: 'bytea' })]);
    const diagnostics = diagnosticsOf(raw);
    assert.ok(diagnostics.some((d) => d.code === 'E_UNSUPPORTED_UPLOAD'));
  });

  it('rich-text dataType: E_UNSUPPORTED_RICH_TEXT', () => {
    const raw = makeRaw({}, [makeAttr({ dataType: 'richtext' })]);
    const diagnostics = diagnosticsOf(raw);
    assert.ok(diagnostics.some((d) => d.code === 'E_UNSUPPORTED_RICH_TEXT'));
  });

  it('executable rule fragment: E_UNSUPPORTED_RULE', () => {
    const raw = makeRaw({}, [
      makeAttr({ fedMandatory: 'condicional', fedMandatoryRule: 'valor > 0' }),
    ]);
    const diagnostics = diagnosticsOf(raw);
    assert.ok(diagnostics.some((d) => d.code === 'E_UNSUPPORTED_RULE'));
  });

  it('required + readonly conflict: E_AMBIGUOUS_MUTABILITY', () => {
    const raw = makeRaw({}, [
      makeAttr({ fnrMandatory: 'sim', fnrReadonly: 'sim' }),
    ]);
    const diagnostics = diagnosticsOf(raw);
    assert.ok(diagnostics.some((d) => d.code === 'E_AMBIGUOUS_MUTABILITY'));
  });

  it('stub payload: E_MISSING_REQUIRED_KEY via thrown error', () => {
    assert.throws(
      () => normalizeEntityModel({ success: false, error: 'not found' }),
      (error) => {
        assert.ok(error instanceof PolluxNormalizationError);
        assert.ok(
          error.diagnostics.some((d) => d.code === 'E_MISSING_REQUIRED_KEY')
        );
        return true;
      }
    );
  });

  it('all diagnostics are reported in one pass', () => {
    const raw = makeRaw({ gridFooterTotalLines: '0' }, [
      makeAttr({ name: 'nome' }),
      makeAttr({ name: 'nome', position: 3 }),
      makeAttr({ name: 'anexo', dataType: 'bytea', position: 4 }),
    ]);
    const codes = diagnosticsOf(raw).map((d) => d.code);
    assert.ok(codes.includes('E_DUPLICATE_FIELD'));
    assert.ok(codes.includes('E_UNSUPPORTED_UPLOAD'));
    assert.ok(codes.includes('E_INVALID_BOUNDS'));
  });
});

describe('export capability recording', () => {
  it('report metadata is recorded as unsupported capability, not an error', () => {
    const raw = makeRaw({ gridButtonReport: true }, [makeAttr()]);
    const model = normalizeEntityModel(raw);
    assert.deepEqual(model.unsupportedCapabilities, ['export']);
  });

  it('operation metadata is recorded as unsupported capability', () => {
    const raw = makeRaw({ makeFormOperation: true, makeFormReport: true }, [
      makeAttr(),
    ]);
    const model = normalizeEntityModel(raw);
    assert.deepEqual(model.unsupportedCapabilities, ['export', 'operation']);
  });
});

describe('real repository entity', () => {
  it('act normalizes successfully with expected identity and defaults', () => {
    const model = normalizeEntityModel(loadRepoEntity('act'));
    assert.deepEqual(validateEntityModel(model), []);
    assert.equal(model.entity.id, 'act');
    assert.equal(model.entity.table, 'act');
    assert.equal(model.entity.routes.plural, 'acts');
    assert.equal(model.entity.titles.list, 'Nomes das Atividades');
    const byName = Object.fromEntries(model.fields.map((f) => [f.codeName, f]));
    assert.deepEqual(byName.createdAt.defaultBehavior, {
      kind: 'auditTimestamp',
      value: null,
    });
    assert.deepEqual(byName.createdById.defaultBehavior, {
      kind: 'auditActor',
      value: null,
    });
    assert.equal(byName.createdAt.mutability, 'none');
    assert.equal(byName.name.mutability, 'createAndUpdate');
    assert.equal(byName.name.label, 'Nome');
    assert.deepEqual(model.list.defaultSort, [
      { field: 'name', direction: 'asc' },
    ]);
    assert.deepEqual(model.list.pageSizes, [5, 10, 20, 30, 40, 50]);
    // Serialization of a real entity is deterministic too.
    assert.equal(
      serializeModel(model),
      serializeModel(normalizeEntityModel(loadRepoEntity('act')))
    );
  });

  it('entities ending in s pluralize with es (res -> reses)', () => {
    const model = normalizeEntityModel(loadRepoEntity('res'));
    assert.equal(model.entity.routes.plural, 'reses');
  });
});
