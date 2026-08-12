// Reset form values when <%= h.changeCase.camel(name) %> prop changes
  useEffect(() => {
    if (<%= h.changeCase.camel(name) %>) {
      form.reset({
<%_ if (fields && fields.length) { _%>
<%_ fields.forEach(function(field, index) { _%>
<%_ const fieldName = h.camelField(field.name.trim()); _%>
<%_ const fieldType = field.dataType.trim(); _%>
<%_ if (fieldName !== 'id' && fieldName !== 'deletedAt') { _%>
<%_ let defaultValue = 'undefined'; _%>
<%_ if (fieldType === 'text' || fieldType === 'varchar') { _%>
<%_ defaultValue = "undefined"; _%>
<%_ } else if (fieldType === 'boolean') { _%>
<%_ defaultValue = 'false'; _%>
<%_ } else if (fieldType === 'smallint' || fieldType === 'integer' || fieldType === 'bigint' || fieldType === 'real' || fieldType === 'double') { _%>
<%_ defaultValue = '0'; _%>
<%_ } else if (fieldType === 'numeric' || fieldType === 'date' || fieldType === 'time' || fieldType === 'timetz' || fieldType === 'timestamp' || fieldType === 'timestamptz') { _%>
<%_ defaultValue = 'undefined'; _%>
<%_ } _%>
<%_ const isDateCol = fieldType === 'date' || fieldType === 'timestamp' || fieldType === 'timestamptz'; _%>
<%_ if (isDateCol) { _%>
        <%= fieldName %>: convertUTCToLocal(<%= h.changeCase.camel(name) %>.<%= fieldName %>) ?? <%- defaultValue %>,
<%_ } else if (fieldType === 'numeric') { _%>
        <%= fieldName %>: <%= h.changeCase.camel(name) %>.<%= fieldName %> != null ? String(<%= h.changeCase.camel(name) %>.<%= fieldName %>) : <%- defaultValue %>,
<%_ } else { _%>
        <%= fieldName %>: <%= h.changeCase.camel(name) %>.<%= fieldName %> ?? <%- defaultValue %>,
<%_ } _%>
<%_ } _%>
<%_ }); _%>
<%_ } _%>
      });
    }
  }, [<%= h.changeCase.camel(name) %>, form]);