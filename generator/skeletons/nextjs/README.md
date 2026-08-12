# Pollux skeleton — Next.js App Router

Self-contained Next.js 15 (App Router) + TypeScript + Tailwind CSS v4
boilerplate carrying the shared Pollux design system
(`skeletons/_shared/design-tokens.css`, copied verbatim to `app/tokens.css`).

Admin shell in Portuguese: left sidebar (Pollux brand + nav Dashboard /
Entidades / Administração) and topbar with a dark-mode toggle (`.dark` class on
`<html>`, persisted in `localStorage`, flash-free via an inline head script).
Headings use Montserrat (`font-display`), body uses Inter — never serif.

## Pollux generator status: EXPERIMENTAL (SPEC-004)

This skeleton is an **experimental** Pollux generator target
(`generatorSupport.experimental: true`, adapter `nextjs@0.1.0`, capability
level `standalone-crud`, model version `1`). Generation works end-to-end, but
the target is not promoted to full support (`pollux: true`) until the SPEC-007
CI matrix is green.

```bash
./pollux new-workspace nextjs --dir /path/to/my-app
cd /path/to/my-app && pnpm install --frozen-lockfile
./pollux generate --workspace /path/to/my-app --entity <entity>
```

Generation adds, per entity: list/create/edit routes under
`app/(pollux)/manager/<plural>/`, an entity spec under
`lib/pollux/entities/<entity>/`, and a sidebar registry fragment under
`lib/pollux/registry/<entity>.json`. Workspace-level files added on first
generation: the shared SPEC-003 runtime (`lib/pollux/runtime/`), shared UI
(`components/pollux/`), the server API proxy
(`app/api/pollux/[...path]/route.ts`) and the fixed BFF auth endpoints
(`app/api/pollux/auth/...`). All generated files carry `@pollux-generated`
ownership headers and are tracked in `.pollux/generated.json` — edit
handwritten files freely; regeneration never overwrites files it does not own.

The handwritten sidebar (`components/sidebar.tsx` → `components/pollux-nav.tsx`)
renders generated navigation by reading the per-entity registry fragments via
`lib/pollux/registry.ts`; regeneration replaces only the fragments, never the
shell.

## Environment variables (server-only, SPEC-003)

Copy `.env.example` to `.env` — see the comments there. No variable uses a
public prefix; values are read only by the server proxy and Server Components.

- `POLLUX_API_URL` — upstream base URL of the Pollux standalone API v2
  (required at runtime; the UI renders a safe "service unavailable" state
  without it).
- `POLLUX_API_TIMEOUT_MS` — upstream timeout, default **10000** ms
  (bounded 1000..60000).
- `POLLUX_DEV_BEARER` — DEV-ONLY fallback bearer forwarded upstream by the
  proxy ONLY when set AND the request carries no BFF access cookie. The
  `app/api/pollux/auth/*` routes implement the SPEC-003 PKCE/BFF login flow
  when `POLLUX_AUTH_URL`, `POLLUX_AUTH_CLIENT_ID`,
  `POLLUX_AUTH_CLIENT_SECRET`, `POLLUX_SESSION_SECRET` and
  `POLLUX_PUBLIC_ORIGIN` are configured (503 otherwise). Never
  commit a real token.

## Build verification vs live API verification

- **Build (offline):** `pnpm install --frozen-lockfile && pnpm typecheck &&
  pnpm test && pnpm build` must pass with **no** environment variables and no
  running API — generated pages are dynamic and fetch only at request time.
- **Live API:** start the contract fixture
  (`node test-fixtures/pollux/api/mock-server.mjs --port 4310` from the main
  repository) and run `POLLUX_API_URL=http://localhost:4310
  POLLUX_DEV_BEARER=token-admin pnpm start`. The generated list route
  (`/manager/<plural>`) server-renders live data and
  `/api/pollux/generated/v2/<entity>` proxies the v2 contract with the
  bearer injected server-side.

## Usage (plain skeleton, no generator)

```bash
./pollux new-workspace nextjs --dir /path/to/my-app   # preferred (records provenance)
cd /path/to/my-app
pnpm install --frozen-lockfile
pnpm dev        # http://localhost:3000
```

Other scripts: `pnpm build`, `pnpm start`, `pnpm typecheck`, `pnpm lint`
(typecheck-based — `next lint` was deprecated by Next.js and is not used),
`pnpm test` (node:test workspace smoke tests).

## Layout of interest

- `app/layout.tsx` — root layout: fonts, theme init script, admin shell.
- `app/page.tsx` — dashboard placeholder (stat cards, semantic token classes).
- `app/globals.css` — `@import 'tailwindcss'` + tokens import.
- `app/tokens.css` — verbatim copy of the shared design tokens. Do not edit
  here; change `skeletons/_shared/design-tokens.css` and re-copy.
- `components/sidebar.tsx`, `components/topbar.tsx` — shell pieces.
- `components/pollux-nav.tsx`, `lib/pollux/registry.ts` — handwritten hosts
  for the generated navigation registry fragments.
- `test/workspace.test.mjs` — adapter-agnostic workspace smoke tests.
