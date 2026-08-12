              {/* <%= field.name %> (<%= field.dataType %>) <%= isRequired ? '- Required' : '' %> */}
              <FormField
                control={form.control}
                name="<%= field.name %>"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel><%= field.fnrLabel || field.name %> (<%= field.dataType %>)</FormLabel>
                    <% if (isRequired) { %><span className="pl-1 text-destructive">*</span><% } %>
                    <FormControl>
                      <Input
                        placeholder="Digite o valor de <%= field.name %>"

                        {...field}
                        value={field.value || ''}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />