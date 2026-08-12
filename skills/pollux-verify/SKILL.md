---
name: pollux-verify
description: "Verify Pollux work: plugin package conformance, resource and generator drift, target build/test gates, and release readiness. Use when a user asks to check drift, validate the plugin, or prove a Pollux change is safe."
---

# pollux-verify

Verification is layered. Each layer is reported separately; a green layer
never substitutes for another one. A green generator build alone cannot prove
model discovery, and a model trigger eval alone cannot prove safe output.


## Generator resolution

Commands below run from the generator root — resolve it in this order:
1. a start-ui-web checkout the user is working in (full surface);
2. the plugin's bundled snapshot at `${CLAUDE_PLUGIN_ROOT}/generator`
   (standalone surface only — run `pnpm install` there once). From an empty
   folder this is the default; state which root you are using.

## Layers

### 1. Plugin package (neutral)

```bash
node plugins/pollux-ui/scripts/validate-package.mjs
node plugins/pollux-ui/scripts/verify-source-drift.mjs
```

Validates the neutral manifest, catalog schema/hashes, skill frontmatter,
host projection parity, and that packaged bytes match canonical sources.
Failures carry stable codes (`PLUGIN_MANIFEST_INVALID`,
`RESOURCE_CATALOG_INVALID`, `RESOURCE_DRIFT`, `HOST_PROJECTION_INVALID`).

### 2. Native host projections

Rebuild projections and confirm zero drift:

```bash
node plugins/pollux-ui/scripts/build-projections.mjs --check
```

Host validators, when installed, are authoritative: run the current Codex
plugin validator and `claude plugin validate --strict`. Record validator
versions in the evidence.

### 3. Generator gates (reuse, never reimplement)

```bash
./pollux validate
./pollux test --suite=unit
./pollux test --suite=selection
./pollux test --suite=go        # only when go-service/go-entity changed
./pollux check                  # needs clean generated paths
./pollux validate-skeletons
```

### 4. Target matrices (expensive; run what changed resources implicate)

```bash
node scripts/pollux/test/workspace-matrix.mjs --target nextjs
node scripts/pollux/test/workspace-matrix.mjs --target remix
node scripts/pollux/test/workspace-matrix.mjs --target astro
node scripts/pollux/test/workspace-matrix.mjs --target tanstack-start
```

## Steps

1. Inspect changed paths (`git status --porcelain`, or the user's stated
   change) and map them to catalog resource IDs.
2. Select gates by change scope:
   - `plugins/pollux-ui/**` → layers 1–2;
   - `_templates/pollux/**`, `json-files/**` → layer 3 (`validate`,
     `test --suite=unit`, `check`);
   - `_templates/pollux/go-*` → add `test --suite=go`, `test --suite=selection`;
   - `_templates/pollux-targets/**`, `skeletons/**` → layer 3
     (`validate-skeletons`) plus the implicated layer-4 matrix;
   - `skeletons/_shared/design-tokens.css` → `validate-skeletons` and every
     layout-affecting matrix.
3. Run fast structural gates before expensive matrices.
4. Stop at the first failing gate; report the stable error code, the exact
   command, and the implicated resource IDs.

## Output contract

Report each layer as its own line item:

1. **Package** — manifest/catalog/projection validation result and digests.
2. **Hosts** — native validator results with recorded versions, or "not
   installed" (never claim a host passes without running its validator).
3. **Generator** — drift gate and test suite results.
4. **Targets** — matrix results per target actually run.
5. **Verdict** — release readiness means every required layer passed; a
   skipped or warned layer is not a pass.

## What you must not claim

- One passing target does not imply support for other targets.
- One passing model/host test does not imply the other host works.
- A clean plugin snapshot does not prove generated-output drift is clean
  (`./pollux check` is a separate gate).
- Successful build does not prove runtime behavior — runtime smoke belongs
  to the workspace matrices.

## References

- `resources/references/operations/pollux-runbook.md` — generator operations.
- `resources/references/operations/pollux-skeletons-runbook.md` — skeleton
  and matrix operations.
- `resources/catalog.json` — resource-to-verification mapping.
