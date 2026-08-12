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
                        placeholder="Digite o valor de <%= field.name %>"

                        {...field}<% if (field.fedFillCase === 'minúsculo') { %>
                        onChange={(e) => field.onChange(e.target.value.toLowerCase())}
                        value={field.value?.toLowerCase()}<% } else if (field.fedFillCase === 'maiúsculo') { %>
                        onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                        value={field.value?.toUpperCase()}<% } else { %>
                        value={field.value || ''}<% } %>
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />