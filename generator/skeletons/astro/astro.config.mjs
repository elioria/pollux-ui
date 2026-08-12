// @ts-check
import cloudflare from '@astrojs/cloudflare';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';

// SPEC-006: SERVER output on the Cloudflare Workers family. The generated
// same-origin API proxy (src/pages/api/pollux/[...path].ts) forwards the
// Pollux bearer credential server-side, so a purely static build is NOT a
// supported Pollux target — `astro build` must produce the Worker build.
// Local development stays `astro dev` (Node runtime; Astro.locals.runtime is
// absent there and the proxy falls back to process/import.meta env).
export default defineConfig({
  output: 'server',
  adapter: cloudflare(),
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
  },
});
