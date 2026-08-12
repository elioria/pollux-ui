              {/* Field <%= field.position %> - <%= field.dataType %> */}
              <FormField
                control={form.control}
                name="<%= field.name %>"
                render={({ field }) => (
                  <FormItem className="flex min-h-11 flex-row items-center space-x-3 space-y-0 rounded-xl border bg-muted/20 px-3">
                    <FormControl>
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-input text-primary focus:ring-2 focus:ring-ring"
                        checked={field.value || false}
                        onChange={(e) => field.onChange(e.target.checked)}
                      />
                    </FormControl>
                    <FormLabel className="text-sm font-normal">
                      <%= field.fedLabel || field.name %> (<%= field.dataType %>)
                    </FormLabel>
                    <FormMessage />
                  </FormItem>
                )}
              />
