// Type declarations for app/pollux-routes.mjs (kept as plain JS so the
// skeleton's node:test suite can import it without a TypeScript loader).
export function polluxRouteDescriptors(appDir: string): {
  entityPages: { slug: string }[];
  hasProxy: boolean;
  hasAuthStub: boolean;
};
