// SPEC-002 — start-ui-vite golden parity: the compatibility projection of
// the normalized model must reproduce the values the EXISTING generators
// (scripts/gen-entity.mjs, _templates/pollux) derive from raw metadata —
// route slugs, code identifiers, labels and raw db types — for real
// repository entities, checked both against an independent re-derivation of
// the legacy rules and against the committed generated output.
// Run with: node --test scripts/pollux/targets/*.unit.spec.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import {
  START_UI_VITE_TARGET_ID,
  startUiViteCompatAdapter,
  toCompatProjection,
} from './start-ui-vite/compat.mjs';
import { normalizeEntityModel } from '../model/normalize.mjs';

const repoRoot = path.resolve(
  new URL('.', import.meta.url).pathname,
  '../../..'
);
const loadRaw = (entity) =>
  JSON.parse(
    fs.readFileSync(path.join(repoRoot, 'json-files', `${entity}.json`), 'utf8')
  );

// ---- independent reference implementation of the legacy derivations ----
// Mirrors scripts/gen-entity.mjs (toCamel/toPascal/pluralSlug, gridTitle and
// label fallbacks) and the _templates/pollux naming (h.camelField). Kept
// deliberately separate from both the generator and the normalizer so a
// drift in either side fails this suite.
const legacyCamel = (s) => s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
const legacyPascal = (s) => {
  const c = legacyCamel(s);
  return c.charAt(0).toUpperCase() + c.slice(1);
};
const legacyPlural = (name) => (name.endsWith('s') ? `${name}es` : `${name}s`);
const legacyText = (v) => (v && v !== 'NULL' ? v : null);

const GOLDEN_ENTITIES = ['act', 'fortestsonly'];

for (const entity of GOLDEN_ENTITIES) {
  describe(`golden parity: ${entity}`, () => {
    const raw = loadRaw(entity);
    const projection = toCompatProjection(normalizeEntityModel(raw));

    it('route slugs and code identifiers match the legacy derivation', () => {
      assert.equal(projection.name, entity);
      assert.equal(projection.camel, legacyCamel(entity));
      assert.equal(projection.Pascal, legacyPascal(entity));
      assert.equal(projection.plural, legacyPlural(entity));
      assert.equal(projection.table, raw.data.dbName);
      assert.equal(
        projection.gridTitle,
        legacyText(raw.data.gridTitle) ?? entity
      );
      assert.equal(projection.routes.generated, `/generated/${entity}`);
      assert.equal(
        projection.routes.generatedServer,
        `/generated-server/${entity}`
      );
      assert.equal(
        projection.routes.manager,
        `/manager/${legacyPlural(entity)}`
      );
    });

    it('every attribute keeps source order, camel identifier, raw dataType and label', () => {
      assert.equal(projection.attrs.length, raw.data.attributes.length);
      raw.data.attributes.forEach((a, i) => {
        const attr = projection.attrs[i];
        assert.equal(attr.name, a.name);
        assert.equal(attr.camel, legacyCamel(a.name));
        assert.equal(attr.Pascal, legacyPascal(a.name));
        // Templates branch on the RAW legacy dataType — preserved verbatim.
        assert.equal(attr.dataType, a.dataType);
        assert.equal(attr.nullable, a.isNullable !== false);
        assert.equal(attr.isPrimaryKey, a.isPrimaryKey === true);
        assert.equal(attr.inGrid, a.grdIsinGrid === true);
        assert.equal(attr.inAdd, a.fnrIsinFormAdd === true);
        assert.equal(attr.inEdit, a.fedIsinFormUpd === true);
        // Label fallback chain: grdLabel ?? fnrLabel ?? fedLabel ?? camel —
        // the same source text the templates print (Portuguese preserved).
        const expectedLabel =
          legacyText(a.grdLabel) ??
          legacyText(a.fnrLabel) ??
          legacyText(a.fedLabel) ??
          legacyCamel(a.name);
        assert.equal(attr.label, expectedLabel);
      });
    });

    it('matches the COMMITTED generated output (accessorKeys + route files)', () => {
      // Grid columns in the committed data-table exactly equal the
      // projection's inGrid camel identifiers.
      const columnsFile = path.join(
        repoRoot,
        `src/app/(private)/generated/${entity}/data-table-components/columns.tsx`
      );
      const committedKeys = [
        ...fs
          .readFileSync(columnsFile, 'utf8')
          .matchAll(/accessorKey: '([A-Za-z0-9]+)'/g),
      ]
        .map((m) => m[1])
        .sort();
      const projectedKeys = projection.attrs
        .filter((a) => a.inGrid)
        .map((a) => a.camel)
        .sort();
      assert.deepEqual(committedKeys, projectedKeys);
      // Route slugs: /generated/<name> file + /manager/<plural>/ directory.
      assert.ok(
        fs.existsSync(path.join(repoRoot, `src/routes/generated.${entity}.tsx`))
      );
      assert.ok(
        fs.existsSync(
          path.join(repoRoot, 'src/routes/manager', projection.plural)
        )
      );
    });
  });
}

describe('compat adapter is a reference target, not a workspace target', () => {
  it('declares the manifest-recorded target id', () => {
    assert.equal(startUiViteCompatAdapter.id, START_UI_VITE_TARGET_ID);
    const skeleton = JSON.parse(
      fs.readFileSync(
        path.join(repoRoot, 'skeletons/start-ui-vite/skeleton.json'),
        'utf8'
      )
    );
    assert.equal(
      skeleton.generatorSupport.targetAdapter.id,
      START_UI_VITE_TARGET_ID
    );
  });

  it('inspect reports the delegation surface; plan/render refuse', () => {
    const context = startUiViteCompatAdapter.inspect('/repo', {});
    assert.equal(context.mode, 'reference-in-place');
    assert.ok(context.delegatesTo.includes('scripts/gen-entity.mjs'));
    for (const stage of ['plan', 'render', 'format', 'verify']) {
      assert.throws(
        () => startUiViteCompatAdapter[stage](),
        (err) => err.code === 'TARGET_UNSUPPORTED'
      );
    }
  });
});

describe('projection determinism', () => {
  it('projecting twice yields identical JSON', () => {
    const a = JSON.stringify(
      toCompatProjection(normalizeEntityModel(loadRaw('act')))
    );
    const b = JSON.stringify(
      toCompatProjection(normalizeEntityModel(loadRaw('act')))
    );
    assert.equal(a, b);
  });
});
