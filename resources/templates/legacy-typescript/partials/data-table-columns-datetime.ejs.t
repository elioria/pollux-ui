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
    enableSorting: <%= field.grdOrderAble !== false %>,
    size: <%= widthNum %>,
    meta: {
      displayName: '<%= field.grdLabel || field.name %> (<%= field.dataType %>)',
    },
    cell: ({ row }) => {
      const value = row.getValue('<%= field.name %>') as string | Date | null;
      let displayValue = '';

      if (value) {
        const date = value instanceof Date ? value : new Date(value);
        <% if (field.dataType === 'date') { %>
        displayValue = date.toLocaleDateString();
        <% } else if (field.dataType === 'time' || field.dataType === 'timetz') { %>
        displayValue = date.toLocaleTimeString();
        <% } else { %>
        displayValue = date.toLocaleString();
        <% } %>
      }

      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className="force-width-column"
                style={{
                  width: '<%= width %>',
                  maxWidth: '<%= width %>',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {displayValue}
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>{displayValue || 'N/A'}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    },
  },