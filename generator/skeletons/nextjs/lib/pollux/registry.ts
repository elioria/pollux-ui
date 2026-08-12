// Handwritten Pollux registry reader (part of the skeleton shell — NOT a
// generated file). The Pollux Next.js adapter (SPEC-004) writes one JSON
// fragment per generated entity under `lib/pollux/registry/<entity>.json`;
// this module aggregates them at request time on the server. Regeneration
// replaces only the per-entity fragments — this file and every component
// importing it stay handwritten and untouched.
//
// Server-only: reads the filesystem; importing it from a Client Component is
// a build error by design.
import fs from 'node:fs';
import path from 'node:path';
import 'server-only';

export type PolluxRegistryEntry = {
  /** Entity code (safe identifier), e.g. 'amostra'. */
  entity: string;
  /** Route plural slug, e.g. 'amostras'. */
  plural: string;
  /** Portuguese list title from the entity metadata. */
  label: string;
  /** Local list route, e.g. '/manager/amostras'. */
  href: string;
  /** Exhaustive allowlist of list query-string keys for the API proxy. */
  queryKeys: string[];
};

const REGISTRY_DIR = path.join(process.cwd(), 'lib', 'pollux', 'registry');

const isEntry = (value: unknown): value is PolluxRegistryEntry => {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.entity === 'string' &&
    /^[a-z][a-z0-9_]*$/.test(v.entity) &&
    typeof v.plural === 'string' &&
    typeof v.label === 'string' &&
    typeof v.href === 'string' &&
    v.href.startsWith('/') &&
    Array.isArray(v.queryKeys) &&
    v.queryKeys.every((k) => typeof k === 'string')
  );
};

/**
 * Read every generated registry fragment, sorted by file name so the result
 * is deterministic. An absent directory (fresh workspace, nothing generated
 * yet) yields an empty registry; malformed fragments are ignored.
 */
export function readPolluxRegistry(): PolluxRegistryEntry[] {
  let files: string[] = [];
  try {
    files = fs.readdirSync(REGISTRY_DIR).filter((f) => f.endsWith('.json'));
  } catch {
    return [];
  }
  const entries: PolluxRegistryEntry[] = [];
  for (const file of files.sort()) {
    try {
      const parsed: unknown = JSON.parse(
        fs.readFileSync(path.join(REGISTRY_DIR, file), 'utf8')
      );
      if (isEntry(parsed)) entries.push(parsed);
    } catch {
      // Malformed fragment: skip (regenerating the entity rewrites it).
    }
  }
  return entries;
}

/** Lookup one registry entry by entity code (used by the API proxy). */
export function findPolluxRegistryEntry(
  entity: string
): PolluxRegistryEntry | undefined {
  return readPolluxRegistry().find((entry) => entry.entity === entity);
}
