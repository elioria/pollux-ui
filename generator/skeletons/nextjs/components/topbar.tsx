'use client';

import { useCallback } from 'react';

export function Topbar({ title = 'Dashboard' }: { title?: string }) {
  const toggleTheme = useCallback(() => {
    const root = document.documentElement;
    const isDark = root.classList.toggle('dark');
    try {
      localStorage.setItem('theme', isDark ? 'dark' : 'light');
    } catch {
      // localStorage unavailable — ignore
    }
  }, []);

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-card px-6">
      <h1 className="font-display text-lg font-semibold text-foreground">
        {title}
      </h1>
      <button
        type="button"
        onClick={toggleTheme}
        aria-label="Alternar tema claro/escuro"
        className="rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        <span className="dark:hidden">Modo escuro</span>
        <span className="hidden dark:inline">Modo claro</span>
      </button>
    </header>
  );
}
