---
to: src/app/(private)/generated/<%= h.changeCase.param(name) %>/edit-form-fields.txt
force: true
---
<%
let fields = [];
if (data && data.attributes && data.attributes.length) {
    fields = data.attributes.filter(field => field.fedIsinFormUpd === true);
}
%>

<% if (fields && fields.length) {
    fields.forEach(function(field) {
        const fieldName = field.name;
        const fieldType = field.dataType;
        const isRequired = field.fnrMandatory === 'sim';
        const isReadonly = field.fedReadonly === true;
%>
<% if (fieldName !== 'id') { %>
<%_ switch (fieldType) {
    case 'date': _%>
<%- include(cwd + '/_templates/pollux/partials/edit-form-field-date.ejs.t', { field: field }) -%>
    <%_ break;
    case 'time':
    case 'timetz': _%>
<%- include(cwd + '/_templates/pollux/partials/edit-form-field-time.ejs.t', { field: field }) -%>
    <%_ break;
    case 'timestamp':
    case 'timestamptz': _%>
<%- include(cwd + '/_templates/pollux/partials/edit-form-field-timestamp.ejs.t', { field: field }) -%>
    <%_ break;
    case 'boolean': _%>
<%- include(cwd + '/_templates/pollux/partials/edit-form-field-boolean.ejs.t', { field: field }) -%>
    <%_ break;
    case 'smallint':
    case 'integer':
    case 'bigint': _%>
<%- include(cwd + '/_templates/pollux/partials/edit-form-field-integer.ejs.t', { field: field }) -%>
    <%_ break;
    case 'real':
    case 'double': _%>
<%- include(cwd + '/_templates/pollux/partials/edit-form-field-float.ejs.t', { field: field }) -%>
    <%_ break;
    case 'numeric': _%>
<%- include(cwd + '/_templates/pollux/partials/edit-form-field-numeric.ejs.t', { field: field }) -%>
    <%_ break;
    case 'text': _%>
<%- include(cwd + '/_templates/pollux/partials/edit-form-field-text.ejs.t', { field: field }) -%>
    <%_ break;
    case 'varchar':
    case 'char': _%>
<%- include(cwd + '/_templates/pollux/partials/edit-form-field-varchar.ejs.t', { field: field }) -%>
    <%_ break;
    case 'uuid': _%>
<%- include(cwd + '/_templates/pollux/partials/edit-form-field-uuid.ejs.t', { field: field }) -%>
    <%_ break;
    default: _%>
<%- include(cwd + '/_templates/pollux/partials/edit-form-field-string.ejs.t', { field: field }) -%>
    <%_ break;
} _%>
<% } %>
<% }) %>
<% } %>