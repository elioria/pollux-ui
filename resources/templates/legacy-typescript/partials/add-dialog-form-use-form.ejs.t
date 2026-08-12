const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
<% if (fields && fields.length) {
    fields.forEach(function(field, index) {
        const fieldName = h.camelField(field.name.trim());
        const fieldType = field.dataType;
        const isLast = index === fields.length - 1;

        // Skip ID field if it exists
        if (fieldName === 'id') return;

        let defaultValue = '';

        switch (fieldType) {
            case 'smallint':
            case 'integer':
            case 'bigint':
            case 'real':
            case 'double':
            case 'doublePrecision':
                defaultValue = '0';
                break;

            case 'numeric':
                defaultValue = 'null';
                break;

            case 'text':
            case 'varchar':
                defaultValue = "''";
                break;

            case 'date':
            case 'time':
            case 'timetz':
            case 'timestamp':
            case 'timestamptz':
                defaultValue = 'undefined';
                break;

            case 'boolean':
                defaultValue = 'false';
                break;

            case 'uuid':
                defaultValue = "null";
                break;

            default:
                defaultValue = "''";
                break;
        }
_%>
      <%- fieldName %>: <%- defaultValue %>,
<%  });
} %>    },
  });
