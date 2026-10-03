#!/usr/bin/env bash
# Run a deterministic build/typecheck once per source fingerprint.
# Usage: run-cached-task.sh <name> <input-path>... -- <command> [args...]
set -euo pipefail

if [ "$#" -lt 4 ]; then
  echo "Usage: $0 <name> <input-path>... -- <command> [args...]" >&2
  exit 2
fi

name=$1
shift
inputs=()
while [ "$#" -gt 0 ] && [ "$1" != "--" ]; do
  inputs+=("$1")
  shift
done
if [ "$#" -eq 0 ]; then
  echo "Missing -- before command" >&2
  exit 2
fi
shift
if [ "$#" -eq 0 ]; then
  echo "Missing command" >&2
  exit 2
fi

cache_dir=".cache/task-runner"
mkdir -p "$cache_dir"
stamp="$cache_dir/$name.sha256"
fingerprint=$(
  {
    printf '%s\n' "$name" "$*" "node=$(node --version 2>/dev/null || true)" "cargo=$(cargo --version 2>/dev/null || true)"
    git ls-files --cached --others --exclude-standard -- "${inputs[@]}" | LC_ALL=C sort | while IFS= read -r file; do
      [ -f "$file" ] || continue
      shasum -a 256 "$file"
    done
  } | shasum -a 256 | awk '{print $1}'
)

if [ -f "$stamp" ] && [ "$(cat "$stamp")" = "$fingerprint" ]; then
  echo "[cached] $name is up to date"
  exit 0
fi

"$@"
temporary_stamp=$(mktemp "$cache_dir/.${name}.XXXXXX")
printf '%s\n' "$fingerprint" > "$temporary_stamp"
mv "$temporary_stamp" "$stamp"
