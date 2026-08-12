import Link from 'next/link';

import { PolluxNav } from '@/components/pollux-nav';

const navItems = [
  { href: '/', label: 'Dashboard' },
  { href: '/entidades', label: 'Entidades' },
  { href: '/administracao', label: 'Administração' },
];

export function Sidebar() {
  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
      <div className="flex h-16 items-center border-b border-sidebar-border px-6">
        <div>
          <p className="font-display text-base font-bold text-sidebar-accent-foreground">
            Pollux
          </p>
          <p className="text-xs text-muted-foreground">Painel administrativo</p>
        </div>
      </div>
      <nav className="flex flex-1 flex-col gap-1 p-3">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            {item.label}
          </Link>
        ))}
        <PolluxNav />
      </nav>
      <div className="border-t border-sidebar-border p-4">
        <p className="text-xs text-muted-foreground">
          Esqueleto Next.js — Pollux
        </p>
      </div>
    </aside>
  );
}
