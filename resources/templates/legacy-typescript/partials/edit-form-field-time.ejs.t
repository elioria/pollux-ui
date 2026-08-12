              {/* Field <%= field.position %> - <%= field.dataType %> */}
              <FormField
                control={form.control}
                name="<%= field.name %>"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      <%= field.fedLabel || field.name %> (<%= field.dataType %>)
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="time"
                        placeholder="Digite o valor de <%= field.name %>"

                        {...field}
                        value={<% if (field.dataType === 'timetz') { %>field.value ? field.value.substring(0, 8) : ''<% } else { %>field.value || ''<% } %>}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />