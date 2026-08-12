---
to: src/app/(private)/generated/<%= h.changeCase.param(name) %>/components/delete-<%= h.changeCase.param(name) %>-dialog.tsx
force: true
---

'use client';

import { useRouter } from '@tanstack/react-router';
import { useState } from 'react';
import { toast } from 'sonner';

import { crudErrorMessage } from '@/features/generated-crud/error-message';

import { delete<%= h.changeCase.pascal(name) %> } from '../actions/entityActions';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { type <%= h.changeCase.pascal(name) %> } from '@/db/schema';

interface Delete<%= h.changeCase.pascal(name) %>DialogProps {
  <%= h.changeCase.camel(name) %>: <%= h.changeCase.pascal(name) %>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function Delete<%= h.changeCase.pascal(name) %>Dialog({ <%= h.changeCase.camel(name) %>, open, onOpenChange }: Delete<%= h.changeCase.pascal(name) %>DialogProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDelete() {
    setIsDeleting(true);
    try {
      const result = await delete<%= h.changeCase.pascal(name) %>({ data: <%= h.changeCase.camel(name) %>.id });
      if (!result.ok) {
        // Keep the dialog open on failure; the message distinguishes
        // reference conflicts, not found, forbidden and unexpected errors.
        toast.error(crudErrorMessage(result.error));
        return;
      }
      toast.success('Registro excluído com sucesso');
      onOpenChange(false);
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
              Excluir registro {<%= h.changeCase.camel(name) %>.id}
            </DialogTitle>
            <DialogDescription>
              Confirma a exclusão deste registro? Esta ação não poderá ser desfeita.
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
