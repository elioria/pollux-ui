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
                        type="date"
                        placeholder="Digite o valor de <%= field.name %>"

                        {...field}
                        value={field.value || ''}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />