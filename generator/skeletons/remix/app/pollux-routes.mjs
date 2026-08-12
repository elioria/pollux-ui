// Handwritten aggregator for Pollux-generated route modules (SPEC-005).
//
// The Pollux generator emits per-entity route modules under
// `app/routes/pollux/<plural>/{index,new,edit}.tsx` plus shared resource
// routes (same-origin proxy + auth stubs). This module enumerates them from
// the filesystem so `app/routes.ts` can register them deterministically —
// there is no generated aggregate registry file, and regeneration therefore
// never touches the handwritten route config or navigation.
//
// Plain JS (not TS) so the skeleton's node:test suite can exercise it
// directly without a TypeScript loader. Runs only at route-config time
// (@react-router/dev evaluates app/routes.ts in Node).
import fs from 'node:fs';
import path from 'node:path';

const ENTITY_ROUTE_FILES = ['index.tsx', 'new.tsx', 'edit.tsx'];

/**
 * Describe the Pollux-generated route surface under an app directory.
 * Deterministic: entity slugs are sorted by UTF-16 code units.
 *
 * @param {string} appDir absolute path of the `app/` directory
 * @returns {{entityPages: {slug: string}[], hasProxy: boolean,
 *   hasAuthStub: boolean}}
 */
export function polluxRouteDescriptors(appDir) {
  const routesDir = path.join(appDir, 'routes');
  const polluxDir = path.join(routesDir, 'pollux');
  const entityPages = [];
  if (fs.existsSync(polluxDir)) {
    const slugs = fs
      .readdirSync(polluxDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    for (const slug of slugs) {
      const complete = ENTITY_ROUTE_FILES.every((file) =>
        fs.existsSync(path.join(polluxDir, slug, file))
      );
      if (complete) entityPages.push({ slug });
    }
  }
  return {
    entityPages,
    hasProxy: fs.existsSync(path.join(routesDir, 'api.pollux.$.ts')),
    hasAuthStub: fs.existsSync(path.join(routesDir, 'api.pollux.auth.ts')),
  };
}
