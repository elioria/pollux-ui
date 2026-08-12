// Versioned parsing + validation for skeletons/registry.json and per-skeleton
// skeleton.json manifests (SPEC-001). Pure module: throws SkeletonError or
// returns problem lists; never exits, never prints.
import fs from 'node:fs';
import path from 'node:path';

import { ERROR_CODES, SkeletonError } from './errors.mjs';

export const REGISTRY_SCHEMA_VERSION = 1;
export const MANIFEST_SCHEMA_VERSION = 1;
export const PROVENANCE_SCHEMA_VERSION = 1;

export const SUPPORTED_PACKAGE_MANAGERS = new Set(['pnpm']);
export const REQUIRED_ENTRYPOINTS = ['layout', 'globalStyles', 'home'];
export const REQUIRED_SCRIPTS = ['dev', 'build'];

const KEBAB_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const isKebabCase = (s) => typeof s === 'string' && KEBAB_RE.test(s);

// npm package name rules (subset of validate-npm-package-name, new-package
// strictness): lowercase, url-safe, optional scope, max 214 chars.
const NPM_NAME_RE =
  /^(?:@[a-z0-9-*~][a-z0-9-*._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;
export const isValidNpmPackageName = (name) =>
  typeof name === 'string' &&
  name.length > 0 &&
  name.length <= 214 &&
  !name.startsWith('.') &&
  !name.startsWith('_') &&
  name === name.trim() &&
  NPM_NAME_RE.test(name);

// "pnpm@10.24.0" -> { name: 'pnpm', version: '10.24.0' }; "pnpm" -> version null
export const parsePackageManagerSpec = (spec) => {
  if (typeof spec !== 'string' || spec.length === 0) return null;
  const at = spec.indexOf('@', 1);
  if (at === -1) return { name: spec, version: null };
  return { name: spec.slice(0, at), version: spec.slice(at + 1) };
};

// A manifest command like "pnpm dev" -> { command: 'pnpm', args: ['dev'] }.
// Commands are plain argv strings — no shell metacharacters or newlines.
export const parseCommand = (str) => {
  if (typeof str !== 'string') return null;
  const trimmed = str.trim();
  if (trimmed.length === 0 || /[\n\r;&|<>$`]/.test(str)) return null;
  const tokens = trimmed.split(/\s+/);
  return { command: tokens[0], args: tokens.slice(1) };
};

const isNonEmptyString = (v) => typeof v === 'string' && v.length > 0;

const hasDotDotSegment = (p) =>
  p.split(/[\\/]/).some((segment) => segment === '..');

const readJsonFile = (file) => {
  if (!fs.existsSync(file)) return { error: `file not found: ${file}` };
  try {
    return { value: JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch (e) {
    return { error: `invalid JSON in ${file}: ${e.message}` };
  }
};

const isWithin = (parent, child) => {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
};

/**
 * Parse and structurally validate skeletons/registry.json.
 * @param {{skeletonsDir: string}} ctx
 * @returns {object} the parsed registry
 * @throws {SkeletonError} REGISTRY_INVALID
 */
export function parseRegistry({ skeletonsDir }) {
  const problems = [];
  const file = path.join(skeletonsDir, 'registry.json');
  const { value: registry, error } = readJsonFile(file);
  if (error) {
    throw new SkeletonError(ERROR_CODES.REGISTRY_INVALID, error, {
      details: { problems: [error] },
      hint: 'skeletons/registry.json must exist and be valid JSON',
    });
  }
  if (registry.schemaVersion !== REGISTRY_SCHEMA_VERSION) {
    problems.push(
      `unknown registry schemaVersion ${JSON.stringify(registry.schemaVersion)} (expected ${REGISTRY_SCHEMA_VERSION})`
    );
  }
  if (!isNonEmptyString(registry.sharedTokens)) {
    problems.push('missing sharedTokens');
  }
  if (!Array.isArray(registry.skeletons) || registry.skeletons.length === 0) {
    problems.push('skeletons must be a non-empty array');
  } else {
    const names = new Set();
    const paths = new Set();
    registry.skeletons.forEach((entry, i) => {
      const label = `skeletons[${i}]`;
      for (const field of ['name', 'path', 'framework', 'status']) {
        if (!isNonEmptyString(entry?.[field]))
          problems.push(`${label}: missing field '${field}'`);
      }
      if (isNonEmptyString(entry?.name)) {
        if (!isKebabCase(entry.name))
          problems.push(`${label}: name '${entry.name}' is not kebab-case`);
        if (names.has(entry.name))
          problems.push(`${label}: duplicate skeleton name '${entry.name}'`);
        names.add(entry.name);
      }
      if (isNonEmptyString(entry?.path)) {
        if (path.isAbsolute(entry.path))
          problems.push(`${label}: path must be relative, got '${entry.path}'`);
        else if (hasDotDotSegment(entry.path))
          problems.push(
            `${label}: path must not contain '..', got '${entry.path}'`
          );
        else {
          const resolved = path.resolve(skeletonsDir, entry.path);
          if (!isWithin(skeletonsDir, resolved) || resolved === skeletonsDir)
            problems.push(
              `${label}: path escapes the skeletons directory: '${entry.path}'`
            );
          if (paths.has(resolved))
            problems.push(`${label}: duplicate skeleton path '${entry.path}'`);
          paths.add(resolved);
          if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory())
            problems.push(
              `${label}: skeleton directory not found: '${entry.path}'`
            );
        }
      }
      if (
        isNonEmptyString(entry?.status) &&
        !['reference', 'boilerplate'].includes(entry.status)
      )
        problems.push(
          `${label}: status must be reference|boilerplate, got '${entry.status}'`
        );
    });
  }
  if (problems.length > 0) {
    throw new SkeletonError(
      ERROR_CODES.REGISTRY_INVALID,
      `skeletons/registry.json is invalid (${problems.length} problem${problems.length === 1 ? '' : 's'})`,
      {
        details: { problems },
        hint: 'fix skeletons/registry.json, then re-run `pollux validate-skeletons`',
      }
    );
  }
  return registry;
}

/**
 * Read one skeleton.json manifest. Returns { manifest } or { error }.
 */
export function readManifest(entry, { skeletonsDir }) {
  const file = path.join(skeletonsDir, entry.path, 'skeleton.json');
  const { value, error } = readJsonFile(file);
  if (error) return { error };
  return { manifest: value };
}

/**
 * Validate one skeleton (manifest + package contract + design-system
 * contract) against its registry entry. Returns a list of problem strings
 * (empty when valid). Never throws for validation findings.
 *
 * @param {object} entry registry entry
 * @param {{skeletonsDir: string, repoRoot: string}} ctx
 */
export function validateSkeleton(entry, { skeletonsDir, repoRoot }) {
  const problems = [];
  const skeletonDir = path.resolve(skeletonsDir, entry.path);
  const { manifest, error } = readManifest(entry, { skeletonsDir });
  if (error) return [error];

  if (manifest.schemaVersion !== MANIFEST_SCHEMA_VERSION)
    problems.push(
      `unknown manifest schemaVersion ${JSON.stringify(manifest.schemaVersion)} (expected ${MANIFEST_SCHEMA_VERSION})`
    );
  if (!isNonEmptyString(manifest.version))
    problems.push(`missing field 'version'`);

  // Identity and registry/manifest agreement.
  if (manifest.name !== entry.name)
    problems.push(
      `manifest name '${manifest.name}' != registry entry '${entry.name}'`
    );
  if (isNonEmptyString(manifest.name) && !isKebabCase(manifest.name))
    problems.push(`name '${manifest.name}' is not kebab-case`);
  if (manifest.framework !== entry.framework)
    problems.push(
      `manifest framework '${manifest.framework}' != registry framework '${entry.framework}'`
    );
  if (manifest.status !== entry.status)
    problems.push(
      `manifest status '${manifest.status}' != registry status '${entry.status}'`
    );
  for (const field of ['displayName', 'framework', 'language', 'status'])
    if (!isNonEmptyString(manifest[field]))
      problems.push(`missing field '${field}'`);
  if (!['reference', 'boilerplate'].includes(manifest.status))
    problems.push(
      `status must be reference|boilerplate, got '${manifest.status}'`
    );

  // Root containment contract.
  let appRoot = null;
  if (!isNonEmptyString(manifest.root)) {
    problems.push(`missing field 'root'`);
  } else if (path.isAbsolute(manifest.root)) {
    problems.push(`root must be relative, got '${manifest.root}'`);
  } else {
    appRoot = path.resolve(skeletonDir, manifest.root);
    if (manifest.status === 'boilerplate') {
      if ('referenceRoot' in manifest)
        problems.push(`referenceRoot is only allowed on 'reference' skeletons`);
      if (hasDotDotSegment(manifest.root))
        problems.push(
          `boilerplate root must not contain '..', got '${manifest.root}'`
        );
      if (!isWithin(skeletonDir, appRoot))
        problems.push(
          `boilerplate root escapes the skeleton directory: '${manifest.root}'`
        );
      if (appRoot === path.resolve(repoRoot))
        problems.push(
          `boilerplate root must not resolve to the repository root`
        );
    } else if (manifest.status === 'reference') {
      // Reference skeletons live elsewhere; they must pin the external root
      // via an explicit referenceRoot contract instead of containment.
      if (!isNonEmptyString(manifest.referenceRoot)) {
        problems.push(
          `reference skeleton must declare an explicit 'referenceRoot' contract`
        );
      } else if (
        appRoot !== path.resolve(skeletonDir, manifest.referenceRoot)
      ) {
        problems.push(
          `root '${manifest.root}' does not match declared referenceRoot '${manifest.referenceRoot}'`
        );
      }
    }
  }

  // Package manager.
  const pmSpec = parsePackageManagerSpec(manifest.packageManager);
  if (!pmSpec) {
    problems.push(`missing field 'packageManager'`);
  } else if (!SUPPORTED_PACKAGE_MANAGERS.has(pmSpec.name)) {
    problems.push(
      `unsupported package manager '${pmSpec.name}' (supported: ${[...SUPPORTED_PACKAGE_MANAGERS].join(', ')})`
    );
  } else if (manifest.status === 'boilerplate' && !pmSpec.version) {
    problems.push(
      `boilerplate packageManager must pin a version (e.g. 'pnpm@10.24.0'), got '${manifest.packageManager}'`
    );
  }

  // Commands.
  if (!manifest.commands || typeof manifest.commands !== 'object') {
    problems.push('missing commands.dev/build');
  } else {
    for (const key of REQUIRED_SCRIPTS) {
      const raw = manifest.commands[key];
      if (!isNonEmptyString(raw)) problems.push(`missing commands.${key}`);
      else if (!parseCommand(raw))
        problems.push(`malformed commands.${key}: ${JSON.stringify(raw)}`);
    }
    for (const [key, raw] of Object.entries(manifest.commands))
      if (isNonEmptyString(raw) && !parseCommand(raw))
        problems.push(`malformed commands.${key}: ${JSON.stringify(raw)}`);
  }

  // Entrypoints (existence + file-ness + symlink containment).
  for (const field of REQUIRED_ENTRYPOINTS)
    if (!isNonEmptyString(manifest.entrypoints?.[field]))
      problems.push(`missing entrypoints.${field}`);
  if (appRoot !== null && manifest.entrypoints) {
    for (const [field, rel] of Object.entries(manifest.entrypoints)) {
      if (!isNonEmptyString(rel)) continue;
      if (path.isAbsolute(rel)) {
        problems.push(`entrypoints.${field} must be relative: ${rel}`);
        continue;
      }
      if (hasDotDotSegment(rel)) {
        problems.push(`entrypoints.${field} must not contain '..': ${rel}`);
        continue;
      }
      const abs = path.join(appRoot, rel);
      if (!fs.existsSync(abs)) {
        problems.push(`entrypoints.${field} not found: ${rel}`);
        continue;
      }
      if (REQUIRED_ENTRYPOINTS.includes(field) && !fs.statSync(abs).isFile()) {
        problems.push(`entrypoints.${field} is not a file: ${rel}`);
        continue;
      }
      const real = fs.realpathSync(abs);
      const realRoot = fs.realpathSync(appRoot);
      if (!isWithin(realRoot, real))
        problems.push(
          `entrypoints.${field} escapes the skeleton root via symlink: ${rel}`
        );
    }
  }

  // package.json contract.
  if (appRoot !== null) {
    const pkgFile = path.join(appRoot, 'package.json');
    const { value: pkg, error: pkgError } = readJsonFile(pkgFile);
    if (pkgError) {
      problems.push(`missing or invalid package.json at root: ${pkgError}`);
    } else {
      if (!isValidNpmPackageName(pkg.name))
        problems.push(
          `package.json name is not a valid npm package name: ${JSON.stringify(pkg.name)}`
        );
      for (const script of REQUIRED_SCRIPTS)
        if (!isNonEmptyString(pkg.scripts?.[script]))
          problems.push(`package.json missing required script '${script}'`);
      if (manifest.status === 'boilerplate' && pmSpec?.version) {
        if (pkg.packageManager !== manifest.packageManager)
          problems.push(
            `package.json packageManager ${JSON.stringify(pkg.packageManager)} != manifest packageManager '${manifest.packageManager}'`
          );
      }
    }
  }

  // Design-system contract.
  const ds = manifest.designSystem;
  if (!ds || typeof ds !== 'object') {
    problems.push('missing designSystem');
  } else {
    if (!isNonEmptyString(ds.tokens))
      problems.push('missing designSystem.tokens');
    for (const field of ['display', 'body'])
      if (!isNonEmptyString(ds[field]))
        problems.push(`missing designSystem.${field}`);
    if (typeof ds.tailwind !== 'number')
      problems.push('designSystem.tailwind must be a number (major version)');
    if (
      isNonEmptyString(ds.display) &&
      /serif|georgia|fraunces|times/i.test(ds.display) &&
      !/sans/i.test(ds.display)
    )
      problems.push(
        `designSystem.display '${ds.display}' looks like a serif font (serif fonts are forbidden)`
      );
    if (
      manifest.status === 'boilerplate' &&
      appRoot !== null &&
      isNonEmptyString(ds.tokens)
    ) {
      const shared = path.join(skeletonsDir, '_shared/design-tokens.css');
      const local = path.join(appRoot, ds.tokens);
      if (!fs.existsSync(local)) {
        problems.push(`designSystem.tokens not found: ${ds.tokens}`);
      } else if (
        fs.existsSync(shared) &&
        fs.readFileSync(local, 'utf8') !== fs.readFileSync(shared, 'utf8')
      ) {
        problems.push(
          'designSystem.tokens drifted from _shared/design-tokens.css'
        );
      }
      // The global stylesheet must actually import the tokens file.
      const globalRel = manifest.entrypoints?.globalStyles;
      if (isNonEmptyString(globalRel)) {
        const globalAbs = path.join(appRoot, globalRel);
        if (fs.existsSync(globalAbs) && fs.existsSync(local)) {
          const css = fs.readFileSync(globalAbs, 'utf8');
          const tokensBase = path.basename(ds.tokens);
          const imported = new RegExp(
            `@import\\s+['"][^'"]*${tokensBase.replace(/\./g, '\\.')}['"]`
          ).test(css);
          if (!imported && path.resolve(globalAbs) !== path.resolve(local))
            problems.push(
              `globalStyles '${globalRel}' does not @import designSystem.tokens '${ds.tokens}'`
            );
        }
      }
    }
  }

  // Generator support contract.
  const gen = manifest.generatorSupport;
  if (!gen || typeof gen !== 'object' || typeof gen.pollux !== 'boolean') {
    problems.push('missing generatorSupport.pollux (boolean)');
  } else if (gen.pollux === true || gen.experimental === true) {
    // 'experimental' (SPEC-007 pre-promotion) needs the same declared adapter
    // identity as full support; placeholder identities are forbidden.
    if (
      !gen.targetAdapter ||
      !isNonEmptyString(gen.targetAdapter.id) ||
      !isNonEmptyString(gen.targetAdapter.capabilityLevel)
    )
      problems.push(
        `generatorSupport.${gen.pollux === true ? 'pollux' : 'experimental'} is true but no targetAdapter {id, capabilityLevel} is declared`
      );
    if (gen.pollux === true && gen.experimental === true)
      problems.push(
        'generatorSupport.pollux and generatorSupport.experimental are mutually exclusive'
      );
  }

  return problems;
}
