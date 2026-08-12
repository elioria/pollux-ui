#!/usr/bin/env bash
# Regenerate generator/ from a start-ui-web checkout.
# Usage: scripts/sync-generator.sh /path/to/start-ui-web
set -euo pipefail
SRC="${1:?usage: sync-generator.sh <start-ui-web checkout>}"
DEST="$(cd "$(dirname "$0")/.." && pwd)/generator"
rsync -aR --delete \
  --exclude='node_modules' --exclude='.output' --exclude='.tanstack' \
  --exclude='.nitro' --exclude='dist' --exclude='build' --exclude='.next' \
  --exclude='.astro' --exclude='.react-router' \
  "$SRC"/./pollux "$SRC"/./scripts/pollux "$SRC"/./_templates/pollux-targets \
  "$SRC"/./skeletons "$SRC"/./test-fixtures/pollux "$DEST"/
chmod +x "$DEST/pollux"
mkdir -p "$DEST/json-files"; touch "$DEST/json-files/.gitkeep"
echo "generator/ synced from $SRC — reinstall (pnpm install) and smoke-test new-workspace + generate before committing."
