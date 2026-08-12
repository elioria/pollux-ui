# SPEC acceptance coverage

Evidence snapshot: 2026-08-11. `Verified` means the named executable gate has
passed in this checkout. `External gate` is intentionally release-blocking and
must not be inferred from schema or local artifact tests.

| SPEC | Acceptance criterion | Status | Evidence |
| --- | --- | --- | --- |
| 001 | Neutral manifest resolves skills, resources, projections | Verified | `pnpm pollux:plugin`; `validate-package.mjs` |
| 001 | Host manifests contain no workflow logic | Verified | package projection unit tests |
| 001 | Compatibility fails before writes | Verified | manifest authority/compatibility validation and workflow failure fixtures |
| 001 | Revision plus deterministic digest | Verified | manifest unit tests; clean release integration |
| 001 | Authority never expands silently | Verified | manifest and projection parity tests |
| 002 | Skill dependencies resolve through catalog IDs | Verified | package unit tests |
| 002 | Installed package is source-independent | Verified | two extracted release validations |
| 002 | Snapshot excludes output, secrets, caches, locks, VCS | Verified | deny-list/path safety tests |
| 002 | Layout resources include shell boundaries | Verified | 17-resource catalog validation |
| 002 | Resource bytes/hashes deterministic | Verified | repeated resource and release tests |
| 002 | Drift names exact resource and path | Verified | deletion, rename, modification tests |
| 003 | Shared skills parse for both hosts | Verified | Codex quick validators; Claude strict validator |
| 003 | Each skill maps to one goal family | Verified | manifest plus 17 trigger case contracts |
| 003 | Positive and negative trigger behavior | Verified | Codex and Claude each passed all 17 cases on 2026-08-11 |
| 003 | Ambiguity never causes mutation | Verified | both matrices passed with zero unauthorized-mutation false positives |
| 003 | Skills delegate algorithms to Pollux | Verified | skill/package semantic checks and review |
| 003 | Outputs name evidence, paths, commands, gaps | Verified | five shared skill contracts |
| 004 | Both projections share skill bodies | Verified | projection parity tests |
| 004 | Native manifests contain no procedures | Verified | projection unit tests |
| 004 | Host metadata cannot expand authority | Verified | projection parity validation |
| 004 | Projection paths remain inside package | Verified | package path validation |
| 004 | Native validators and versions are CI gates | Verified | `validate-hosts.mjs`; pinned CI jobs |
| 005 | Validation precedes mutation | Verified | skills plus atomic failure fixtures |
| 005 | Resources cannot escape plugin root | Verified | traversal/symlink/path tests |
| 005 | Pollux stable errors remain visible | Verified | artifact failure cases expose `DESTINATION_NOT_EMPTY` and `PLAN_INVALID` |
| 005 | Unrelated dirty bytes survive success/failure | Verified | resource failure injection and 9 workflow artifact cases |
| 005 | Release/workspace provenance is traceable | Verified | release integration and workspace provenance case |
| 005 | Recovery deletes no unknown path | Verified | atomic publish rollback tests |
| 006 | Both hosts discover exactly five skills | Verified locally | `pnpm pollux:plugin:hosts`; installed-host release proof remains external |
| 006 | Trigger thresholds are met | Verified | both hosts: precision 1.0, recall 1.0, mutation false positives 0 |
| 006 | Workflows inspect real artifacts | Verified | both hosts passed 9/9 model-selected workflows; host-neutral probe also 9/9 |
| 006 | Installed rebuild is deterministic/source-independent | Verified | `pnpm pollux:plugin:release:test` |
| 006 | Existing Pollux gates remain green | Verified | unit 194, selection 10, Go/vet, drift, skeleton and three workspace matrices |
| 006 | Missing/skipped hosts block release | Verified | fail-closed runners and aggregate CI gate |
| 007 | Release status matches evidence | Verified | Stage 4 declared; evidence-aware release builder refuses stale/partial reports |
| 007 | Rollback tested in both installed hosts | External gate | no supported-release claim until two-host install/rollback proof exists |
| 007 | Documentation derives from manifests/CI | Verified | README, VERSIONING, KB and generated release status |
| 007 | Existing project skill remains usable | Verified | `.claude/skills/pollux-cli/SKILL.md` remains in place |
| 007 | Marketplace/MCP require a new SPEC | Verified | manifest, README, VERSIONING governance |
| 007 | Third host cannot fork canonical semantics | Verified by design | neutral manifest/resources/skills are canonical; projections contain metadata only |

## Release boundary

The behavioral Stage 4 matrices are complete. Promotion to Stage 5 is blocked,
by design, until native marketplace installation and rollback to a real prior
plugin artifact pass in both hosts. The CI aggregate job fails if any required
host, trigger, or workflow job is skipped or fails.

The final digest-bound Claude evidence is current. Codex passed the complete
matrices before evidence hashing was strengthened, but its final digest-bound
refresh is pending the local usage reset on 2026-08-18; the evidence validator
correctly rejects that stale pair instead of promoting a release artifact.
