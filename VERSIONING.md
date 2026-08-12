# pollux-ui versioning, release stages, and governance

Implements SPEC-007. This package versions independently from the Pollux
generator and from host tooling.

## Versioned surfaces

| Surface | Field | Bump rule |
| --- | --- | --- |
| Neutral manifest schema | `pollux.plugin.json schemaVersion` | structural change = new schema version |
| Plugin release | `pollux.plugin.json version` | semver (below) |
| Resource catalog | `compatibility.resourceCatalog` | resource ID/hash contract change = major/minor |
| Skill contract | `compatibility.skillContract` | breaking skill inputs/outputs = major |
| Host projections | `compatibility.hosts.{codex,claudeCode}` | explicit ranges, gated by native validators |
| Pollux CLI / metadata model | `compatibility.{polluxCli,metadataModel}` | recorded, never inferred |

Semver rules: breaking skill inputs/outputs, resource IDs, safety behavior, or
manifest schema → **major**. New optional capability or target → **minor**.
Reference correction without behavior/resource change → **patch**.

## Release stages

1. **Schema preview** — neutral manifest, catalog, and builders validate
   locally; no host support claim.
2. **Host preview** — both native manifests load; all five skills explicitly
   invokable; implicit triggers remain experimental.
3. **Workflow preview** — trigger and temporary-workspace matrices pass for
   read-only inspection, supported start-ui-vite workflows, and package drift.
4. **Cross-model experimental** — Codex and Claude pass full declared
   matrices; package remains repo-local and unpublished. ← *current stage*
5. **Supported local release** — versioned artifact, rollback instructions,
   required CI gate, verified installation in both hosts.
6. **Marketplace candidate** — separate approval and publication SPEC; not
   implied by local support.

Experimental Next.js, React Router, and Astro generator targets stay labeled
experimental inside the plugin until their skeleton manifests and CI promote
them. A plugin release cannot promote application targets.

## Release

```bash
node plugins/pollux-ui/scripts/build-release.mjs
node plugins/pollux-ui/scripts/build-release.mjs --evidence-dir=<dir>
```

Refuses dirty canonical sources (`SOURCE_DIRTY`), rebuilds
manifest/resources/projections deterministically, runs package validation,
writes `release.json` (hashes, versions, source revision, builder versions,
support matrix), and emits `dist/pollux-ui-<version>.tar.gz` (byte
reproducible). Archived `builtAt` values use `SOURCE_DATE_EPOCH` when supplied,
otherwise the source commit timestamp; wall-clock time never changes archive
bytes. Two unrelated clean paths must produce the same SHA-256.

Without an evidence directory, the release builder records only Stage-1
neutral checks and marks host evaluations `not-run`. With all four current,
digest-matching evaluator reports (`codex|claude` × `trigger|workflow`), it
records Stage 4. Missing, stale, partial, below-threshold, or wrong-adapter
evidence fails with `VERIFICATION_FAILED`. Stage 5 additionally requires a
prior artifact and native install/rollback proof; evidence files cannot promote
it automatically.

Do not ship: source-checkout absolute paths, dirty-source releases, secrets,
`node_modules`, build caches, generated application output.

## Rollback

- Retain the prior `dist/pollux-ui-<version>.tar.gz` and its `release.json`.
- Roll back by reinstalling the exact prior archive; never edit an installed
  plugin cache in place.
- A plugin rollback never rewrites user workspaces or generated app output.
- If one host projection regresses, demote that host in release metadata only
  when the remaining host remains fully proven.

## Governance

- Canonical templates/layouts remain owned by `_templates/`, `skeletons/`,
  `src/layout/`; packaged resources are rebuilt snapshots, never edited.
- Resource snapshot changes require source-path and digest review.
- Skill behavior changes require trigger-eval review in both hosts.
- Host manifest changes require native validator evidence.
- New host support requires its own projection, validator, discovery tests,
  workflow matrix, and release status — shared SKILL.md compatibility alone
  is insufficient.
- MCP is added only for a proven live-data, authentication, controlled-action,
  or observability need; it must not reimplement local generator behavior.
