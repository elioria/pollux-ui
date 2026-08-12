---
to: src/app/(private)/generated/<%= h.changeCase.param(name) %>/components/delete-multiple-<%= h.changeCase.param(name) %>-dialog.tsx
force: true
---
'use client';

import { useRouter } from '@tanstack/react-router';
import { useState } from 'react';
import { toast } from 'sonner';

import { crudErrorMessage } from '@/features/generated-crud/error-message';

import { deleteSelected<%= h.inflection.pluralize(h.changeCase.pascal(h.customPluralize(name))) %> } from '../actions/entityActions';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface DeleteMultiple<%= h.inflection.pluralize(h.changeCase.pascal(h.customPluralize(name))) %>DialogProps {
  <%= h.changeCase.camel(name) %>Ids: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function DeleteMultiple<%= h.inflection.pluralize(h.changeCase.pascal(h.customPluralize(name))) %>Dialog({
  <%= h.changeCase.camel(name) %>Ids,
  open,
  onOpenChange,
  onSuccess,
}: DeleteMultiple<%= h.inflection.pluralize(h.changeCase.pascal(h.customPluralize(name))) %>DialogProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDelete() {
    setIsDeleting(true);
    try {
      const result = await deleteSelected<%= h.inflection.pluralize(h.changeCase.pascal(h.customPluralize(name))) %>({ data: <%= h.changeCase.camel(name) %>Ids });
      if (!result.ok) {
        // Atomic on the server: either every selected row was deleted or
        // none. Keep the dialog open and the selection intact on failure.
        toast.error(crudErrorMessage(result.error));
        return;
      }
      toast.success(`${result.data.deletedCount} registros excluídos com sucesso`);
      onOpenChange(false);
      onSuccess();
      await router.invalidate();
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden rounded-2xl p-0 shadow-2xl sm:max-w-[460px]">
        <DialogHeader className="gap-4 px-6 pt-6">
          <div className="flex size-11 items-center justify-center rounded-full bg-destructive/10 text-lg font-bold text-destructive">
            !
          </div>
          <div className="space-y-2">
            <DialogTitle className="font-editorial text-2xl tracking-[-0.02em]">
              Excluir {<%= h.changeCase.camel(name) %>Ids.length} registros
            </DialogTitle>
            <DialogDescription>
              Confirma a exclusão dos registros selecionados? Esta ação não poderá ser desfeita.
            </DialogDescription>
          </div>
        </DialogHeader>
        <DialogFooter className="mt-2 border-t bg-muted/25 px-6 py-4">
          <Button variant="secondary" onClick={() => onOpenChange(false)} className="rounded-lg">
            Cancelar
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={isDeleting} className="rounded-lg">
            {isDeleting ? 'Excluindo...' : 'Excluir'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
