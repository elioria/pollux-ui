              {/* Field <%= field.position %> - <%= field.dataType %> */}
              <FormField
                control={form.control}
                name="<%= field.name %>"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      <%= field.fedLabel || field.name %> (<%= field.dataType %>)<% if (field.fnrMandatory === 'sim') { %> <span className="text-destructive">*</span><% } %>
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Digite o valor de <%= field.name %>"

                        {...field}<% if (field.fedFillCase === 'upper') { %>
                        onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                        value={field.value?.toUpperCase() || ''}<% } else { %>
                        value={field.value || ''}<% } %>
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />