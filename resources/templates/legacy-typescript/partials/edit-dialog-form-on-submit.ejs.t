async function onSubmit(values: z.infer<typeof formSchema>) {
    // Allowlisted form fields only — never spread `values` into the payload.
    const dataToSubmit = {
<% if (fields && fields.length) {
    fields.forEach(function(field) {
        const fieldName = h.camelField(field.name.trim());
        const fieldType = (field.dataType || 'text').trim().toLowerCase();
        if (['id', 'createdAt', 'createdById', 'updatedAt', 'updatedById', 'deletedAt'].indexOf(fieldName) !== -1) return;

        let assignment = '';
        switch (fieldType) {
            case 'smallint':
            case 'integer':
            case 'bigint':
            case 'real':
            case 'double':
                assignment = `values.${fieldName}`;
                break;
            case 'boolean':
                assignment = `values.${fieldName} ?? false`;
                break;
            case 'numeric':
            case 'date':
            case 'time':
            case 'timetz':
            case 'timestamp':
            case 'timestamptz':
            case 'uuid':
                assignment = `values.${fieldName} && values.${fieldName}.trim() !== '' ? values.${fieldName} : null`;
                break;
            default:
                assignment = `values.${fieldName} ?? ''`;
                break;
        }
_%>
      <%- fieldName %>: <%- assignment %>,
<%  });
} %>    };

    const result = await update<%= h.changeCase.pascal(name) %>({
      data: {
        id: <%= h.changeCase.camel(name) %>.id,
        // Optimistic concurrency token: the row's updatedAt as loaded.
        expectedUpdatedAt:
          (<%= h.changeCase.camel(name) %> as { updatedAt?: Date | string | null }).updatedAt ?? null,
        data: dataToSubmit,
      },
    });

    if (!result.ok) {
      applyCrudFieldErrors(
        result.error,
        (field, error) => form.setError(field as never, error),
        Object.keys(formSchema.shape)
      );
      // On STALE_WRITE the dialog stays open with the user's values —
      // no automatic overwrite; cancel + reopen loads the latest row.
      toast.error(crudErrorMessage(result.error));
      return;
    }

    toast.success('Registro atualizado com sucesso');
    await router.invalidate();
    onOpenChange(false);
  }