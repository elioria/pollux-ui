#!/usr/bin/env bash
# SPEC-006/008 regeneration drift gate: fails when committed generated output
# differs from deterministic regeneration from current templates + metadata.
# Requires a clean working tree on the generated paths.
set -euo pipefail
cd "$(dirname "$0")/../.."

GEN_PATHS=("src/app/(private)/generated" "src/routes")

if ! git diff --quiet -- "${GEN_PATHS[@]}"; then
  echo "check-drift: generated paths already dirty — commit or stash first" >&2
  exit 2
fi

./gen-all-go.sh >/dev/null || ./gen-all.sh >/dev/null
# Canonical post-gen pipeline (fixpoint): import sort first, formatter last.
pnpm exec oxlint --fix "src/app/(private)/generated" src/routes >/dev/null 2>&1 || true
find "src/app/(private)/generated" \( -name '*.ts' -o -name '*.tsx' -o -name '*.css' \) -print0 \
  | xargs -0 pnpm exec oxfmt >/dev/null 2>&1
ls src/routes/generated*.tsx | xargs pnpm exec oxfmt >/dev/null 2>&1

if git diff --exit-code --stat -- "${GEN_PATHS[@]}"; then
  echo "check-drift: OK — regeneration is clean"
else
  echo "check-drift: DRIFT — committed output differs from regeneration" >&2
  git checkout -- "${GEN_PATHS[@]}"
  exit 1
fi
