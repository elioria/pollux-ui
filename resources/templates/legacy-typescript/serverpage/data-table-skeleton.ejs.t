---
to: src/app/(private)/generated/<%= h.changeCase.param(name) %>/serverpage/data-table-skeleton.tsx
force: true
---
// tablecn-style loading skeleton shown by the route pendingComponent while
// the server page query runs.
export function DataTableSkeleton() {
  return (
    <div className="mx-auto h-full w-full max-w-[1600px] px-3 py-4 sm:px-5 md:px-8 md:py-6">
      <div className="pollux-generated-page min-w-0 space-y-4 md:space-y-5">
        <div className="h-24 animate-pulse rounded-2xl border bg-card shadow-[var(--pollux-shadow)]" />
        <div className="overflow-hidden rounded-2xl border bg-card shadow-[var(--pollux-shadow)]">
          <div className="h-11 animate-pulse bg-[var(--pollux-accent-soft)]/70" />
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-11 animate-pulse border-b border-border/40 bg-muted/20" />
          ))}
          <div className="h-14 animate-pulse bg-muted/10" />
        </div>
      </div>
    </div>
  );
}
