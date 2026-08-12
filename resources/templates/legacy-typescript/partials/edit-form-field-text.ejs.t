              {/* Field <%= field.position %> - <%= field.dataType %> */}
              <FormField
                control={form.control}
                name="<%= field.name %>"
                render={({ field }) => (
                  <FormItem className="space-y-2 sm:col-span-2">
                    <FormLabel>
                      <%= field.fedLabel || field.name %> (<%= field.dataType %>)
                    </FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Digite o valor de <%= field.name %>"

                        {...field}<% if (field.fedFillCase === 'maiúsculo') { %>
                        onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                        value={field.value ? field.value.toUpperCase() : ''}<% } else if (field.fedFillCase === 'minúsculo') { %>
                        onChange={(e) => field.onChange(e.target.value.toLowerCase())}
                        value={field.value ? field.value.toLowerCase() : ''}<% } else { %>
                        value={field.value || ''}<% } %>
                        rows={3}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
