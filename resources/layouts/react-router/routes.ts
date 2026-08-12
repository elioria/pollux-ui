import { index, route, type RouteConfig } from '@react-router/dev/routes';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { polluxRouteDescriptors } from './pollux-routes.mjs';

// Pollux-generated routes (SPEC-005): enumerated from the filesystem so the
// generator never rewrites this handwritten file. With no generated entities
// every list below is empty and the skeleton builds unchanged.
const appDir = path.dirname(fileURLToPath(import.meta.url));
const pollux = polluxRouteDescriptors(appDir);

export default [
  index('routes/home.tsx'),

  // Generated entity CRUD pages: /manager/<plural>[/new|/:id/edit].
  ...pollux.entityPages.flatMap(({ slug }) => [
    route(`manager/${slug}`, `routes/pollux/${slug}/index.tsx`),
    route(`manager/${slug}/new`, `routes/pollux/${slug}/new.tsx`),
    route(`manager/${slug}/:id/edit`, `routes/pollux/${slug}/edit.tsx`),
  ]),

  // Fixed auth endpoints (501 stubs until the SPEC-003 PKCE/BFF phase).
  ...(pollux.hasAuthStub
    ? [route('api/pollux/auth/:action', 'routes/api.pollux.auth.ts')]
    : []),
  // Same-origin API proxy (rejects auth/authz/v1/unknown-entity paths).
  ...(pollux.hasProxy ? [route('api/pollux/*', 'routes/api.pollux.$.ts')] : []),
] satisfies RouteConfig;
