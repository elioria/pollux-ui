# Pollux skeleton — Astro 5 (EXPERIMENTAL Pollux target `astro-react`)

Self-contained admin-shell boilerplate for the Pollux multi-skeleton
infrastructure: Astro 5 + TypeScript + Tailwind CSS v4 (via `@tailwindcss/vite`),
React islands (`@astrojs/react`), **server output on the Cloudflare adapter**
(`@astrojs/cloudflare`), shipping the shared Pollux design tokens
(`src/styles/tokens.css`, verbatim copy of `skeletons/_shared/design-tokens.css`).

**Generator status: EXPERIMENTAL (SPEC-006).** `generatorSupport.pollux` is
`false`; the skeleton declares `generatorSupport.experimental: true` with target
adapter `astro-react@0.1.0` (capability level `standalone-crud`). Workspaces
created from it get provenance `targetStatus: 'experimental'` — generation is
allowed, promotion to `supported` waits for the SPEC-007 matrix.

- Layout: `src/layouts/Layout.astro` — left sidebar (Pollux brand +
  Dashboard / Entidades / Administração) and topbar with page title and a
  dark-mode toggle (`.dark` on `<html>`, persisted in `localStorage`, flash-free
  via an inline head script). UI language is Portuguese. The sidebar also
  renders the **generated entity registry**: an `import.meta.glob` over
  `src/generated/pollux/nav/*.ts` (empty before the first `pollux generate`).
- Fonts: Montserrat (display/headings) + Inter (body), via Fontsource variable
  packages. Never serif.
- Home: `src/pages/index.astro` — Portuguese dashboard placeholder built on the
  semantic token classes (`bg-card`, `text-muted-foreground`, `border-border`, ...).

## Usage

Create a workspace with the CLI (preferred — records provenance):

```bash
./pollux new-workspace astro --dir ../my-app
cd ../my-app
pnpm install --frozen-lockfile
cp .env.example .env         # then edit the POLLUX_* values
pnpm dev        # http://localhost:4321 (Node runtime, astro dev)
pnpm typecheck  # astro check
pnpm test       # node:test smoke suite
pnpm build      # Cloudflare Workers server build into dist/
pnpm preview
```

## Cloudflare runtime assumptions (SPEC-006)

- `astro build` produces a **server** build for the Cloudflare Workers family
  (`output: 'server'` + `adapter: cloudflare()`); a static-only build cannot
  serve the credential-forwarding proxy and is NOT a supported Pollux target.
- Deploy the `dist/` output with wrangler (the adapter emits
  `dist/_worker.js`); the Worker needs the `nodejs_compat` compatibility flag
  family the adapter's generated wrangler config requests, and a current
  `compatibility_date`.
- Server-only environment (never `PUBLIC_`-prefixed; see `.env.example`):
  - `POLLUX_API_URL` — upstream base URL of the generated Go REST service.
  - `POLLUX_API_TIMEOUT_MS` — proxy timeout, **default 10000 ms** when unset.
  - `POLLUX_DEV_BEARER` — DEV-ONLY fallback bearer, used by the proxy ONLY
    when set AND the request carries no BFF access cookie.
  - `POLLUX_AUTH_URL`, `POLLUX_AUTH_CLIENT_ID`, `POLLUX_AUTH_CLIENT_SECRET`,
    `POLLUX_SESSION_SECRET`, `POLLUX_PUBLIC_ORIGIN` — enable the SPEC-003
    PKCE/BFF login flow at `/api/pollux/auth/*` (sealed state cookie,
    server-to-server code exchange, HttpOnly path-scoped token cookies,
    readable CSRF cookie). All five required; otherwise those endpoints
    answer 503 and the workspace stays in dev-bearer mode.
  On Workers, provide them as bindings/secrets (`wrangler secret put`); the
  generated proxy reads `Astro.locals.runtime.env` there and falls back to
  `import.meta.env` / `process.env` under `astro dev`.
- **JavaScript is required for mutation workflows**: create/edit/delete run in
  a hydrated React island. The server still renders page metadata plus a
  meaningful loading/error shell for direct requests, and unrelated pages ship
  no generated CRUD JavaScript (`client:load` only on the CRUD island).

## Design-system contract

`src/styles/tokens.css` must stay byte-identical to
`skeletons/_shared/design-tokens.css` (`./pollux validate-skeletons` fails on
drift). Components consume only the semantic variables; raw scales stay
internal to the tokens file.
