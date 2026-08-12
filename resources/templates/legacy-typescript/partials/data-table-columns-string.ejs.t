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
        case 'text':
            width = '200px';
            widthNum = 200;
            break;
        case 'varchar':
            width = '130px';
            widthNum = 130;
            break;
        case 'uuid':
            width = '180px';
            widthNum = 180;
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
    enableHiding: <%= field.name === 'fullName' || field.name === 'name' ? 'false' : 'true' %>,
    size: <%= widthNum %>,
    meta: {
      displayName: '<%= field.grdLabel || field.name %>',
    },
    cell: ({ row }) => {
      const value = row.getValue('<%= field.name %>') as string | null;
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
                {value || ''}
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