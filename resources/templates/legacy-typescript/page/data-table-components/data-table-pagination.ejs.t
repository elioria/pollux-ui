---
to: src/app/(private)/generated/<%= h.changeCase.param(name) %>/data-table-components/data-table-pagination.tsx
force: true
---

'use no memo';
import { ChevronLeftIcon, ChevronRightIcon, DoubleArrowLeftIcon, DoubleArrowRightIcon } from '@radix-ui/react-icons';
import { Table } from '@tanstack/react-table';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface DataTablePaginationProps<TData> {
  table: Table<TData>;
}

export function DataTablePagination<TData>({ table }: DataTablePaginationProps<TData>) {
  return (
    <div className="grid w-full gap-4 border-t bg-muted/20 px-4 py-3 text-sm sm:px-6 lg:grid-cols-[1fr_auto_1fr] lg:items-center">
      <div className="flex min-w-0 items-center justify-start">
        <div className="truncate text-xs text-muted-foreground sm:text-sm">
          <span className="font-semibold text-foreground">
            {table.getFilteredSelectedRowModel().rows.length}
          </span>{' '}
          de {table.getFilteredRowModel().rows.length} registros selecionados
        </div>
      </div>
      <div className="flex items-center justify-center">
        <div className="flex items-center gap-2">
          <p className="text-xs font-medium text-muted-foreground">Linhas por página</p>
          <Select
            value={`${table.getState().pagination.pageSize}`}
            onValueChange={(value) => {
              table.setPageSize(Number(value));
            }}
          >
            <SelectTrigger className="h-8 w-[72px] rounded-lg bg-background">
              <SelectValue placeholder={table.getState().pagination.pageSize} />
            </SelectTrigger>
            <SelectContent side="top">
              {[5, 10, 20, 30, 40, 50].map((pageSize) => (
                <SelectItem key={pageSize} value={`${pageSize}`}>
                  {pageSize}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex items-center justify-center lg:justify-end">
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div>
                  <Button
                    variant="secondary"
                    className="h-8 w-8 rounded-lg p-0"
                    onClick={() => table.setPageIndex(0)}
                    disabled={!table.getCanPreviousPage()}
                  >
                    <span className="sr-only">Primeira Página</span>
                    <DoubleArrowLeftIcon className="h-4 w-4" />
                  </Button>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Primeira Página</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div>
                  <Button
                    variant="secondary"
                    className="h-8 w-8 rounded-lg p-0"
                    onClick={() => table.previousPage()}
                    disabled={!table.getCanPreviousPage()}
                  >
                    <span className="sr-only">Página Anterior</span>
                    <ChevronLeftIcon className="h-4 w-4" />
                  </Button>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Página Anterior</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <div className="flex items-center justify-center gap-1.5 px-1 text-xs font-medium sm:px-2 sm:text-sm">
            <span className="text-muted-foreground">Página</span>
            <Input
              type="number"
              min={1}
              max={table.getPageCount()}
              value={table.getState().pagination.pageIndex + 1}
              onChange={(e) => {
                const page = e.target.value ? Number(e.target.value) - 1 : 0;
                if (page >= 0 && page < table.getPageCount()) {
                  table.setPageIndex(page);
                }
              }}
              className="h-8 w-14 rounded-lg bg-background text-center font-mono"
            />
            <span>de {table.getPageCount()}</span>
          </div>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div>
                  <Button
                    variant="secondary"
                    className="h-8 w-8 rounded-lg p-0"
                    onClick={() => table.nextPage()}
                    disabled={!table.getCanNextPage()}
                  >
                    <span className="sr-only">Próxima Página</span>
                    <ChevronRightIcon className="h-4 w-4" />
                  </Button>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Próxima Página</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div>
                  <Button
                    variant="secondary"
                    className="h-8 w-8 rounded-lg p-0"
                    onClick={() => table.setPageIndex(table.getPageCount() - 1)}
                    disabled={!table.getCanNextPage()}
                  >
                    <span className="sr-only">Última Página</span>
                    <DoubleArrowRightIcon className="h-4 w-4" />
                  </Button>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Última Página</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
    </div>
  );
}
