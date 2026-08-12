              {/* Field <%= field.position %> - <%= field.dataType %> */}
              <FormField
                control={form.control}
                name="<%= field.name %>"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center">
                      <%= field.fedLabel || field.name %> (<%= field.dataType %>) <LockIcon className="ml-1 size-3 text-destructive" />
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="UUID"
                        className="bg-muted"
                        {...field}
                        readOnly
                        value={field.value || undefined}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />