import { useState } from 'react';
import {
  isRouteErrorResponse,
  Links,
  Meta,
  NavLink,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteError,
} from 'react-router';
import '@fontsource-variable/inter';
import '@fontsource-variable/montserrat';

import './app.css';

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

// Pollux-generated sidebar registry (SPEC-005): one fragment per generated
// entity under app/generated/pollux/nav/. import.meta.glob keeps this file
// handwritten — regeneration adds/removes fragments without touching the
// shell, and with no generated entities the section simply doesn't render.
const polluxNavModules = import.meta.glob<{
  navEntry?: { to: string; label: string };
}>('./generated/pollux/nav/*.ts', { eager: true });

const POLLUX_NAV_ITEMS = Object.keys(polluxNavModules)
  .sort()
  .map((key) => polluxNavModules[key]?.navEntry)
  .filter((entry): entry is { to: string; label: string } => Boolean(entry));

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  [
    'block rounded-md px-3 py-2 text-sm font-medium transition-colors',
    isActive
      ? 'bg-sidebar-accent text-sidebar-accent-foreground'
      : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
  ].join(' ');

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
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={navLinkClass}
          >
            {item.label}
          </NavLink>
        ))}
        {POLLUX_NAV_ITEMS.length > 0 ? (
          <div className="mt-4">
            <p className="px-3 pb-1 text-[0.65rem] font-semibold tracking-wide text-muted-foreground uppercase">
              Entidades geradas
            </p>
            {POLLUX_NAV_ITEMS.map((item) => (
              <NavLink key={item.to} to={item.to} className={navLinkClass}>
                {item.label}
              </NavLink>
            ))}
          </div>
        ) : null}
      </nav>
      <div className="border-t border-sidebar-border px-5 py-4">
        <p className="text-xs text-muted-foreground">Skeleton Pollux · Remix</p>
      </div>
    </aside>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <Meta />
        <Links />
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
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary() {
  const error = useRouteError();
  const isResponse = isRouteErrorResponse(error);
  const title = isResponse ? `Erro ${error.status}` : 'Erro inesperado';
  const message = isResponse
    ? error.status === 404
      ? 'Página não encontrada.'
      : error.statusText || 'Ocorreu um erro ao processar a requisição.'
    : 'Ocorreu um erro inesperado na aplicação.';

  return (
    <div className="rounded-lg border border-border bg-card p-8">
      <h2 className="font-display text-xl font-semibold">{title}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
