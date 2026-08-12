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
        case 'smallint':
            width = '90px';
            widthNum = 90;
            break;
        case 'integer':
            width = '120px';
            widthNum = 120;
            break;
        case 'bigint':
            width = '150px';
            widthNum = 150;
            break;
        case 'real':
            width = '100px';
            widthNum = 100;
            break;
        case 'double':
            width = '120px';
            widthNum = 120;
            break;
        case 'numeric':
            width = '150px';
            widthNum = 150;
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
      <div className="force-width-column text-right" style={{ width: '<%= width %>', maxWidth: '<%= width %>' }}>
        <DataTableColumnHeader column={column} title="<%= field.grdLabel || field.name %>" />
      </div>
    ),
    enableSorting: <%= field.grdOrderAble !== false %>,
    size: <%= widthNum %>,
    meta: {
      displayName: '<%= field.grdLabel || field.name %> (<%= field.dataType %>)',
    },
    cell: ({ row }) => {
      const value = row.getValue('<%= field.name %>') as number | null;
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className="force-width-column text-right"
                style={{
                  width: '<%= width %>',
                  maxWidth: '<%= width %>',
                  overflow: 'visible',
                  textOverflow: 'clip',
                  whiteSpace: 'nowrap',
                }}
              >
                {value !== null ? value.toLocaleString() : ''}
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>{value !== null ? value.toLocaleString() : 'N/A'}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    },
  },