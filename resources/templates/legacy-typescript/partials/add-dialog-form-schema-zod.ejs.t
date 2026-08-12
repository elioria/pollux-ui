const formSchema = z.object({
<% if (fields && fields.length) {
    fields.forEach(function(field, index) {
        const fieldName = h.camelField(field.name.trim());
        const fieldType = field.dataType;
        const isRequired = field.fnrMandatory === 'sim' || field.fedMandatory === 'sim';
        const isNullable = field.isNullable;

        // Skip ID field if it exists
        if (fieldName === 'id') return;

        let zodType = '';
        let comment = `// ${fieldType}`;

        switch (fieldType) {
            case 'smallint':
            case 'integer':
            case 'bigint':
                zodType = 'z.number()';
                if (isRequired) {
                    zodType += `.min(1, 'Campo obrigatório')`;
                } else {
                    zodType += '.optional()';
                }
                break;

            case 'real':
            case 'double':
            case 'doublePrecision':
                zodType = 'z.number()';
                if (isRequired) {
                    zodType += `.min(0, 'Campo obrigatório')`;
                } else {
                    zodType += '.optional()';
                }
                break;

            case 'numeric':
                zodType = 'z.string()';
                if (isRequired) {
                    zodType += `.min(1, 'Campo obrigatório')`;
                } else {
                    zodType += '.optional()';
                    if (isNullable) {
                        zodType += '.nullable()';
                    }
                }
                break;

            case 'text':
            case 'varchar':
                zodType = 'z.string()';
                if (isRequired) {
                    zodType += `.min(1, 'Campo obrigatório')`;
                } else {
                    zodType += '.optional()';
                }
                break;

            case 'date':
            case 'time':
            case 'timetz':
            case 'timestamp':
            case 'timestamptz':
                zodType = 'z.string()';
                if (isRequired) {
                    zodType += `.min(1, 'Campo obrigatório')`;
                } else {
                    zodType += '.optional()';
                    if (isNullable) {
                        zodType += '';
                    }
                }
                comment += ' (string mode)';
                break;

            case 'boolean':
                zodType = 'z.boolean()';
                if (!isRequired) {
                    zodType += '.optional()';
                }
                break;

            case 'uuid':
                zodType = 'z.string()';
                if (isRequired) {
                    zodType += `.uuid('UUID inválido')`;
                } else {
                    zodType += '.optional().nullable()';
                }
                break;

            default:
                zodType = 'z.string()';
                if (isRequired) {
                    zodType += `.min(1, 'Campo obrigatório')`;
                } else {
                    zodType += '.optional()';
                }
                break;
        }
_%>
  <%= fieldName %>: <%- zodType %>, <%- comment %>
<%  });
} %>});
