---
to: src/app/(private)/generated/<%= h.changeCase.param(name) %>/data-table-components/force-column-width.css
force: true
---
/* Force column width for all columns */
.force-width-column {
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  white-space: nowrap !important;
}

.admin-table {
  border-collapse: separate;
  border-spacing: 0;
}

.admin-table th {
  height: 44px;
  padding-inline: 12px;
}

.admin-table td {
  height: 48px;
  padding-inline: 12px;
}

/* Add specific column widths for all columns */
/* Select column (checkbox) */
.admin-table th:nth-child(1),
.admin-table td:nth-child(1) {
  width: 30px !important;
  min-width: 30px !important;
  max-width: 30px !important;
}
<%
let fields = [];
let columnIndex = 2; // Start from 2 because checkbox is column 1
if (data && data.attributes && data.attributes.length) {
    fields = data.attributes.filter(field => field.grdIsinGrid === true);
    // Update all field names to camelCase
    fields = fields.map(field => ({ ...field, name: h.camelField(field.name.trim()) }));
    fields = fields.sort((a, b) => (a.grdSeq || 0) - (b.grdSeq || 0));
}
%>
<% if (fields && fields.length) {

    fields.forEach(function(field) {
        const fieldName = field.name.trim();
        const fieldType = field.dataType.trim();
        let width = '150px'; // Default width

        // Check if field.grdColumnWidth is valid (between 1 and 999)
        if (field.grdColumnWidth && field.grdColumnWidth > 0 && field.grdColumnWidth < 1000) {
            width = field.grdColumnWidth + 'px';
        } else {
            // Determine width based on field type
            switch (fieldType) {
                case 'smallint':
                    width = '90px';
                    break;
                case 'integer':
                    width = '120px';
                    break;
                case 'bigint':
                    width = '150px';
                    break;
                case 'real':
                    width = '100px';
                    break;
                case 'double':
                    width = '120px';
                    break;
                case 'numeric':
                    width = '150px';
                    break;
                case 'text':
                    width = '200px';
                    break;
                case 'varchar':
                    width = '130px';
                    break;
                case 'date':
                    width = '110px';
                    break;
                case 'time':
                case 'timetz':
                    width = '90px';
                    break;
                case 'timestamp':
                    width = '140px';
                    break;
                case 'timestamptz':
                    width = '160px';
                    break;
                case 'boolean':
                    width = '80px';
                    break;
                case 'uuid':
                    width = '180px';
                    break;
                default:
                    width = '150px';
            }
        }

        if (fieldName !== 'id') { // Don't show CSS for hidden ID field
    %>
/* <%= fieldName %> (<%= fieldType %>) - Width: <%= width %> */
.admin-table th:nth-child(<%= columnIndex %>),
.admin-table td:nth-child(<%= columnIndex %>) {
  width: <%= width %> !important;
  min-width: <%= width %> !important;
  max-width: <%= width %> !important;
  <% if (fieldType === 'smallint' || fieldType === 'integer' || fieldType === 'bigint' || fieldType === 'real' || fieldType === 'double') { %>overflow: visible !important;
  text-overflow: clip !important;
  <% } else { %>overflow: hidden !important;
  text-overflow: ellipsis !important;
  <% } %>white-space: nowrap !important;
}
<%      }
        columnIndex++;
    })
%><% } %>
/* Actions column */
.admin-table th:nth-child(<%= columnIndex %>),
.admin-table td:nth-child(<%= columnIndex %>) {
  width: 120px !important;
  min-width: 120px !important;
  max-width: 120px !important;
}
