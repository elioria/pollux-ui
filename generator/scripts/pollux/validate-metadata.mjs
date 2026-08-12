#!/usr/bin/env node
// Validates json-files/<entity>.json metadata before Pollux generation
// (SPEC-002 §1 / SPEC-006). Invalid metadata fails with a precise report
// before any application file is touched. Stubs (success:false error
// payloads) are classified as skipped; invalid JSON is a failure.
//
// Usage:
//   node scripts/pollux/validate-metadata.mjs            # validate all
//   node scripts/pollux/validate-metadata.mjs act aut    # validate some
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

const SUPPORTED_TYPES = [
  'char',
  'boolean',
  'timestamp',
  'timestamptz',
  'text',
  'smallint',
  'varchar',
  'time',
  'timetz',
  'bigint',
  'real',
  'double',
  'numeric',
  'integer',
  'uuid',
  'date',
];

const MANDATORY_VALUES = ['sim', 'não', 'nunca', 'condicional', 'NULL'];

const zAttribute = z
  .object({
    name: z.string().trim().min(1),
    dataType: z.enum(SUPPORTED_TYPES),
    isPrimaryKey: z.boolean(),
    isNullable: z.boolean(),
    position: z.number().int(),
    grdIsinGrid: z.boolean(),
    fnrIsinFormAdd: z.boolean(),
    fedIsinFormUpd: z.boolean(),
    fnrMandatory: z.enum(MANDATORY_VALUES).nullable().optional(),
    fedMandatory: z.enum(MANDATORY_VALUES).nullable().optional(),
    fnrReadonly: z.enum(MANDATORY_VALUES).nullable().optional(),
    fedReadonly: z.enum(MANDATORY_VALUES).nullable().optional(),
  })
  .loose();

const zEntity = z
  .object({
    name: z.string().trim().min(1),
    dbName: z.string().trim().min(1),
    attributes: z
      .array(zAttribute)
      .min(1)
      .superRefine((attributes, ctx) => {
        const names = new Set();
        const positions = new Set();
        let primaryKeys = 0;
        attributes.forEach((attribute, index) => {
          if (names.has(attribute.name)) {
            ctx.addIssue({
              code: 'custom',
              path: [index, 'name'],
              message: `duplicate attribute name "${attribute.name}"`,
            });
          }
          names.add(attribute.name);
          if (positions.has(attribute.position)) {
            ctx.addIssue({
              code: 'custom',
              path: [index, 'position'],
              message: `duplicate position ${attribute.position}`,
            });
          }
          positions.add(attribute.position);
          if (attribute.isPrimaryKey) primaryKeys += 1;
        });
        if (primaryKeys !== 1) {
          ctx.addIssue({
            code: 'custom',
            message: `expected exactly one primary key, found ${primaryKeys}`,
          });
        }
      }),
  })
  .loose();

const zFile = z.object({ data: zEntity }).loose();

const repoRoot = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  '../..'
);
// --dir=<path> validates an external metadata directory (e.g. a user
// project's pollux-metadata/ when the generator runs from the plugin's
// bundled snapshot); default stays the checkout's json-files/.
const argv = process.argv.slice(2);
const dirFlag = argv.find((a) => a.startsWith('--dir='));
const dir = dirFlag
  ? path.resolve(dirFlag.slice('--dir='.length))
  : path.join(repoRoot, 'json-files');

const requested = argv.filter((a) => !a.startsWith('--'));
const files = requested.length
  ? requested.map((e) => `${e.replace(/\.json$/, '')}.json`)
  : fs.readdirSync(dir).filter((f) => f.endsWith('.json'));

let valid = 0;
const skipped = [];
const failures = [];

for (const file of files) {
  const filePath = path.join(dir, file);
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch {
    failures.push(`${file}: file not found`);
    continue;
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    failures.push(`${file}: invalid JSON — ${error.message}`);
    continue;
  }

  // Explicit stub classification: an error payload without data.attributes.
  if (!parsed?.data?.attributes) {
    if (parsed?.success === false) {
      skipped.push(file);
      continue;
    }
    failures.push(`${file}: missing data.attributes and not a declared stub`);
    continue;
  }

  const result = zFile.safeParse(parsed);
  if (!result.success) {
    for (const issue of result.error.issues) {
      failures.push(`${file}: ${issue.path.join('.')}: ${issue.message}`);
    }
    continue;
  }
  valid += 1;
}

console.log(
  `pollux metadata: ${valid} valid, ${skipped.length} skipped stubs (${skipped.join(', ') || 'none'}), ${failures.length} errors`
);
if (failures.length) {
  for (const failure of failures) console.error(`  ERROR ${failure}`);
  process.exit(1);
}
