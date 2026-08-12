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
                        type="number"
                        <% if (isFirst) { %>autoFocus<% } %>
                        placeholder="Digite o valor de <%= field.name %>"

                        {...field}
                        onChange={(e) => field.onChange(Number(e.target.value))}
                        value={field.value || 0}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />