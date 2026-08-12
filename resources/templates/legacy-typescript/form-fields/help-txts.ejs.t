---
to: src/app/(private)/generated/<%= h.changeCase.param(name) %>/help-txts.txt
force: true
---
<%
let fields = [];
if (data && data.attributes && data.attributes.length) {
    fields = data.attributes.filter(field => field.fedIsinFormUpd === true);
}
%>

<ul className="grid grid-cols-1 gap-2 pl-4 text-sm">
<% if (fields && fields.length) {
    fields.forEach(function(field) {
        const fieldName = field.name;
        const fieldType = field.dataType;
        const isRequired = field.fnrMandatory === 'sim';
        const fieldLabel = field.fnrLabel || h.changeCase.title(fieldName);
    %>
  <li className="flex items-start gap-2">
    <span className="font-bold text-green-500">•</span>
    <span>
      <strong><%= fieldLabel %>:</strong> Digite o valor para <%= fieldName %> (<%= fieldType %>)<% if (isRequired) { %> - obrigatório<% } %>
    </span>
  </li>
<% }) } %>
  <li className="flex items-start gap-2">
    <span className="font-bold text-green-500">•</span>
    <span>
      <strong>Salvar:</strong> Para gravar as informações no banco de dados, clique uma única
      vez no botão verde Salvar.
    </span>
  </li>
</ul>