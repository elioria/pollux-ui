#!/usr/bin/env bash
# Regression tests for generate-pollux.sh backend selection and TypeScript
# immutability (spec: docs/superpowers/specs/2026-07-19-pollux-go-backend-design.md).
set -uo pipefail
cd "$(dirname "$0")/../.."

pass=0
fail=0

check() {
  local label="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    echo "ok    $label"
    pass=$((pass + 1))
  else
    echo "FAIL  $label (expected '$expected', got '$actual')" >&2
    fail=$((fail + 1))
  fi
}

ts_hash() {
  # Hash of every existing TypeScript source and template.
  { git ls-files '*.ts' '*.tsx' '_templates/**' ':!generated/**' \
      | sort | xargs sha256sum 2>/dev/null; } | sha256sum | cut -d' ' -f1
}

before_hash="$(ts_hash)"

# 1. Missing --backend fails without writing.
out="$(./generate-pollux.sh 2>&1)"; code=$?
check "missing backend exits 2" 2 "$code"
echo "$out" | grep -q -- '--backend is required' && echo "ok    missing backend message" && pass=$((pass+1)) || { echo "FAIL  missing backend message" >&2; fail=$((fail+1)); }

# 2. Invalid backend fails without writing.
out="$(./generate-pollux.sh --backend rust 2>&1)"; code=$?
check "invalid backend exits 2" 2 "$code"
echo "$out" | grep -q "invalid backend 'rust'" && echo "ok    invalid backend message" && pass=$((pass+1)) || { echo "FAIL  invalid backend message" >&2; fail=$((fail+1)); }

check "no writes after failed selection" "$before_hash" "$(ts_hash)"

# 3. Dispatch targets (static analysis of the wrapper: each branch execs the
#    matching generator and nothing else).
grep -A2 "^  typescript)" generate-pollux.sh | grep -q "exec ./gen-all.sh" \
  && { echo "ok    typescript dispatches to gen-all.sh"; pass=$((pass+1)); } \
  || { echo "FAIL  typescript dispatch" >&2; fail=$((fail+1)); }
grep -A2 "^  go)" generate-pollux.sh | grep -q "exec ./gen-all-go-backend.sh" \
  && { echo "ok    go dispatches to gen-all-go-backend.sh"; pass=$((pass+1)); } \
  || { echo "FAIL  go dispatch" >&2; fail=$((fail+1)); }

# 4. Go generation leaves every TypeScript source and template unchanged.
if [ "${RUN_GO_GENERATION:-1}" = "1" ]; then
  ./generate-pollux.sh --backend go >/dev/null 2>&1; code=$?
  check "go generation succeeds" 0 "$code"
  check "typescript sources unchanged after go generation" "$before_hash" "$(ts_hash)"

  # 5. Rerunning Go generation is byte-identical.
  first="$(cd generated/pollux-go && find . -type f | sort | xargs sha256sum | sha256sum | cut -d' ' -f1)"
  ./generate-pollux.sh --backend go >/dev/null 2>&1
  second="$(cd generated/pollux-go && find . -type f | sort | xargs sha256sum | sha256sum | cut -d' ' -f1)"
  check "go generation is byte-identical on rerun" "$first" "$second"
fi

echo
echo "backend-selection tests: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
