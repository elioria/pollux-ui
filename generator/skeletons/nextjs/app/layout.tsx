import type { Metadata } from 'next';
import '@fontsource-variable/inter';
import '@fontsource-variable/montserrat';

import './globals.css';

import { Sidebar } from '@/components/sidebar';
import { Topbar } from '@/components/topbar';

export const metadata: Metadata = {
  title: 'Pollux',
  description: 'Painel administrativo do Pollux (esqueleto Next.js)',
};

// Applies the persisted theme before first paint to avoid a flash of the
// wrong color scheme. Falls back to the OS preference when nothing is stored.
const themeInitScript = `
(function () {
  try {
    var stored = localStorage.getItem('theme');
    var dark =
      stored === 'dark' ||
      (stored !== 'light' &&
        window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (dark) document.documentElement.classList.add('dark');
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="antialiased">
        <div className="flex min-h-dvh bg-background text-foreground">
          <Sidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <Topbar title="Dashboard" />
            <main className="flex-1 overflow-y-auto p-6">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
