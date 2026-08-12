<%
// Calculate width based on grdColumnWidth or default
let width = '80px'; // Default width for boolean
let widthNum = 80;

// Check if field.grdColumnWidth is valid (between 1 and 999)
if (field.grdColumnWidth && field.grdColumnWidth > 0 && field.grdColumnWidth < 1000) {
    width = field.grdColumnWidth + 'px';
    widthNum = field.grdColumnWidth;
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
      displayName: '<%= field.grdLabel || field.name %> (boolean)',
    },
    filterFn: (row: Row<<%= h.changeCase.pascal(name) %>>, id: string, value: string[]) =>
      value.includes(String(row.getValue(id))),
    cell: ({ row }) => {
      const value = row.getValue('<%= field.name %>') as boolean | null;
      return (
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
                {value === true ? <Check /> : value === false ? ' ' : ''}
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>{value === true ? 'True' : value === false ? 'False' : 'N/A'}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    },
  },