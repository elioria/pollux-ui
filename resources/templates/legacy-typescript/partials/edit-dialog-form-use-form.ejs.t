<% if (fields && fields.length) { -%>
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
<% fields.forEach(function(field, index) { -%>
<% const fieldName = h.camelField(field.name.trim()); -%>
<% const fieldType = field.dataType ? field.dataType.trim().toLowerCase() : field.data_type ? field.data_type.trim().toLowerCase() : 'text'; -%>
<% if (fieldName !== 'id' && fieldName !== 'deletedAt') { -%>
<%   switch (fieldType) {
       case 'boolean': -%>
      <%= fieldName %>: <%= h.changeCase.camel(name) %>.<%= fieldName %> ?? undefined,
<%       break;
       case 'smallint':
       case 'integer':
       case 'bigint':
       case 'real':
       case 'double':
       case 'doublePrecision': -%>
      <%= fieldName %>: <%= h.changeCase.camel(name) %>.<%= fieldName %> ?? undefined,
<%       break;
       case 'text': -%>
      <%= fieldName %>: <%= h.changeCase.camel(name) %>.<%= fieldName %> ?? '',
<%       break;
       case 'varchar':
       case 'char':
       case 'uuid': -%>
      <%= fieldName %>: <%= h.changeCase.camel(name) %>.<%= fieldName %> ?? undefined,
<%       break;
       case 'numeric': -%>
      <%= fieldName %>: <%= h.changeCase.camel(name) %>.<%= fieldName %> != null ? String(<%= h.changeCase.camel(name) %>.<%= fieldName %>) : undefined,
<%       break;
       case 'date':
       case 'timestamp':
       case 'timestamptz':
       case 'datetime': -%>
      <%= fieldName %>: convertUTCToLocal(<%= h.changeCase.camel(name) %>.<%= fieldName %>) ?? undefined,
<%       break;
       case 'time':
       case 'timetz': -%>
      <%= fieldName %>: <%= h.changeCase.camel(name) %>.<%= fieldName %> ?? undefined,
<%       break;
       default: -%>
      <%= fieldName %>: <%= h.changeCase.camel(name) %>.<%= fieldName %> ?? undefined,
<%       break;
     } -%>
<% } -%>
<% }); -%>
    },
  });
<% } else { -%>
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {},
  });
<% } -%>