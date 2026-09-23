#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTRACTS_DIR="$ROOT_DIR/contracts"
WASM_PATH="$CONTRACTS_DIR/target/wasm32-unknown-unknown/release/tipz_contract.wasm"
ARTIFACT_PATH="$ROOT_DIR/contracts/abi/tipz_contract.spec.json"

mkdir -p "$(dirname "$ARTIFACT_PATH")"

cargo build \
  --manifest-path "$CONTRACTS_DIR/Cargo.toml" \
  --package tipz-contract \
  --target wasm32-unknown-unknown \
  --release

if command -v stellar >/dev/null 2>&1; then
  stellar contract inspect --wasm "$WASM_PATH" --output json > "$ARTIFACT_PATH"
elif command -v soroban >/dev/null 2>&1; then
  soroban contract inspect --wasm "$WASM_PATH" --output json > "$ARTIFACT_PATH"
else
  echo "stellar or soroban CLI is required to inspect the contract spec" >&2
  exit 1
fi

echo "Wrote $ARTIFACT_PATH"
