// Skeleton discovery on top of schema.mjs (SPEC-001). Pure module: returns
// values or throws SkeletonError; never exits, never prints.
import path from 'node:path';

import { ERROR_CODES, SkeletonError } from './errors.mjs';
import { parseRegistry, readManifest, validateSkeleton } from './schema.mjs';

/** Build the context object the schema functions need. */
export const skeletonContext = (repoRoot) => ({
  repoRoot: path.resolve(repoRoot),
  skeletonsDir: path.join(path.resolve(repoRoot), 'skeletons'),
});

/**
 * Load and structurally validate the registry.
 * @throws {SkeletonError} REGISTRY_INVALID
 */
export function loadRegistry(ctx) {
  return parseRegistry(ctx);
}

/**
 * Find one registry entry by name.
 * @throws {SkeletonError} SKELETON_UNKNOWN
 */
export function getSkeletonEntry(registry, name) {
  const entry = registry.skeletons.find((s) => s.name === name);
  if (!entry) {
    const known = registry.skeletons.map((s) => s.name).join(', ');
    throw new SkeletonError(
      ERROR_CODES.SKELETON_UNKNOWN,
      `unknown skeleton '${name}'`,
      {
        details: {
          skeleton: name,
          known: registry.skeletons.map((s) => s.name),
        },
        hint: `known skeletons: ${known} — run \`pollux list-skeletons\``,
      }
    );
  }
  return entry;
}

/**
 * Read a manifest for a known entry.
 * @throws {SkeletonError} MANIFEST_INVALID
 */
export function getManifest(entry, ctx) {
  const { manifest, error } = readManifest(entry, ctx);
  if (error) {
    throw new SkeletonError(ERROR_CODES.MANIFEST_INVALID, error, {
      details: { skeleton: entry.name, problems: [error] },
      hint: `fix skeletons/${entry.path}/skeleton.json`,
    });
  }
  return manifest;
}

/**
 * Fully validate one skeleton; throws MANIFEST_INVALID when it has problems.
 * @returns {object} the manifest, when valid
 */
export function requireValidSkeleton(entry, ctx) {
  const problems = validateSkeleton(entry, ctx);
  if (problems.length > 0) {
    throw new SkeletonError(
      ERROR_CODES.MANIFEST_INVALID,
      `skeleton '${entry.name}' fails validation (${problems.length} problem${problems.length === 1 ? '' : 's'})`,
      {
        details: { skeleton: entry.name, problems },
        hint: `run \`pollux validate-skeletons\` for the full report`,
      }
    );
  }
  return getManifest(entry, ctx);
}

/**
 * Validate every registered skeleton.
 * @returns {{ok: boolean, results: {name: string, problems: string[]}[]}}
 */
export function validateAllSkeletons(ctx) {
  const registry = loadRegistry(ctx);
  const results = registry.skeletons.map((entry) => ({
    name: entry.name,
    problems: validateSkeleton(entry, ctx),
  }));
  return { ok: results.every((r) => r.problems.length === 0), results };
}

/**
 * List skeletons with summary rows (registry + manifest merge).
 */
export function listSkeletons(ctx) {
  const registry = loadRegistry(ctx);
  return registry.skeletons.map((entry) => {
    const { manifest } = readManifest(entry, ctx);
    return {
      name: entry.name,
      framework: entry.framework,
      status: entry.status,
      displayName: manifest?.displayName ?? null,
      pollux: manifest?.generatorSupport?.pollux ?? false,
    };
  });
}
