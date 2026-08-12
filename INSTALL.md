# Installing the pollux-ui plugin

`pollux-ui` is a cross-model plugin: one neutral package (`pollux.plugin.json`)
with native projections for **Claude Code** (`.claude-plugin/`) and **Codex**
(`.codex-plugin/`), plus five shared Agent Skills under `skills/`.

## Requirements

- Node.js >= 20 and `git` (skills shell out to the `./pollux` CLI of a target checkout)
- Claude Code >= 2.x, or Codex >= 0.147.0
- The generator workflows operate on a repository that contains the `./pollux`
  CLI (the start-ui-web Pollux checkout). The plugin itself carries only
  templates, tokens, references, and workflow skills.

## Claude Code

### Option A — via marketplace (recommended)

This repository doubles as a single-plugin marketplace
(`.claude-plugin/marketplace.json`). Inside Claude Code:

```text
/plugin marketplace add elioria/pollux-ui
/plugin install pollux-ui@pollux
```

Or from the shell:

```bash
claude plugin marketplace add elioria/pollux-ui
claude plugin install pollux-ui@pollux
```

Restart the session (or open a new one); the five skills become available:

| Skill | Purpose |
| --- | --- |
| `pollux-inspect` | Read-only discovery: entities, templates, skeletons, doctor |
| `pollux-create-workspace` | Stage a standalone workspace from a skeleton |
| `pollux-generate-crud` | Journaled, all-or-nothing CRUD generation |
| `pollux-apply-layout` | Apply packaged layouts/design tokens |
| `pollux-verify` | Drift checks, ownership, and verification workflows |

### Option B — local development install

From a clone of this repository:

```bash
git clone https://github.com/elioria/pollux-ui.git
claude plugin marketplace add ./pollux-ui
claude plugin install pollux-ui@pollux
```

### Updating

```bash
claude plugin marketplace update pollux
claude plugin update pollux-ui
```

### Uninstalling

```bash
claude plugin uninstall pollux-ui
claude plugin marketplace remove pollux
```

## Codex

Codex consumes the `.codex-plugin/plugin.json` projection and the per-skill
`agents/openai.yaml` files:

```bash
git clone https://github.com/elioria/pollux-ui.git
# point Codex at the plugin projection, e.g.:
codex --plugin ./pollux-ui/.codex-plugin
```

(Exact flag depends on your Codex version; the projection was validated against
Codex 0.147.0. See `SPEC-COVERAGE.md` for the evaluated trigger/workflow
matrices.)

## Verifying an install

After installation, in a session ask for a Pollux inventory — the
`pollux-inspect` skill should trigger and run `./pollux list-entities --json`
against your Pollux checkout. To validate package integrity locally:

```bash
node scripts/validate-package.mjs      # 5 skills, 5 capabilities, 19 resources
node scripts/validate-hosts.mjs        # Codex + Claude host validators
node --test "tests/*.unit.spec.mjs"    # package unit suite
```

## Notes

- `resources/` is a generated, hash-addressed snapshot — never hand-edit it.
  It is rebuilt from the canonical start-ui-web repository
  (`pnpm pollux:plugin` there).
- Version policy, stages, and governance: `VERSIONING.md`.
- Current stage: Stage 4 (cross-model experimental) — 17/17 triggers and 9/9
  artifact workflows green on Codex 0.147.0 and Claude Code 2.1.220.
