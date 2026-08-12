# Installing the pollux-ui plugin

`pollux-ui` is a cross-model plugin: one neutral package (`pollux.plugin.json`)
with native projections for **Claude Code** (`.claude-plugin/`) and **Codex**
(`.codex-plugin/`), plus five shared Agent Skills under `skills/`.

For a hands-on walkthrough of everything the plugin can do after installation,
see **[GUIDE.md](./GUIDE.md)**.

## Requirements

- Node.js >= 20, `pnpm`, and `git`
- Claude Code >= 2.x (or Codex >= 0.147.0)
- A checkout of the Pollux start-ui-web repository somewhere on disk — the
  skills drive its `./pollux` CLI. The plugin itself carries only templates,
  design tokens, references, and workflow skills.

## Claude Code — install WITHOUT cloning (recommended)

This repository doubles as a single-plugin marketplace
(`.claude-plugin/marketplace.json`). Claude Code fetches it directly from
GitHub — you never clone anything yourself.

Inside a Claude Code session:

```text
/plugin marketplace add elioria/pollux-ui
/plugin install pollux-ui@pollux
```

Or from your shell:

```bash
claude plugin marketplace add elioria/pollux-ui
claude plugin install pollux-ui@pollux
```

Restart the session (or open a new one). The six skills become available:

| Skill | Purpose |
| --- | --- |
| `pollux-inspect` | Read-only discovery: entities, templates, skeletons, targets, doctor |
| `pollux-create-workspace` | Scaffold a standalone app workspace from a skeleton (nextjs / remix / astro / **tanstack-start**) |
| `pollux-generate-crud` | Journaled, all-or-nothing CRUD generation (in-repo pages, Go backend, standalone targets) |
| `pollux-apply-layout` | Apply packaged layouts / design tokens to a target |
| `pollux-verify` | Drift checks, ownership verification, matrix gates |

### Verify the install

```text
/plugin
```

should list `pollux-ui 0.3.0` as installed. Then, from a session opened inside
a start-ui-web checkout, ask e.g. *“which Pollux skeletons are available?”* —
the `pollux-inspect` skill should trigger and run
`./pollux list-skeletons --json`.

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
`agents/openai.yaml` files. Codex has no remote-marketplace fetch, so this is
the one host that needs a local copy:

```bash
git clone https://github.com/elioria/pollux-ui.git
codex --plugin ./pollux-ui/.codex-plugin
```

(Exact flag depends on your Codex version; the projection was validated
against Codex 0.147.0. See `SPEC-COVERAGE.md` for the evaluated
trigger/workflow matrices.)

## Validating package integrity (optional, needs a local copy)

```bash
node scripts/validate-package.mjs      # 6 skills, 6 capabilities, 19 resources
node scripts/validate-hosts.mjs        # Codex + Claude host validators
node --test "tests/*.unit.spec.mjs"    # package unit suite
```

## Notes

- `resources/` is a generated, hash-addressed snapshot — never hand-edit it.
  It is rebuilt from the canonical start-ui-web repository
  (`pnpm pollux:plugin` there).
- Version policy, stages, and governance: `VERSIONING.md`.
- 0.3.0 adds the pollux-author-entity skill (entity metadata from a brief idea); 0.2.0 added the fourth standalone target: `tanstack-start` (SPEC-008,
  TanStack Start / React 19 + Vite). All four standalone targets are
  **experimental**; the in-place `start-ui-vite` reference target is
  supported.
