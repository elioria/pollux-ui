// <%= field.name %> - <%= field.dataType %> (ID field - hidden)
  {
    accessorKey: '<%= field.name %>',
    header: ({ column }: { column: Column<<%= h.changeCase.pascal(name) %>, unknown> }) => (
      <div className="force-width-column" style={{ width: '0px', maxWidth: '0px' }}>
        <DataTableColumnHeader column={column} title="ID" />
      </div>
    ),
    enableSorting: false,
    enableHiding: true,
    size: 0,
    meta: {
      displayName: 'ID',
    },
    cell: ({ row }) => {
      const value = row.getValue('<%= field.name %>') as string | null;
      return null; // ID field is hidden
    },
  },