// SPEC-008 — isomorphic proxy base URL for TanStack Start.
//
// Route loaders run on the server during SSR and on the client during
// navigation. The same-origin proxy (/api/pollux) therefore needs an
// absolute origin on both sides:
//   - browser: window.location.origin;
//   - SSR: POLLUX_PUBLIC_ORIGIN when configured, else the loopback address
//     of this server process (PORT env, `pnpm start` honors it). The
//     process.env reads live inside the server-only branch — no VITE_
//     variable is ever involved, so no value can reach client output.
//
// Known limitation (documented in the skeleton README): SSR data fetch is a
// loopback self-fetch and authenticates only in dev-bearer mode — HttpOnly
// access cookies are browser-held, so cookie-mode sessions render
// client-side.
export const polluxBaseUrl = (): string => {
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/api/pollux`;
  }
  const configured = process.env.POLLUX_PUBLIC_ORIGIN;
  if (typeof configured === 'string' && configured.length > 0) {
    return `${configured.replace(/\/+$/, '')}/api/pollux`;
  }
  const port = process.env.PORT ?? '3000';
  return `http://127.0.0.1:${port}/api/pollux`;
};
