#!/usr/bin/env bash
set -euo pipefail

file="$(node -e 'const { readFileSync } = require("node:fs");
try {
  const hook = JSON.parse(readFileSync(0, "utf8"));
  process.stdout.write(hook.tool_input?.file_path ?? "");
} catch {}')"

[[ -n "$file" ]] || exit 0

exec yarn biome check --write --no-errors-on-unmatched "$file"
