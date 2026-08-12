              {/* Field <%= field.position %> - <%= field.dataType %> */}
              <FormField
                control={form.control}
                name="<%= field.name %>"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel<% if (field.fedReadonly) { %> className="flex items-center"<% } %>>
                      <%= field.fedLabel || field.name %> (<%= field.dataType %>)<% if (field.fedReadonly) { %> <LockIcon className="ml-1 size-3 text-destructive" /><% } %>
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="number"<% if (field.position === 2) { %>
                        autoFocus<% } %>
                        placeholder="Digite o valor de <%= field.name %>"
                        className="<%= field.fedReadonly ? 'bg-muted' : '' %>"
                        {...field}<% if (field.fedReadonly) { %>
                        readOnly<% } %>
                        onChange={(e) => field.onChange(Number(e.target.value) || <% if (field.dataType === 'integer' && field.fedMandatory === 'sim') { %>0<% } else { %>undefined<% } %>)}
                        value={field.value?.toString() || ''}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />