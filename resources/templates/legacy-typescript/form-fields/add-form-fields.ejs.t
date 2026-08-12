---
to: src/app/(private)/generated/<%= h.changeCase.param(name) %>/add-form-fields.txt
force: true
---
<%
let fields = [];
if (data && data.attributes && data.attributes.length) {
    fields = data.attributes.filter(field => field.fnrIsinFormAdd === true);
}
%>

<% if (fields && fields.length) {

    fields.forEach(function(field) {
        const fieldName = field.name;
        const fieldType = field.dataType;
        const isRequired = field.fnrMandatory === 'sim';
        const isFirst = fields.indexOf(field) === 0;
    %>
    <% if (fieldName !== 'id') { %>
        <%_ switch (fieldType) {
              case 'date':
                _%>
<%- include(cwd + '/_templates/pollux/partials/add-form-fields-date.ejs.t', { field: field, isRequired: isRequired }) -%>
                <%_ break;
              case 'time':
              case 'timetz':
                _%>
<%- include(cwd + '/_templates/pollux/partials/add-form-fields-time.ejs.t', { field: field, isRequired: isRequired }) -%>
                <%_ break;
              case 'timestamp':
              case 'timestamptz':
                _%>
<%- include(cwd + '/_templates/pollux/partials/add-form-fields-timestamp.ejs.t', { field: field, isRequired: isRequired }) -%>
                <%_ break;
              case 'boolean':_%>
<%- include(cwd + '/_templates/pollux/partials/add-form-fields-boolean.ejs.t', { field: field, isRequired: isRequired }) -%>
                <%_ break;
              case 'smallint':
              case 'integer':
              case 'bigint':_%>
<%- include(cwd + '/_templates/pollux/partials/add-form-fields-integer.ejs.t', { field: field, isRequired: isRequired, isFirst: isFirst }) -%>
                <%_ break;
              case 'real':
              case 'double':_%>
<%- include(cwd + '/_templates/pollux/partials/add-form-fields-float.ejs.t', { field: field, isRequired: isRequired }) -%>
                <%_ break;
              case 'numeric':_%>
<%- include(cwd + '/_templates/pollux/partials/add-form-fields-numeric.ejs.t', { field: field, isRequired: isRequired }) -%>
                <%_ break;
              case 'text':_%>
<%- include(cwd + '/_templates/pollux/partials/add-form-fields-text.ejs.t', { field: field, isRequired: isRequired }) -%>
                <%_ break;
              case 'varchar':
              case 'char':_%>
<%- include(cwd + '/_templates/pollux/partials/add-form-fields-varchar.ejs.t', { field: field, isRequired: isRequired }) -%>
                <%_ break;
              case 'uuid':_%>
<%- include(cwd + '/_templates/pollux/partials/add-form-fields-uuid.ejs.t', { field: field, isRequired: isRequired }) -%>
                <%_ break;
              default: _%>
<%- include(cwd + '/_templates/pollux/partials/add-form-fields-string.ejs.t', { field: field, isRequired: isRequired }) -%>
                <%_ break;
        } _%>
    <% } %>
<% }) %><% } %>