---
to: src/app/(private)/generated/<%= h.changeCase.param(name) %>/serverpage/serverActions.ts
force: true
---
<%
let fields = [];
if (data && data.attributes && data.attributes.length) {
    fields = data.attributes.map(function (f) {
      return { ...f, camel: h.camelField(f.name.trim()), dataType: f.dataType.trim().toLowerCase() };
    });
}
const textTypes = ['text', 'varchar', 'char', 'uuid', 'time', 'timetz'];
const numberTypes = ['smallint', 'integer', 'bigint', 'real', 'double', 'numeric'];
const searchable = fields.filter(function (f) { return textTypes.indexOf(f.dataType) !== -1 && f.camel !== 'id' && f.camel !== 'createdById' && f.camel !== 'updatedById'; });
const filterable = fields.filter(function (f) { return f.grdIsinGrid === true; });
const Pascal = h.changeCase.pascal(name);
const Plural = h.inflection.pluralize(h.changeCase.pascal(h.customPluralize(name)));
const table = h.changeCase.camel(name);
-%>
import { createServerFn } from '@tanstack/react-start';
import { and, asc, count, desc, eq, ilike, inArray, or, type SQL } from 'drizzle-orm';
import { z } from 'zod';

import { <%= table %> } from '@/db/schema';
import { GeneratedCrudError } from '@/server/generated-crud/errors';
import { runGeneratedCrud } from '@/server/generated-crud/procedure';

const ENTITY = '<%= h.changeCase.camel(name) %>' as const;

const sortableColumns = {
<% fields.forEach(function (f) { -%>
  <%= f.camel %>: <%= table %>.<%= f.camel %>,
<% }) -%>
} as const;

const filterableColumns = [
<% filterable.forEach(function (f) { -%>
  '<%= f.camel %>',
<% }) -%>
] as const;

// tablecn-style server-side page query: pagination, multi-sort and column
// filters resolved in SQL (limit/offset + count over the same where).
// Bounded input (SPEC-002 §4): invalid sort/filter fields are rejected, not
// silently ignored.
const zPageInput = z
  .object({
    page: z.number().int().min(1).max(1_000_000),
    perPage: z.number().int().min(1).max(100),
    sort: z
      .array(z.object({ id: z.string().max(64), desc: z.boolean() }).strict())
      .max(3)
      .refine((s) => new Set(s.map((i) => i.id)).size === s.length, {
        message: 'Campos de ordenação duplicados',
      })
      .refine((s) => s.every((i) => i.id in sortableColumns), {
        message: 'Campo de ordenação inválido',
      }),
    q: z.string().trim().max(200),
    filters: z
      .array(
        z
          .object({
            id: z.string().max(64),
            value: z.array(z.string().max(200)).max(50),
          })
          .strict()
      )
      .max(20)
      .refine((f) => new Set(f.map((i) => i.id)).size === f.length, {
        message: 'Filtros duplicados',
      })
      .refine(
        (f) =>
          f.every((i) =>
            (filterableColumns as readonly string[]).includes(i.id)
          ),
        { message: 'Campo de filtro inválido' }
      ),
  })
  .strict();

export type <%= Pascal %>PageInput = z.infer<typeof zPageInput>;

// Escape LIKE wildcards so search terms match literally.
const escapeLike = (value: string) => value.replace(/[\\%_]/g, '\\$&');

function buildWhere(input: <%= Pascal %>PageInput): SQL | undefined {
  const conditions: SQL[] = [];

  if (input.q) {
    const term = `%${escapeLike(input.q)}%`;
    const matches = [
<% searchable.forEach(function (f) { -%>
      ilike(<%= table %>.<%= f.camel %>, term),
<% }) -%>
    ].filter(Boolean);
    if (matches.length) {
      const orClause = or(...matches);
      if (orClause) conditions.push(orClause);
    }
  }

  for (const filter of input.filters) {
    if (!filter.value.length) continue;
    switch (filter.id) {
<% filterable.forEach(function (f) { -%>
<% if (f.dataType === 'boolean') { -%>
      case '<%= f.camel %>':
        conditions.push(inArray(<%= table %>.<%= f.camel %>, filter.value.map((v) => v === 'true')));
        break;
<% } else if (numberTypes.indexOf(f.dataType) !== -1) { -%>
      case '<%= f.camel %>': {
        const parsed = Number(filter.value[0]);
        if (!Number.isFinite(parsed)) {
          throw new GeneratedCrudError('VALIDATION_FAILED', {
            message: 'Valor de filtro numérico inválido',
          });
        }
        conditions.push(eq(<%= table %>.<%= f.camel %>, parsed));
        break;
      }
<% } else if (textTypes.indexOf(f.dataType) !== -1) { -%>
      case '<%= f.camel %>':
        conditions.push(ilike(<%= table %>.<%= f.camel %>, `%${escapeLike(filter.value[0] ?? '')}%`));
        break;
<% } -%>
<% }) -%>
      default:
        break;
    }
  }

  return conditions.length ? and(...conditions) : undefined;
}

export const get<%= Plural %>Page = createServerFn({ method: 'GET' })
  .inputValidator((raw: unknown) => raw)
  .handler(async ({ data: raw }) =>
    runGeneratedCrud({
      entity: ENTITY,
      action: 'read',
      operation: 'page',
      method: 'GET',
      input: raw,
      schema: zPageInput,
      handler: async (input, ctx) => {
        const where = buildWhere(input);

        // Allowlisted sort + primary-key ascending as deterministic tiebreak.
        const orderBy = [
          ...input.sort.map((s) => {
            const column = sortableColumns[s.id as keyof typeof sortableColumns];
            return s.desc ? desc(column) : asc(column);
          }),
          asc(<%= table %>.id),
        ];

        const offset = (input.page - 1) * input.perPage;

        const [rows, totalRows] = await Promise.all([
          ctx.db
            .select()
            .from(<%= table %>)
            .where(where)
            .orderBy(...orderBy)
            .limit(input.perPage)
            .offset(offset),
          ctx.db.select({ total: count() }).from(<%= table %>).where(where),
        ]);
        const total = totalRows[0]?.total ?? 0;

        return {
          rows,
          total,
          page: input.page,
          perPage: input.perPage,
          pageCount: Math.ceil(total / input.perPage),
        };
      },
      resultCount: (result) => result.rows.length,
    })
  );
