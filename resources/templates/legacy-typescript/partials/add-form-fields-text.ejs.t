              {/* <%= field.name %> (<%= field.dataType %>) <%= isRequired ? '- Required' : '' %> */}
              <FormField
                control={form.control}
                name="<%= field.name %>"
                render={({ field }) => (
                  <FormItem className="space-y-2 sm:col-span-2">
                    <FormLabel><%= field.fnrLabel || field.name %> (<%= field.dataType %>)</FormLabel>
                    <% if (isRequired) { %><span className="pl-1 text-destructive">*</span><% } %>
                    <FormControl>
                      <Textarea
                        placeholder="Digite o valor de <%= field.name %>"

                        {...field}
                        rows={3}<% if (field.fnrFillCase === 'maiúsculo') { %>
                        onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                        value={field.value ? field.value.toUpperCase() : ''}<% } else if (field.fnrFillCase === 'minúsculo') { %>
                        onChange={(e) => field.onChange(e.target.value.toLowerCase())}
                        value={field.value ? field.value.toLowerCase() : ''}<% } else { %>
                        value={field.value || ''}<% } %>
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
