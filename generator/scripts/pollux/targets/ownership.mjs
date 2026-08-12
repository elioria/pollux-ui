// SPEC-002 — generated-file ownership: machine-readable headers per file
// format plus the workspace-level `.pollux/generated.json` ownership record.
// Pure module: returns values or throws SkeletonError; never exits or prints.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { ERROR_CODES, SkeletonError } from './errors.mjs';

/** Workspace-relative path of the ownership/commit record. */
export const GENERATED_MANIFEST_PATH = '.pollux/generated.json';

/** Marker every ownership header carries (machine-greppable). */
export const OWNERSHIP_MARK = '@pollux-generated';

export const sha256 = (buf) =>
  crypto.createHash('sha256').update(buf).digest('hex');

/** Locale-free UTF-16 code-unit comparison (never localeCompare). */
const byCodeUnit = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Ownership recording style for a file, by extension.
 * - 'block'    js/ts/tsx/jsx/mjs/cjs and css: leading block comment
 * - 'astro'    astro: comment line inside the frontmatter fence
 * - 'manifest' json (comments unsupported) and unknown formats: recorded
 *              only in `.pollux/generated.json`
 */
export function ownershipStyleFor(relPath) {
  const ext = path.extname(relPath).toLowerCase();
  if (['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.css'].includes(ext)) {
    return 'block';
  }
  if (ext === '.astro') return 'astro';
  return 'manifest';
}

/**
 * The single machine-readable header line. Key order is fixed by literal
 * construction, so the header is deterministic for identical metadata.
 */
export function ownershipHeaderLine({
  target,
  entity,
  generatorVersion,
  modelVersion,
}) {
  const record = JSON.stringify({
    target,
    entity,
    generatorVersion,
    modelVersion,
  });
  return `${OWNERSHIP_MARK} ${record} — do not edit; regenerate with \`pollux generate\``;
}

/**
 * Stamp the ownership header onto generated content where the file format
 * permits it. JSON (and unknown formats) cannot carry comments — those files
 * are recorded only in the generated manifest.
 *
 * @param {string} relPath workspace-relative output path
 * @param {string} content raw generated content
 * @param {{target: string, entity: string, generatorVersion: string,
 *          modelVersion: string}} meta
 * @returns {{content: string, ownership: 'header'|'manifest-only'}}
 */
export function applyOwnershipHeader(relPath, content, meta) {
  const style = ownershipStyleFor(relPath);
  const line = ownershipHeaderLine(meta);
  if (style === 'block') {
    return { content: `/* ${line} */\n${content}`, ownership: 'header' };
  }
  if (style === 'astro') {
    // Astro carries the header as a comment inside the frontmatter fence.
    if (content.startsWith('---\n')) {
      return {
        content: `---\n// ${line}\n${content.slice(4)}`,
        ownership: 'header',
      };
    }
    return { content: `---\n// ${line}\n---\n${content}`, ownership: 'header' };
  }
  return { content, ownership: 'manifest-only' };
}

/** True when content carries an ownership header. */
export const hasOwnershipHeader = (content) =>
  String(content).slice(0, 2000).includes(OWNERSHIP_MARK);

const isPlainObject = (v) =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Read and structurally validate `.pollux/generated.json`. Returns null when
 * the workspace has no generated record yet.
 * @throws {SkeletonError} MANIFEST_INVALID on unparsable/misshapen records
 */
export function readGeneratedManifest(workspace) {
  const file = path.join(workspace, GENERATED_MANIFEST_PATH);
  if (!fs.existsSync(file)) return null;
  let record;
  try {
    record = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    throw new SkeletonError(
      ERROR_CODES.MANIFEST_INVALID,
      `${GENERATED_MANIFEST_PATH} is not valid JSON: ${err.message}`,
      { details: { file } }
    );
  }
  const problems = [];
  if (!isPlainObject(record)) problems.push('record is not an object');
  else {
    for (const key of ['target', 'generatorVersion', 'modelVersion']) {
      if (typeof record[key] !== 'string' || !record[key]) {
        problems.push(`${key} must be a non-empty string`);
      }
    }
    if (!isPlainObject(record.entities)) {
      problems.push('entities must be an object');
    } else {
      for (const [name, entry] of Object.entries(record.entities)) {
        if (
          !isPlainObject(entry) ||
          !Array.isArray(entry.ownedPaths) ||
          !isPlainObject(entry.hashes)
        ) {
          problems.push(`entities.${name} must carry ownedPaths[] and hashes`);
        }
      }
    }
  }
  if (problems.length > 0) {
    throw new SkeletonError(
      ERROR_CODES.MANIFEST_INVALID,
      `${GENERATED_MANIFEST_PATH} fails validation (${problems.length} problem${problems.length === 1 ? '' : 's'})`,
      { details: { file, problems } }
    );
  }
  return record;
}

/**
 * Merge one entity's generation result into the (possibly null) previous
 * record. Entities and paths are sorted so the record is deterministic.
 *
 * @param {object|null} previous previous generated manifest
 * @param {{target: string, generatorVersion: string, modelVersion: string,
 *          entity: string, files: {path: string, hash: string}[]}} result
 */
export function mergeGeneratedManifest(previous, result) {
  const entities = { ...previous?.entities };
  const sortedFiles = [...result.files].sort((a, b) =>
    byCodeUnit(a.path, b.path)
  );
  entities[result.entity] = {
    ownedPaths: sortedFiles.map((f) => f.path),
    hashes: Object.fromEntries(sortedFiles.map((f) => [f.path, f.hash])),
  };
  const ordered = {};
  for (const name of Object.keys(entities).sort(byCodeUnit)) {
    ordered[name] = entities[name];
  }
  return {
    target: result.target,
    generatorVersion: result.generatorVersion,
    modelVersion: result.modelVersion,
    entities: ordered,
  };
}

/** Canonical serialization of a generated manifest (stable bytes). */
export const serializeGeneratedManifest = (record) =>
  JSON.stringify(record, null, 2) + '\n';

/**
 * Which entity owns a workspace-relative path, or null when non-owned.
 */
export function ownerOfPath(manifest, relPath) {
  if (!manifest) return null;
  for (const [entity, entry] of Object.entries(manifest.entities)) {
    if (entry.ownedPaths.includes(relPath)) return entity;
  }
  return null;
}

/**
 * Compare every recorded owned file against its recorded content hash.
 * Missing files are reported as 'missing' (recreatable, not an edit);
 * hash mismatches are 'edited' (hand-modified generated file).
 *
 * @returns {{edited: Array<{entity: string, path: string, expectedHash:
 *   string, actualHash: string}>, missing: Array<{entity: string,
 *   path: string}>}}
 */
export function detectEditedOwnedFiles(workspace, manifest) {
  const edited = [];
  const missing = [];
  if (!manifest) return { edited, missing };
  for (const [entity, entry] of Object.entries(manifest.entities)) {
    for (const relPath of entry.ownedPaths) {
      const abs = path.join(workspace, relPath);
      if (!fs.existsSync(abs)) {
        missing.push({ entity, path: relPath });
        continue;
      }
      const actualHash = sha256(fs.readFileSync(abs));
      const expectedHash = entry.hashes[relPath];
      if (actualHash !== expectedHash) {
        edited.push({ entity, path: relPath, expectedHash, actualHash });
      }
    }
  }
  return { edited, missing };
}
