---
to: src/app/(private)/generated/<%= h.changeCase.param(name) %>/data-table-components/data-table-row-actions.tsx
force: true
---

'use client';
// TanStack Table v8 mutates the table instance; opt out of React Compiler
// memoization so state reads (getFilterValue/getState) stay fresh.
'use no memo';

import { Row } from '@tanstack/react-table';
import { FilePenLine, Trash } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { type <%= h.changeCase.pascal(name) %> } from '@/db/schema';
import { useCrudCapabilities } from '@/features/generated-crud/capabilities';

import { Delete<%= h.changeCase.pascal(name) %>Dialog } from '../components/delete-<%= h.changeCase.param(name) %>-dialog';
import { Edit<%= h.changeCase.pascal(name) %>Dialog } from '../components/edit-<%= h.changeCase.param(name) %>-dialog';

interface DataTableRowActionsProps<TData> {
  row: Row<TData>;
}

export function DataTableRowActions<TData>({ row }: DataTableRowActionsProps<TData>) {
  const <%= h.changeCase.camel(name) %> = row.original as <%= h.changeCase.pascal(name) %>;
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const { canUpdate, canDelete } = useCrudCapabilities();

  // Capability-aware UI: hidden controls are convenience only — the server
  // enforces each operation independently.
  if (!canUpdate && !canDelete) return null;

  return (
    <div className="flex justify-end gap-1 px-1 opacity-75 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
      {canUpdate && (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="size-8 rounded-lg text-primary transition-colors hover:bg-primary/10 hover:text-primary"
              onClick={() => setShowEditDialog(true)}
            >
              <FilePenLine className="mr-0 size-5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Editar </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      )}

      {canDelete && (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="size-8 rounded-lg text-destructive transition-colors hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setShowDeleteDialog(true)}
            >
              <Trash className="mr-0 size-5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Excluir</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      )}

      <Edit<%= h.changeCase.pascal(name) %>Dialog <%= h.changeCase.camel(name) %>={<%= h.changeCase.camel(name) %>} open={showEditDialog} onOpenChange={setShowEditDialog} />
      <Delete<%= h.changeCase.pascal(name) %>Dialog <%= h.changeCase.camel(name) %>={<%= h.changeCase.camel(name) %>} open={showDeleteDialog} onOpenChange={setShowDeleteDialog} />
    </div>
  );
}
