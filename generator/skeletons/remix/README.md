# Pollux skeleton — Remix (React Router 7) · EXPERIMENTAL generator target

Admin shell for the Pollux multi-skeleton infrastructure, built on React
Router 7 framework mode (Remix's successor): TypeScript, Vite, SSR enabled,
Tailwind CSS v4 via `@tailwindcss/vite`. **Node >= 20 < 25** (see
`engines`/`skeleton.json`), pnpm pinned via `packageManager`.

Status: **EXPERIMENTAL Pollux generator target** (SPEC-005). The skeleton name
stays `remix` as a backward-compatible alias; the generator adapter id is
`react-router` (`scripts/pollux/targets/react-router/adapter.mjs`, capability
level `standalone-crud`). Workspaces created from this skeleton record
`targetStatus: "experimental"` and can be generated into; promotion to
supported happens with the SPEC-007 matrix.

It renders the standard Pollux admin shell — left sidebar (nav + a
"Entidades geradas" section fed by generated fragments) and topbar (title +
dark-mode toggle, class-based `.dark` persisted in `localStorage` with a
no-flash inline script). UI language is Portuguese. Headings use Montserrat
(`font-display`), body text Inter — never serif.

`app/styles/tokens.css` is a verbatim copy of
`skeletons/_shared/design-tokens.css` (the design-system contract);
`./pollux validate-skeletons` fails on drift. Components consume only the
semantic token classes (`bg-card`, `text-muted-foreground`, `border-border`,
`bg-sidebar`, ...).

## Usage

```bash
# create a workspace (from the repo root)
./pollux new-workspace remix --dir=../my-admin

# generate an entity into it
./pollux generate --workspace=../my-admin --entity=<name>

cd ../my-admin
pnpm install --frozen-lockfile
pnpm dev      # dev server (react-router dev)
```

## Verification

Two tiers (SPEC-005 acceptance):

- **Build verification** (no upstream needed):

  ```bash
  pnpm typecheck   # react-router typegen && tsc --noEmit — typegen MUST run first
  pnpm test        # node:test skeleton smoke suite (test/skeleton.test.mjs)
  pnpm build       # production build
  ```

- **Live verification** (against a running v2 API — e.g. the mock server
  `node test-fixtures/pollux/api/mock-server.mjs --port 4311` in this repo):

  ```bash
  POLLUX_API_URL=http://localhost:4311 POLLUX_DEV_BEARER=token-admin pnpm start
  curl -s http://localhost:3000/manager/<plural>              # SSR list page
  curl -s http://localhost:3000/api/pollux/api/generated/v2/<entity>  # proxied v2 list
  ```

## Environment (server-only — see `.env.example`)

| variable | meaning |
| --- | --- |
| `POLLUX_API_URL` | upstream base URL of the Pollux REST service; never exposed to the client |
| `POLLUX_API_TIMEOUT_MS` | proxy timeout in ms (default **10000**, bounded 1..120000) |
| `POLLUX_DEV_BEARER` | DEV-ONLY fallback the proxy forwards ONLY when no BFF access cookie is present |
| `POLLUX_AUTH_URL` / `POLLUX_AUTH_CLIENT_ID` / `POLLUX_AUTH_CLIENT_SECRET` | registered BFF client of the TypeScript authorization host (server-only) |
| `POLLUX_SESSION_SECRET` | server-only secret for the sealed state cookie (HKDF→AES-GCM) and CSRF HMAC |
| `POLLUX_PUBLIC_ORIGIN` | canonical workspace origin: exact callback URL base + required mutation Origin |

None of these may use a `VITE_` prefix. `react-router-serve` does not
auto-load `.env` files — export the variables or use a dotenv wrapper. The
`/api/pollux/auth/{login,callback,refresh,logout}` implement the SPEC-003
PKCE/BFF login topology (see `_templates/pollux-targets/react-router/
README.md` for the flow and its cookie contract); the same-origin proxy
(`app/routes/api.pollux.$.ts`, mounted at `/api/pollux/*`) forwards the
HttpOnly access-cookie bearer, enforcing Origin + `X-CSRF-Token` on
mutations in cookie mode, with `POLLUX_DEV_BEARER` as the DEV-ONLY
fallback.

## Layout

- `app/root.tsx` — admin shell (sidebar + topbar + theme toggle); collects
  generated `app/generated/pollux/nav/*.ts` fragments via `import.meta.glob`
- `app/routes.ts` — handwritten route config; spreads the Pollux route
  descriptors from `app/pollux-routes.mjs` (fs enumeration of
  `app/routes/pollux/<plural>/`) — generation never rewrites this file
- `app/routes/home.tsx` — dashboard placeholder (stat cards)
- `app/app.css` — global stylesheet (`tailwindcss` + tokens)
- `app/styles/tokens.css` — shared design tokens (do not edit here; edit
  `skeletons/_shared/design-tokens.css` and re-copy)
- `test/skeleton.test.mjs` — node:test smoke suite (`pnpm test`)

Generated files (owned by the generator, listed in `.pollux/generated.json`):
`app/routes/pollux/**`, `app/generated/pollux/**`, `app/lib/pollux/**`,
`app/components/pollux/**`, `app/routes/api.pollux.$.ts`,
`app/routes/api.pollux.auth.ts`.
