# pollux-ui — cross-model Pollux plugin

One neutral package exposing Pollux templates, layouts, design tokens,
generator knowledge, and verification workflows to Codex and Claude through
native plugin manifests and shared Agent Skills. Canonical sources stay in the
repository; this package carries reproducible, hash-addressed snapshots.

Specs: `docs/specs/ai-plugins/README.md` (SPEC-001 … SPEC-007).
Design: `docs/superpowers/specs/2026-08-11-pollux-cross-model-plugin-design.md`.

## Layout

```text
plugins/pollux-ui/
├── pollux.plugin.json        # neutral capability manifest (generated)
├── pollux.plugin.schema.json # manifest schema
├── manifest.config.json      # hand-edited builder input
├── .codex-plugin/plugin.json # generated — do not hand-edit
├── .claude-plugin/plugin.json# generated — do not hand-edit
├── skills/<name>/SKILL.md    # shared workflow bodies (+ agents/openai.yaml)
├── resources/                # generated snapshot + catalog.json — never edited
├── scripts/                  # deterministic builders and validators
├── tests/                    # unit specs, trigger/workflow eval cases
└── VERSIONING.md             # SPEC-007 version policy, stages, governance
```

## Commands

```bash
node plugins/pollux-ui/scripts/build-manifest.mjs       # neutral manifest
node plugins/pollux-ui/scripts/build-resources.mjs      # resource snapshot
node plugins/pollux-ui/scripts/build-projections.mjs    # host manifests
node plugins/pollux-ui/scripts/validate-package.mjs     # full validation
node plugins/pollux-ui/scripts/verify-source-drift.mjs  # source drift gate
node plugins/pollux-ui/scripts/validate-hosts.mjs       # Codex + Claude validators; fail closed
node plugins/pollux-ui/scripts/evaluate-triggers.mjs --host=codex|claudeCode
node plugins/pollux-ui/scripts/evaluate-triggers.mjs --host=codex --case=<id> # focused debugging
node plugins/pollux-ui/scripts/evaluate-workflows.mjs --host=codex|claudeCode
node plugins/pollux-ui/scripts/evaluate-workflows.mjs --host=codex --case=<id> # focused debugging
pnpm pollux:plugin:workflows:artifacts              # nine real artifact cases, no model claim
node plugins/pollux-ui/scripts/build-release.mjs        # release artifact
node --test "plugins/pollux-ui/tests/*.unit.spec.mjs"   # test suite
pnpm pollux:plugin:release:test                     # two clean reproducible installs
```

Rebuild order after changing canonical sources: build-manifest →
build-resources → build-projections → validate-package. Any source change
without a rebuilt snapshot fails `verify-source-drift` with the exact
resource ID and changed path.

Native host validation records the installed versions and requires exactly
the five declared skills. Trigger evaluation uses repo-owned fresh-session
Codex/Claude adapters and requires the hosts' normal authentication; the
command can be overridden with a JSON command array through
`POLLUX_{CODEX|CLAUDE}_TRIGGER_ADAPTER`. Workflow evaluation uses repo-owned
Codex/Claude decision adapters followed by the host-neutral artifact probe;
optional `POLLUX_{CODEX|CLAUDE}_WORKFLOW_ADAPTER` values override them. Missing
credentials, host binaries, or artifact evidence fail with
`VERIFICATION_FAILED`; case-file structure is never a model pass.
Pass `--evidence=<path>` to either evaluator to persist a prompt-free summary
with host version, manifest/case digests, metrics, and timestamp. CI uploads
all four evidence files even when a later case fails.
Validate a collected set without building a release with
`pnpm pollux:plugin:evidence -- --evidence-dir=<dir>`.
The CI workflow has six fail-closed jobs, including the required workflow
matrix and aggregate result check.

Current release stage is **Cross-model experimental (Stage 4)**. On 2026-08-11,
Codex CLI 0.147.0 and Claude Code 2.1.220 each passed all 17 trigger cases and
all 9 model-selected artifact workflows. Precision and recall were 1.0 with
zero unauthorized-mutation false positives. The package remains repo-local and
unpublished; native marketplace installation and rollback to a prior version
are not yet proven, so this is not a supported local release.

Evidence note for this working tree: after evidence hashing was tightened, the
final Claude reports were regenerated successfully. The equivalent Codex
refresh is pending because the local Codex account reached its usage limit
until 2026-08-18 07:56. `validate-evidence.mjs` therefore rejects the mixed
old/new set, and no Stage-4 archive should be produced from it. The last full
Codex matrices themselves passed 17/17 and 9/9 before this evidence-only
hardening.

Criterion-by-criterion status and the remaining external gates are recorded in
[`SPEC-COVERAGE.md`](./SPEC-COVERAGE.md).

## Boundaries

- Generated application output is never a plugin resource.
- Packaged resources are rebuilt from source, never hand-edited.
- Skills delegate to `./pollux`; they never reimplement generator behavior.
- No MCP, hooks, network access, or marketplace publication in this release.
- The three standalone targets (nextjs, react-router/remix, astro) remain
  experimental until their CI matrices promote them.
