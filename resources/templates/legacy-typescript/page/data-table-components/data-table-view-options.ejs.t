---
to: src/app/(private)/generated/<%= h.changeCase.param(name) %>/data-table-components/data-table-view-options.tsx
force: true
---

'use client';
// TanStack Table v8 mutates the table instance; opt out of React Compiler
// memoization so state reads (getFilterValue/getState) stay fresh.
'use no memo';

import { Cross2Icon, GearIcon, MixerHorizontalIcon } from '@radix-ui/react-icons';
import { Table, VisibilityState } from '@tanstack/react-table';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
  DropdownMenuGroup,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

import { <%= h.changeCase.pascal(name) %>ColumnMeta } from './columns';

interface DataTableViewOptionsProps<TData> {
  table: Table<TData>;
}

export function DataTableViewOptions<TData>({ table }: DataTableViewOptionsProps<TData>) {
  const [open, setOpen] = useState(false);
  const localStorageKey = 'dataTableColumnVisibility';

  // Load column visibility from localStorage on mount
  useEffect(() => {
    const storedVisibility = localStorage.getItem(localStorageKey);
    if (storedVisibility) {
      try {
        const parsedVisibility = JSON.parse(storedVisibility) as VisibilityState;
        table.setColumnVisibility(parsedVisibility);
      } catch {
        // Invalid persisted state: fall back to default visibility.
        localStorage.removeItem(localStorageKey);
      }
    }
  }, [table]);

  // Save column visibility to localStorage when it changes
  const columnVisibility = table.getState().columnVisibility;
  useEffect(() => {
    // Avoid saving the initial empty state if all columns are visible by default
    // or if it's the very first render before initial state is set by the table.
    // This check might need adjustment based on how initial visibility is truly handled.
    if (Object.keys(columnVisibility).length > 0) {
      localStorage.setItem(localStorageKey, JSON.stringify(columnVisibility));
    }
    // It's also possible that on the very first load, before any user interaction,
    // an empty object {} is saved if all columns are visible by default.
    // If you want to avoid this, you could add a check:
    // if (Object.keys(columnVisibility).length === 0 && !localStorage.getItem(localStorageKey)) return;
    // Or ensure that initial load does not trigger this save if visibility is default.
  }, [columnVisibility, table]);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size="icon" className="rounded-lg">
          <GearIcon className="h-5 w-5" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[280px] rounded-xl p-2 shadow-xl">
        <DropdownMenuGroup>
          <div className="flex items-center justify-between px-2 py-1.5">
            <DropdownMenuLabel className="p-0 font-semibold">Colunas visíveis</DropdownMenuLabel>
            <Button variant="ghost" size="icon" onClick={() => setOpen(false)} className="h-8 w-8">
              <Cross2Icon className="h-4 w-4" />
            </Button>
          </div>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <div className="max-h-[320px] overflow-y-auto py-1">
          {table
            .getAllColumns()
            .filter((column) => column.getCanHide())
            .map((column) => {
              return (
                <DropdownMenuCheckboxItem
                  key={column.id}
                  className="rounded-lg capitalize"
                  checked={column.getIsVisible()}
                  onCheckedChange={(value) => {
                    column.toggleVisibility(!!value);
                    // The useEffect above will handle saving to localStorage
                  }}
                  // Keep the dropdown open while toggling columns (Base UI)
                  closeOnClick={false}
                >
                  {(column.columnDef.meta as <%= h.changeCase.pascal(name) %>ColumnMeta)?.displayName || column.id}
                </DropdownMenuCheckboxItem>
              );
            })}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
