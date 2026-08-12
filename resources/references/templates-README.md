# hygen

https://github.com/jondot/hygen/

## references

https://github.com/Benknightdark/hygen-nextjs-cli/tree/master/_templates/nextjs
https://github.com/manak1/next-template/tree/master
https://github.com/Benknightdark/hygen-next/blob/main/.hygen.js
https://github.com/getinapp/next-boilerplate/blob/main/.hygen.js
https://github.com/raphox/next-scaffold/tree/main

curl "https://dbtool.portalkardec.org.br/api/get-entity-attributes?name=entity_model" > json-files/entity_model.json

````typescript
<%_ switch (fieldType) {
              case 'date':
              case 'dateTZ':
                if (fieldName === 'created_at' || fieldName === 'updated_at') { _%>
                  <%= h.changeCase.camel(fieldName) %>: data.<%= h.changeCase.camel(fieldName) %>  || undefined,
                <%_ } else { _%>
                  <%= h.changeCase.camel(fieldName) %>: data.<%= h.changeCase.camel(fieldName) %>  || undefined,
                <%_ }
                break;
              case 'smallint':
              case 'numeric':
                if (fieldType === 'smallint') { _%>
                  <%= h.changeCase.camel(fieldName) %>: sql`${data.<%= h.changeCase.camel(fieldName) %>}::smallint`,
                <%_ } else { _%>
                  <%= h.changeCase.camel(fieldName) %>: sql`${data.<%= h.changeCase.camel(fieldName) %>}::numeric`,
                <%_ }
                break;
              default: _%>
                  <%= h.changeCase.camel(fieldName) %>: data.<%= h.changeCase.camel(fieldName) %>  || undefined,
                <%_ break;
          } _%>
          ```
```



```bash
 1496  vi .hygen.js
 1497  hygen pollux create teste --json attribute.json
 1502  hygen pollux create teste --json attribute.json
 1513  hygen pollux columns teste --json entity.json
 1514  hygen pollux page teste --json entity.json
 1515  hygen pollux columns teste --json entity.json
 1522  cd hygentest/
 1524  cd ../hygentest/
 1528  hygen pollux columns teste --json attribute.json
```
# generate a source code .ejs.t file which makes a loop in a array called fields. I want you to identify the field types and isolate the form field peace of code related to a particular fieldType in a separate artifact. Use following details provided to know how to properly generate the required artifacts

##field_types
Each of form field provided in attached peace of source code is related to a specific field type as below

| data_type   |
| ----------- |
| char        |
| boolean     |
| timestamp   |
| timestamptz |
| text        |
| smallint    |
| varchar     |
| time        |
| timetz      |
| bigint      |
| real        |
| double      |
| numeric     |
| integer     |
| uuid        |
| date        |

## example_of_json_data

the array fields come from data.attributes which is read from entity_model.json (present in Project Knowledge)

## source_code_to_transform

attached you have a source code containing form fields for you to transform in a loop structure similar to loop_structure. Please use ejs switch structure from switch_structure example to separate peaces according those dataType property coming from provided json

## loop_structure

<%_ switch (fieldType) {
case 'date':
case 'time':
case 'timetz':
case 'timestamp':
case 'timestamptz':
if (fieldName === 'created_at' || fieldName === 'updated_at') { _%>
<%- include(cwd + '/_templates/pollux-archive/partials/add-form-fields-datetime.ejs.t', { field: field }) -%>
<%_ } else { _%>
<%- include(cwd + '/\_templates/pollux-archive/partials/add-form-fields-date.ejs.t', { field: field }) -%>
<%_ }
break;
case 'boolean':_%>
<%- include(cwd + '/\_templates/pollux-archive/partials/add-form-fields-boolean.ejs.t', { field: field }) -%>
<%_ break;
case 'smallint':
case 'numeric':_%>
<%- include(cwd + '/\_templates/pollux-archive/partials/add-form-fields-numeric.ejs.t', { field: field }) -%>
<%_ break;
default: _%>
<%- include(cwd + '/\_templates/pollux-archive/partials/add-form-fields-string.ejs.t', { field: field }) -%>
<%_ break;
} \_%><% } else { %><%- include(cwd + '/\_templates/pollux-archive/partials/add-form-fields-id.ejs.t', { field: field }) -%>
<% } %>
<% }) %><% } %>

## loop_structure

an example of working source code loop you have

<%
let fields = [];
if (data && data.attributes && data.attributes.length) {
fields = data.attributes;
}
%>

<% if (fields && fields.length) {

    fields.forEach(function(field) {
        const fieldName = field.name;
        const fieldType = field.dataType;
    %>
    <%= fieldName %> : <%= fieldType %> : <%= field.grdIsinGrid %>
    <% }) %>

<% } %>
````
