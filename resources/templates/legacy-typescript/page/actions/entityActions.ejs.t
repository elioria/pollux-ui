---
to: src/app/(private)/generated/<%= h.changeCase.param(name) %>/actions/entityActions.ts
force: true
---
<%
const SYSTEM_FIELDS = ['id', 'createdAt', 'createdById', 'updatedAt', 'updatedById', 'deletedAt'];
let fields = [];
if (data && data.attributes && data.attributes.length) {
    fields = data.attributes.map(function (f) {
      return { ...f, camel: h.camelField(f.name.trim()), dataType: (f.dataType || 'text').trim().toLowerCase() };
    });
}
const isDateColType = (t) => t === 'date' || t === 'timestamp' || t === 'timestamptz';
const isSystem = (f) => SYSTEM_FIELDS.indexOf(f.camel) !== -1;
const addFields = fields.filter((f) => f.fnrIsinFormAdd === true && !isSystem(f));
const updFields = fields.filter((f) => f.fedIsinFormUpd === true && !isSystem(f));
const hasCreatedById = fields.some((f) => f.camel === 'createdById');
const hasUpdatedById = fields.some((f) => f.camel === 'updatedById');
const hasUpdatedAt = fields.some((f) => f.camel === 'updatedAt');
const hasDateCols = addFields.concat(updFields).some((f) => isDateColType(f.dataType));

// Server-side zod expression per field: presence when mandatory, primitive
// type + bounds otherwise. Nullable columns accept explicit null.
function zodFor(field, mandatoryFlag) {
  const required = field[mandatoryFlag] === 'sim';
  const nullable = field.isNullable === true;
  let base;
  switch (field.dataType) {
    case 'boolean': base = 'z.boolean()'; break;
    case 'smallint': base = 'z.number().int().min(-32768).max(32767)'; break;
    case 'integer': base = 'z.number().int().min(-2147483648).max(2147483647)'; break;
    case 'bigint': base = "z.number().int().refine(Number.isSafeInteger, 'Valor fora do intervalo seguro')"; break;
    case 'real':
    case 'double': base = 'z.number().finite()'; break;
    case 'numeric': base = "z.union([z.number().finite(), z.string().trim().max(64).regex(/^-?\\d+(\\.\\d+)?$/, 'Número inválido')])"; break;
    case 'uuid': base = 'z.string().uuid()'; break;
    case 'date':
    case 'timestamp':
    case 'timestamptz': base = 'z.coerce.date()'; break;
    case 'time':
    case 'timetz': base = 'z.string().max(32)'; break;
    case 'char':
    case 'varchar':
    case 'text':
    default:
      base = required ? "z.string().trim().min(1, 'Campo obrigatório').max(10000)" : 'z.string().max(10000)';
      break;
  }
  if (nullable) base += '.nullable()';
  if (!required) base += '.optional()';
  return base;
}

// Runtime value transform applied after validation, before persistence.
function valueExpr(field, src) {
  if (isDateColType(field.dataType)) {
    return src + ' != null ? convertLocalToUTC(' + src + ') : null';
  }
  if (field.dataType === 'uuid') {
    return src + ' ?? null';
  }
  if (field.dataType === 'numeric') {
    // Validated decimal string -> number (numeric columns use mode: 'number').
    return 'typeof ' + src + " === 'string' ? Number(" + src + ') : ' + src;
  }
  return src;
}

const Pascal = h.changeCase.pascal(name);
const Plural = h.inflection.pluralize(h.changeCase.pascal(h.customPluralize(name)));
const table = h.changeCase.camel(name);
-%>
import { createServerFn } from '@tanstack/react-start';
import { asc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';

import { <%= table %> } from '@/db/schema';
import { getGeneratedCapabilities } from '@/server/generated-crud/authorization';
import { GeneratedCrudError } from '@/server/generated-crud/errors';
import { runGeneratedCrud } from '@/server/generated-crud/procedure';
<% if (hasDateCols) { -%>
import { convertLocalToUTC } from '@/utils/dateHelpers';
<% } -%>

const ENTITY = '<%= h.changeCase.camel(name) %>' as const;

const zId = z.string().min(1).max(128);

const zCreateInput = z
  .object({
<% addFields.forEach(function (f) { -%>
    <%= f.camel %>: <%- zodFor(f, 'fnrMandatory') %>,
<% }) -%>
  })
  .strict();

const zUpdatePatch = z
  .object({
<% updFields.forEach(function (f) { -%>
    <%= f.camel %>: <%- zodFor(f, 'fedMandatory').replace(/\.optional\(\)$/, '') %>.optional(),
<% }) -%>
  })
  .strict();

const zUpdateInput = z
  .object({
    id: zId,
    expectedUpdatedAt: z.union([z.coerce.date(), z.null()]).optional(),
    data: zUpdatePatch,
  })
  .strict();

const zBulkIds = z
  .array(zId)
  .min(1)
  .max(100)
  .refine((ids) => new Set(ids).size === ids.length, {
    message: 'IDs duplicados na exclusão em lote',
  });

export const get<%= Pascal %>Capabilities = createServerFn({ method: 'GET' }).handler(
  async () => await getGeneratedCapabilities(ENTITY)
);

export const get<%= Plural %> = createServerFn({ method: 'GET' }).handler(async () =>
  runGeneratedCrud({
    entity: ENTITY,
    action: 'read',
    operation: 'list',
    method: 'GET',
    input: {},
    schema: z.object({}),
    handler: async (_input, ctx) =>
      // Bounded read: the client-table variant renders at most this many rows.
      await ctx.db.select().from(<%= table %>).orderBy(asc(<%= table %>.id)).limit(10000),
    resultCount: (rows) => rows.length,
  })
);

export const get<%= Pascal %> = createServerFn({ method: 'GET' })
  .inputValidator((raw: unknown) => raw)
  .handler(async ({ data: raw }) =>
    runGeneratedCrud({
      entity: ENTITY,
      action: 'read',
      operation: 'get',
      method: 'GET',
      input: raw,
      schema: zId,
      handler: async (id, ctx) => {
        const rows = await ctx.db.select().from(<%= table %>).where(eq(<%= table %>.id, id)).limit(1);
        const row = rows[0];
        if (!row) throw new GeneratedCrudError('NOT_FOUND');
        return row;
      },
    })
  );

export const add<%= Pascal %> = createServerFn({ method: 'POST' })
  .inputValidator((raw: unknown) => raw)
  .handler(async ({ data: raw }) =>
    runGeneratedCrud({
      entity: ENTITY,
      action: 'create',
      operation: 'add',
      method: 'POST',
      input: raw,
      schema: zCreateInput,
      handler: async (data, ctx) =>
        await ctx.db.transaction(async (tx) => {
          // Allowlisted payload only — no client spread; actor fields come
          // from the session, timestamps from the database defaults.
          const values = {
<% addFields.forEach(function (f) { -%>
            <%= f.camel %>: <%- valueExpr(f, 'data.' + f.camel) %>,
<% }) -%>
<% if (hasCreatedById) { -%>
            createdById: ctx.user.id,
<% } -%>
<% if (hasUpdatedById) { -%>
            updatedById: ctx.user.id,
<% } -%>
          };
          const rows = await tx.insert(<%= table %>).values(values).returning();
          const row = rows[0];
          if (!row) throw new GeneratedCrudError('INTERNAL');
          await ctx.audit(tx, {
            operation: 'create',
            recordId: String(row.id),
            changedFields: Object.keys(data),
          });
          return row;
        }),
    })
  );

export const update<%= Pascal %> = createServerFn({ method: 'POST' })
  .inputValidator((raw: unknown) => raw)
  .handler(async ({ data: raw }) =>
    runGeneratedCrud({
      entity: ENTITY,
      action: 'update',
      operation: 'update',
      method: 'POST',
      input: raw,
      schema: zUpdateInput,
      handler: async ({ id, expectedUpdatedAt, data }, ctx) =>
        await ctx.db.transaction(async (tx) => {
          const patch: Record<string, unknown> = {};
<% updFields.forEach(function (f) { -%>
          if ('<%= f.camel %>' in data) patch.<%= f.camel %> = <%- valueExpr(f, 'data.' + f.camel) %>;
<% }) -%>
          if (Object.keys(patch).length === 0) {
            throw new GeneratedCrudError('VALIDATION_FAILED', {
              message: 'Nenhuma alteração enviada.',
            });
          }

          const current = await tx
            .select()
            .from(<%= table %>)
            .where(eq(<%= table %>.id, id))
            .for('update')
            .limit(1);
          const currentRow = current[0];
          if (!currentRow) throw new GeneratedCrudError('NOT_FOUND');
<% if (hasUpdatedAt) { -%>
          if (expectedUpdatedAt !== undefined) {
            const currentMs = currentRow.updatedAt
              ? new Date(currentRow.updatedAt).getTime()
              : null;
            const expectedMs =
              expectedUpdatedAt === null ? null : expectedUpdatedAt.getTime();
            if (currentMs !== expectedMs) {
              throw new GeneratedCrudError('STALE_WRITE');
            }
          }
          patch.updatedAt = new Date();
<% } -%>
<% if (hasUpdatedById) { -%>
          patch.updatedById = ctx.user.id;
<% } -%>

          const rows = await tx
            .update(<%= table %>)
            .set(patch as Partial<typeof <%= table %>.$inferInsert>)
            .where(eq(<%= table %>.id, id))
            .returning();
          const row = rows[0];
          if (!row) throw new GeneratedCrudError('NOT_FOUND');
          await ctx.audit(tx, {
            operation: 'update',
            recordId: id,
            changedFields: Object.keys(data),
          });
          return row;
        }),
    })
  );

export const delete<%= Pascal %> = createServerFn({ method: 'POST' })
  .inputValidator((raw: unknown) => raw)
  .handler(async ({ data: raw }) =>
    runGeneratedCrud({
      entity: ENTITY,
      action: 'delete',
      operation: 'delete',
      method: 'POST',
      input: raw,
      schema: zId,
      handler: async (id, ctx) =>
        await ctx.db.transaction(async (tx) => {
          const rows = await tx
            .delete(<%= table %>)
            .where(eq(<%= table %>.id, id))
            .returning({ id: <%= table %>.id });
          if (rows.length === 0) throw new GeneratedCrudError('NOT_FOUND');
          await ctx.audit(tx, { operation: 'delete', recordId: id });
          return { deletedCount: rows.length };
        }),
    })
  );

export const deleteSelected<%= Plural %> = createServerFn({ method: 'POST' })
  .inputValidator((raw: unknown) => raw)
  .handler(async ({ data: raw }) =>
    runGeneratedCrud({
      entity: ENTITY,
      action: 'delete',
      operation: 'bulkDelete',
      method: 'POST',
      input: raw,
      schema: zBulkIds,
      handler: async (ids, ctx) =>
        await ctx.db.transaction(async (tx) => {
          // Atomic: if any requested row is missing, roll back everything.
          const rows = await tx
            .delete(<%= table %>)
            .where(inArray(<%= table %>.id, ids))
            .returning({ id: <%= table %>.id });
          if (rows.length !== ids.length) {
            throw new GeneratedCrudError('NOT_FOUND', {
              message:
                'Alguns registros não foram encontrados - Nenhuma exclusão foi realizada',
            });
          }
          await ctx.audit(tx, {
            operation: 'bulk_delete',
            recordCount: rows.length,
          });
          return { deletedCount: rows.length };
        }),
    })
  );
