---
to: src/app/(private)/generated/<%= h.changeCase.param(name) %>/serverpage/data-table.tsx
force: true
---
<%
let fields = [];
if (data && data.attributes && data.attributes.length) {
    fields = data.attributes.map(function (f) {
      return { ...f, camel: h.camelField(f.name.trim()), dataType: f.dataType.trim().toLowerCase() };
    });
}
const facetCols = fields.filter(function (f) { return f.grdIsinGrid === true && f.dataType === 'boolean'; });
-%>
'use client';
// TanStack Table v8 mutates the table instance; opt out of React Compiler
// memoization so state reads (getFilterValue/getState) stay fresh.
'use no memo';

import { getRouteApi } from '@tanstack/react-router';
import {
  ColumnDef,
  ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  RowSelectionState,
  SortingState,
  Updater,
  useReactTable,
  VisibilityState,
} from '@tanstack/react-table';
import { useEffect, useRef, useState } from 'react';

import '../data-table-components/force-column-width.css';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { <%= h.changeCase.pascal(name) %> } from '@/db/schema';
import { cn } from '@/utilities/cn';

import { DataTableColumnHeader } from '../data-table-components/data-table-column-header';
import { DataTablePagination } from '../data-table-components/data-table-pagination';
import { DataTableToolbar } from '../data-table-components/data-table-toolbar';
import { Edit<%= h.changeCase.pascal(name) %>Dialog } from '../components/edit-<%= h.changeCase.param(name) %>-dialog';

const route = getRouteApi('/generated-server/<%= h.changeCase.param(name) %>');

interface ServerDataTableProps<TData> {
  columns: ColumnDef<TData>[];
  data: TData[];
  pageCount: number;
  total: number;
}

// tablecn-style server table: manual pagination/sorting/filtering with the
// URL as the single source of truth (search params drive the route loader).
export function ServerDataTable<TData extends <%= h.changeCase.pascal(name) %>>({
  columns,
  data,
  pageCount,
  total,
}: ServerDataTableProps<TData>) {
  const search = route.useSearch();
  const navigate = route.useNavigate();

  // Local-only state (tablecn keeps these off the URL).
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [selected<%= h.changeCase.pascal(name) %>, setSelected<%= h.changeCase.pascal(name) %>] = useState<<%= h.changeCase.pascal(name) %> | null>(null);

  // URL-derived table state.
  const pagination = {
    pageIndex: search.page - 1,
    pageSize: search.perPage,
  };
  const sorting: SortingState = (() => {
    if (!search.sort) return [];
    try {
      const parsed = JSON.parse(search.sort);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      // Malformed URL state: fall back to unsorted instead of crashing.
      return [];
    }
  })();
  const urlColumnFilters: ColumnFiltersState = [
<% facetCols.forEach(function (f) { -%>
    ...(search.<%= f.camel %> ? [{ id: '<%= f.camel %>', value: search.<%= f.camel %>.split(',') }] : []),
<% }) -%>
  ];

  // Optimistic local mirrors for debounced URL state (tablecn keeps inputs
  // responsive while the URL write is debounced).
  const [globalFilter, setGlobalFilter] = useState(search.q);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>(urlColumnFilters);
  useEffect(() => {
    setGlobalFilter(search.q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.q]);
  useEffect(() => {
    setColumnFilters([
<% facetCols.forEach(function (f) { -%>
      ...(search.<%= f.camel %> ? [{ id: '<%= f.camel %>', value: search.<%= f.camel %>.split(',') }] : []),
<% }) -%>
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [<% facetCols.forEach(function (f, i) { %><%= i ? ', ' : '' %>search.<%= f.camel %><% }) %>]);

  type SearchPatch = Partial<typeof search>;
  const patchSearch = (patch: SearchPatch) => {
    void navigate({
      search: (prev) => ({ ...prev, ...patch }),
      replace: true,
    });
  };

  // Debounce text-ish updates (tablecn debounceMs default: 300).
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const patchSearchDebounced = (patch: SearchPatch) => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => patchSearch(patch), 300);
  };
  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);

  // Reset row selection when the page of data changes.
  useEffect(() => {
    setRowSelection({});
    setSelected<%= h.changeCase.pascal(name) %>(null);
    setShowEditDialog(false);
  }, [data]);

  const resolve = <T,>(updater: Updater<T>, current: T): T =>
    typeof updater === 'function' ? (updater as (old: T) => T)(current) : updater;

  const table = useReactTable<TData>({
    data,
    columns,
    pageCount,
    getRowId: (row) => row.id,
    getCoreRowModel: getCoreRowModel(),
    // Faceted models power the toolbar filter counts (page-local).
    getFilteredRowModel: getFilteredRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
    state: {
      pagination,
      sorting,
      columnFilters,
      globalFilter,
      columnVisibility,
      rowSelection,
    },
    onPaginationChange: (updater) => {
      const next = resolve(updater, pagination);
      patchSearch({ page: next.pageIndex + 1, perPage: next.pageSize });
    },
    onSortingChange: (updater) => {
      const next = resolve(updater, sorting);
      patchSearch({ sort: next.length ? JSON.stringify(next) : '' });
    },
    onColumnFiltersChange: (updater) => {
      const next = resolve(updater, columnFilters);
      setColumnFilters(next);
      const patch: SearchPatch = { page: 1 };
<% facetCols.forEach(function (f) { -%>
      const <%= f.camel %>Filter = next.find((f) => f.id === '<%= f.camel %>');
      patch.<%= f.camel %> = <%= f.camel %>Filter ? (<%= f.camel %>Filter.value as string[]).join(',') : '';
<% }) -%>
      patchSearchDebounced(patch);
    },
    onGlobalFilterChange: (updater) => {
      const next = resolve(updater, globalFilter);
      setGlobalFilter(next ?? '');
      patchSearchDebounced({ q: next ?? '', page: 1 });
    },
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    enableRowSelection: true,
  });

  return (
    <div className="space-y-5">
      <DataTableToolbar table={table} />
      <div className="pollux-table-shell overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-[var(--pollux-shadow)]">
        <Table className="admin-table min-w-max">
          <TableHeader className="bg-[var(--pollux-accent-soft)]/70">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead key={header.id}>
                      {header.isPlaceholder ? null : typeof header.column.columnDef.header === 'function' ? (
                        flexRender(header.column.columnDef.header, header.getContext())
                      ) : (
                        <DataTableColumnHeader
                          column={header.column}
                          title={header.column.columnDef.header as string}
                        />
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => {
                return (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() ? 'selected' : undefined}
                    onDoubleClick={() => {
                      setSelected<%= h.changeCase.pascal(name) %>(row.original);
                      setShowEditDialog(true);
                    }}
                    onClick={() => {
                      if (!selected<%= h.changeCase.pascal(name) %> || selected<%= h.changeCase.pascal(name) %>.id !== row.original.id) {
                        setSelected<%= h.changeCase.pascal(name) %>(row.original);
                      }
                    }}
                    className={cn(
                      'group cursor-pointer border-b-border/70 transition-[background-color,box-shadow] duration-150',
                      row.getIsSelected() || selected<%= h.changeCase.pascal(name) %>?.id === row.original.id
                        ? 'bg-[var(--pollux-accent-soft)] shadow-[inset_3px_0_0_var(--pollux-accent)]'
                        : 'hover:bg-muted/45'
                    )}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-52 text-center">
                  <div className="mx-auto flex max-w-sm flex-col items-center gap-2 px-6">
                    <div className="flex size-11 items-center justify-center rounded-full bg-[var(--pollux-accent-soft)] text-lg text-primary">
                      ∅
                    </div>
                    <p className="font-medium text-foreground">Nenhum registro encontrado</p>
                    <p className="text-sm text-muted-foreground">
                      Ajuste os filtros ou adicione um novo registro.
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <DataTablePagination table={table} />
      </div>
      <p className="px-1 text-xs text-muted-foreground">
        {total} registro{total === 1 ? '' : 's'} no servidor · página {search.page} de {pageCount}
      </p>
      {selected<%= h.changeCase.pascal(name) %> && (
        <Edit<%= h.changeCase.pascal(name) %>Dialog
          key={`edit-dialog-${selected<%= h.changeCase.pascal(name) %>.id}`}
          <%= h.changeCase.camel(name) %>={selected<%= h.changeCase.pascal(name) %>}
          open={showEditDialog}
          onOpenChange={(open) => {
            setShowEditDialog(open);
            if (!open) {
              setSelected<%= h.changeCase.pascal(name) %>(null);
            }
          }}
        />
      )}
    </div>
  );
}
