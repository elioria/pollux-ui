// Handwritten sidebar fragment host (part of the skeleton shell — NOT a
// generated file). Renders the navigation entries contributed by generated
// Pollux entities via `lib/pollux/registry.ts`. Regeneration only rewrites
// the per-entity registry fragments; this component and the sidebar that
// renders it are never touched by the generator.
import Link from 'next/link';

import { readPolluxRegistry } from '@/lib/pollux/registry';

export function PolluxNav() {
  const entries = readPolluxRegistry();
  if (entries.length === 0) return null;
  return (
    <div className="flex flex-col gap-1 border-t border-sidebar-border pt-3">
      <p className="px-3 pb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        Entidades geradas
      </p>
      {entries.map((entry) => (
        <Link
          key={entry.entity}
          href={entry.href}
          className="rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          {entry.label}
        </Link>
      ))}
    </div>
  );
}
