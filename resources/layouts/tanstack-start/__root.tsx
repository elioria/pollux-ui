/// <reference types="vite/client" />
import {
  createRootRoute,
  HeadContent,
  Link,
  Outlet,
  Scripts,
} from '@tanstack/react-router';
import { type ReactNode,useState } from 'react';

import appCss from '../styles/app.css?url';

const THEME_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem('theme');
    var dark =
      stored === 'dark' ||
      (!stored && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', dark);
  } catch (e) {}
})();
`;

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard' },
  { to: '/entidades', label: 'Entidades' },
  { to: '/administracao', label: 'Administração' },
];

// Pollux-generated sidebar registry (SPEC-008): one fragment per generated
// entity under src/generated/pollux/nav/. import.meta.glob keeps this file
// handwritten — regeneration adds/removes fragments without touching the
// shell, and with no generated entities the section simply doesn't render.
const polluxNavModules = import.meta.glob<{
  navEntry?: { to: string; label: string };
}>('../generated/pollux/nav/*.ts', { eager: true });

const POLLUX_NAV_ITEMS = Object.keys(polluxNavModules)
  .sort()
  .map((key) => polluxNavModules[key]?.navEntry)
  .filter((entry): entry is { to: string; label: string } => Boolean(entry));

const navLinkBase =
  'block rounded-md px-3 py-2 text-sm font-medium transition-colors text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground';
const navLinkActive =
  'block rounded-md px-3 py-2 text-sm font-medium transition-colors bg-sidebar-accent text-sidebar-accent-foreground';

function ThemeToggle() {
  const [isDark, setIsDark] = useState(() =>
    typeof document !== 'undefined'
      ? document.documentElement.classList.contains('dark')
      : false
  );

  const toggle = () => {
    const next = !document.documentElement.classList.contains('dark');
    document.documentElement.classList.toggle('dark', next);
    try {
      localStorage.setItem('theme', next ? 'dark' : 'light');
    } catch {
      // localStorage unavailable — theme just won't persist
    }
    setIsDark(next);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Alternar tema"
      title="Alternar tema claro/escuro"
      className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-card text-foreground transition-colors hover:bg-accent"
    >
      <span aria-hidden="true">{isDark ? '☀️' : '🌙'}</span>
    </button>
  );
}

function SidebarLink({
  to,
  label,
  exact,
}: {
  to: string;
  label: string;
  exact?: boolean;
}) {
  return (
    <Link
      to={to}
      activeOptions={{ exact: exact ?? false }}
      className={navLinkBase}
      activeProps={{ className: navLinkActive }}
    >
      {label}
    </Link>
  );
}

function Sidebar() {
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
      <div className="border-b border-sidebar-border px-5 py-5">
        <p className="font-display text-lg font-bold text-sidebar-foreground">
          Pollux
        </p>
        <p className="text-xs text-muted-foreground">Painel administrativo</p>
      </div>
      <nav
        className="flex-1 space-y-1 px-3 py-4"
        aria-label="Navegação principal"
      >
        {NAV_ITEMS.map((item) => (
          <SidebarLink
            key={item.to}
            to={item.to}
            label={item.label}
            exact={item.to === '/'}
          />
        ))}
        {POLLUX_NAV_ITEMS.length > 0 ? (
          <div className="mt-4">
            <p className="px-3 pb-1 text-[0.65rem] font-semibold tracking-wide text-muted-foreground uppercase">
              Entidades geradas
            </p>
            {POLLUX_NAV_ITEMS.map((item) => (
              <SidebarLink key={item.to} to={item.to} label={item.label} />
            ))}
          </div>
        ) : null}
      </nav>
      <div className="border-t border-sidebar-border px-5 py-4">
        <p className="text-xs text-muted-foreground">
          Skeleton Pollux · TanStack Start
        </p>
      </div>
    </aside>
  );
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <HeadContent />
      </head>
      <body>
        <div className="flex min-h-screen bg-background text-foreground">
          <Sidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <header className="flex h-14 items-center justify-between border-b border-border bg-card px-6">
              <h1 className="font-display text-base font-semibold">Pollux</h1>
              <ThemeToggle />
            </header>
            <main className="flex-1 p-6">{children}</main>
          </div>
        </div>
        <Scripts />
      </body>
    </html>
  );
}

function ErrorShell({ title, message }: { title: string; message: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-8">
      <h2 className="font-display text-xl font-semibold">{title}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Pollux' },
    ],
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  notFoundComponent: () => (
    <ErrorShell title="Erro 404" message="Página não encontrada." />
  ),
  errorComponent: () => (
    <ErrorShell
      title="Erro inesperado"
      message="Ocorreu um erro inesperado na aplicação."
    />
  ),
  component: () => (
    <RootDocument>
      <Outlet />
    </RootDocument>
  ),
});
