---
to: src/app/(private)/generated/<%= h.changeCase.param(name) %>/data-table-components/data-table.tsx
force: true
---

'use client';
// TanStack Table v8 mutates the table instance; opt out of React Compiler
// memoization so state reads (getFilterValue/getState) stay fresh.
'use no memo';

import './force-column-width.css';
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
  getPaginationRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  VisibilityState,
  SortingState,
  RowSelectionState,
} from '@tanstack/react-table';
import { useEffect, useState } from 'react';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { <%= h.changeCase.pascal(name) %> } from '@/db/schema';
import { cn } from '@/utilities/cn';

import { DataTableColumnHeader } from './data-table-column-header';
import { DataTablePagination } from './data-table-pagination';
import { DataTableToolbar } from './data-table-toolbar';
import { Edit<%= h.changeCase.pascal(name) %>Dialog } from '../components/edit-<%= h.changeCase.param(name) %>-dialog';

interface DataTableProps<TData> {
  columns: ColumnDef<TData>[];
  data: TData[];
}

export function DataTable<TData extends <%= h.changeCase.pascal(name) %>>({ columns, data }: DataTableProps<TData>) {
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [sorting, setSorting] = useState<SortingState>([]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [globalFilter, setGlobalFilter] = useState('');
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [selected<%= h.changeCase.pascal(name) %>, setSelected<%= h.changeCase.pascal(name) %>] = useState<<%= h.changeCase.pascal(name) %> | null>(null);

  // Define a fuzzy-match filter function
  const fuzzyFilter = (row: any, columnId: string, value: string) => {
    const searchValue = value.toLowerCase();
    const cellValue = String(row.getValue(columnId) || '').toLowerCase();
    return cellValue.includes(searchValue);
  };
  // Reset row selection and selected<%= h.changeCase.pascal(name) %> when data changes (after add/delete/edit operations)
  useEffect(() => {
    // Reset row selection state
    setRowSelection({});
    // Reset selected<%= h.changeCase.pascal(name) %> when data changes to prevent showing deleted/stale data
    setSelected<%= h.changeCase.pascal(name) %>(null);
    setShowEditDialog(false);

    // This effect will run on initial render and whenever data changes
    // This ensures the table state is always in sync with the actual data
  }, [data]);

  const table = useReactTable<TData>({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    onSortingChange: setSorting,
    state: {
      columnVisibility,
      sorting,
      rowSelection,
      globalFilter,
    },
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: fuzzyFilter,
    enableGlobalFilter: true,
    onRowSelectionChange: setRowSelection,
    enableRowSelection: true,
    initialState: {
      pagination: {
        pageSize: 10,
      },
    },
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
                // No need for type assertion since row.original is already TData which extends LocationType
                const locationType = row.original;
                return (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() ? 'selected' : undefined}
                    onDoubleClick={() => {
                      setSelected<%= h.changeCase.pascal(name) %>(row.original);
                      setShowEditDialog(true);
                    }}
                    onClick={() => {
                      // Only update selected<%= h.changeCase.pascal(name) %> if it's a different <%= h.changeCase.camel(name) %>
                      if (!selected<%= h.changeCase.pascal(name) %> || selected<%= h.changeCase.pascal(name) %>.id !== row.original.id) {
                        setSelected<%= h.changeCase.pascal(name) %>(row.original);
                      }
                    }}
                    className={cn(
                      'group cursor-pointer border-b-border/70 transition-[background-color,box-shadow] duration-150',
                      row.getIsSelected() || selected<%= h.changeCase.pascal(name) %>?.id === row.original.id
                        ? 'bg-[var(--pollux-accent-soft)] shadow-[inset_3px_0_0_var(--pollux-accent)]'
                        : 'hover:bg-muted/45',
                    )}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
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
      {selected<%= h.changeCase.pascal(name) %> && (
        <Edit<%= h.changeCase.pascal(name) %>Dialog
          key={`edit-dialog-${selected<%= h.changeCase.pascal(name) %>.id}`} /* Force re-render on <%= h.changeCase.camel(name) %> change */
          <%= h.changeCase.camel(name) %>={selected<%= h.changeCase.pascal(name) %>}
          open={showEditDialog}
          onOpenChange={(open) => {
            setShowEditDialog(open);
            // Reset selected<%= h.changeCase.pascal(name) %> when dialog is closed
            if (!open) {
              // Use setTimeout to ensure state is reset after the dialog animation completes
              setTimeout(() => {
                setSelected<%= h.changeCase.pascal(name) %>(null);
              }, 100);
            }
          }}
        />
      )}
    </div>
  );
}
