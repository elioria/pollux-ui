<%
// Calculate width based on grdColumnWidth or field type
let width = '150px'; // Default width
let widthNum = 150;

// Check if field.grdColumnWidth is valid (between 1 and 999)
if (field.grdColumnWidth && field.grdColumnWidth > 0 && field.grdColumnWidth < 1000) {
    width = field.grdColumnWidth + 'px';
    widthNum = field.grdColumnWidth;
} else {
    // Determine width based on field type
    const fieldType = field.dataType.trim();
    switch (fieldType) {
        case 'date':
            width = '110px';
            widthNum = 110;
            break;
        case 'time':
        case 'timetz':
            width = '90px';
            widthNum = 90;
            break;
        case 'timestamp':
            width = '140px';
            widthNum = 140;
            break;
        case 'timestamptz':
            width = '160px';
            widthNum = 160;
            break;
        default:
            width = '150px';
            widthNum = 150;
    }
}
%>


// <%= field.name %> - <%= field.dataType %>
  {
    accessorKey: '<%= field.name %>',
    header: ({ column }: { column: Column<<%= h.changeCase.pascal(name) %>, unknown> }) => (
      <div className="force-width-column" style={{ width: '<%= width %>', maxWidth: '<%= width %>' }}>
        <DataTableColumnHeader column={column} title="<%= field.grdLabel || field.name %>" />
      </div>
    ),
    enableSorting: <%= field.grdOrderAble || true %>,
    size: <%= widthNum %>,
    meta: {
      displayName: '<%= field.grdLabel || field.name %> (<%= field.dataType === 'timetz' ? 'time+tz' : (field.dataType === 'timestamptz' ? 'timestamp+tz' : field.dataType) %>)',
    },
    cell: ({ row }) => {
      const value = row.getValue('<%= field.name %>') as string | null;
      <% if (field.dataType === 'date') { %>const formatDate = (dateStr: string | null) => {
        if (!dateStr) return '';
        try {
          const date = new Date(dateStr);
          return date.toLocaleDateString('pt-BR');
        } catch {
          return dateStr;
        }
      };
      <% } else if (field.dataType === 'timestamp' || field.dataType === 'timestamptz') { %>const formatDateTime = (dateStr: string | null) => {
        if (!dateStr) return '';
        try {
          const date = new Date(dateStr);
          return date.toLocaleString('pt-BR');
        } catch {
          return dateStr;
        }
      };
      <% } %>return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className="force-width-column text-center"
                style={{
                  width: '<%= width %>',
                  maxWidth: '<%= width %>',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {<%- field.dataType === 'date' ? 'formatDate(value)' : (field.dataType === 'timestamp' || field.dataType === 'timestamptz' ? 'formatDateTime(value)' : 'value || \'\'') %>}
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>{value || 'N/A'}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    },
  },