---
to: src/app/(private)/generated/<%= h.changeCase.param(name) %>/data-table-components/columns.tsx
force: true
---
'use client';

import { ColumnDef, Table, Row, Column } from '@tanstack/react-table';

import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { type <%= h.changeCase.pascal(name) %> } from '@/db/schema';

// Define the type for column meta data
export type <%= h.changeCase.pascal(name) %>ColumnMeta = {
  displayName?: string;
};

import { DataTableColumnHeader } from './data-table-column-header';
import { DataTableRowActions } from './data-table-row-actions';
import { Check } from 'lucide-react';

export const columns: ColumnDef<<%= h.changeCase.pascal(name) %>>[] = [
  {
    id: 'select',
    header: ({ table }: { table: Table<<%= h.changeCase.pascal(name) %>> }) => (
      <div className="flex items-center justify-center">
        <Checkbox
          checked={table.getIsAllPageRowsSelected()}
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Selecionar tudo"
        />
      </div>
    ),
    cell: ({ row }: { row: Row<<%= h.changeCase.pascal(name) %>> }) => (
      <div className="flex items-center justify-center">
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Selecionar linha"
        />
      </div>
    ),
    enableSorting: false,
    enableHiding: false,
    size: 30, // Smaller width for checkbox column
  },
<%
let fields = [];
if (data && data.attributes && data.attributes.length) {
    fields = data.attributes.filter(field => field.grdIsinGrid === true);
    // Update all field names to camelCase
    fields = fields.map(field => ({ ...field, name: h.camelField(field.name.trim()) }));
    fields = fields.sort((a, b) => (a.grdSeq || 0) - (b.grdSeq || 0));
}
%>
<% if (fields && fields.length) {

    fields.forEach(function(field) {
        const fieldName = field.name.trim();
        const fieldType = field.dataType.trim();
        let width = '150px'; // Default width
        let widthNum = 150; // Default width as number

        // Check if field.grdColumnWidth is valid (between 1 and 999)
        if (field.grdColumnWidth && field.grdColumnWidth > 0 && field.grdColumnWidth < 1000) {
            width = field.grdColumnWidth + 'px';
            widthNum = field.grdColumnWidth;
        } else {
            // Determine width based on field type
            switch (fieldType) {
                case 'smallint':
                    width = '90px';
                    widthNum = 90;
                    break;
                case 'integer':
                    width = '120px';
                    widthNum = 120;
                    break;
                case 'bigint':
                    width = '150px';
                    widthNum = 150;
                    break;
                case 'real':
                    width = '100px';
                    widthNum = 100;
                    break;
                case 'double':
                    width = '120px';
                    widthNum = 120;
                    break;
                case 'numeric':
                    width = '150px';
                    widthNum = 150;
                    break;
                case 'text':
                    width = '200px';
                    widthNum = 200;
                    break;
                case 'varchar':
                    width = '130px';
                    widthNum = 130;
                    break;
                case 'date':
                    width = '110px';
                    widthNum = 110;
                    break;
                case 'time':
                case 'timetz':
                    width = '90px';
                    widthNum = 90;
                    break;
                case 'timestamp':
                    width = '140px';
                    widthNum = 140;
                    break;
                case 'timestamptz':
                    width = '160px';
                    widthNum = 160;
                    break;
                case 'boolean':
                    width = '80px';
                    widthNum = 80;
                    break;
                case 'uuid':
                    width = '180px';
                    widthNum = 180;
                    break;
                default:
                    width = '150px';
                    widthNum = 150;
            }
        }
    %><% if (fieldName !== 'id') { %>
      <%_ switch (fieldType) {
              case 'date':
              case 'datetime':
              case 'time':
              case 'timestamp':
              case 'timestamptz':
              case 'timetz':
                if (fieldName === 'createdAt' || fieldName === 'updatedAt') { _%>
<%- include(cwd + '/_templates/pollux/partials/data-table-columns-datetime.ejs.t', { field: field }) -%>
                <%_ } else { _%>
<%- include(cwd + '/_templates/pollux/partials/data-table-columns-date.ejs.t', { field: field }) -%>
                <%_ }
                break;
             case 'boolean':_%>
<%- include(cwd + '/_templates/pollux/partials/data-table-columns-boolean.ejs.t', { field: field }) -%>
                <%_ break;
              case 'smallint':
              case 'integer':
              case 'bigint':_%>
<%- include(cwd + '/_templates/pollux/partials/data-table-columns-integer.ejs.t', { field: field }) -%>
                <%_ break;
              case 'real':
              case 'double':_%>
<%- include(cwd + '/_templates/pollux/partials/data-table-columns-float.ejs.t', { field: field }) -%>
                <%_ break;
              case 'numeric':_%>
<%- include(cwd + '/_templates/pollux/partials/data-table-columns-numeric.ejs.t', { field: field }) -%>
                <%_ break;
              default: _%>
<%- include(cwd + '/_templates/pollux/partials/data-table-columns-string.ejs.t', { field: field }) -%>
                <%_ break;
    } _%><% } else { %><%- include(cwd + '/_templates/pollux/partials/data-table-columns-id.ejs.t', { field: field }) -%>
<% } %>
<% }) %><% } %>
  {
    id: 'actions',
    header: '',
    cell: ({ row }: { row: Row<<%= h.changeCase.pascal(name) %>> }) => <DataTableRowActions row={row} />,
    enableSorting: false,
    enableHiding: false,
  },
];