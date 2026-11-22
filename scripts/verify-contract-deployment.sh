#!/usr/bin/env bash
# Verify an existing Stellar contract against the exact release artifact.
# Usage: bash scripts/verify-contract-deployment.sh CONTRACT_ID WASM_PATH NETWORK EXPECTED_VERSION
set -euo pipefail
if [[ $# -ne 4 ]]; then
  echo "Usage: $0 CONTRACT_ID WASM_PATH NETWORK EXPECTED_VERSION" >&2
  exit 2
fi
contract_id="$1"
wasm="$2"
network="$3"
expected_version="$4"
if [[ ! "$contract_id" =~ ^C[A-Z2-7]{55}$ ]]; then
  echo "Invalid Stellar contract ID" >&2
  exit 2
fi
if [[ ! -f "$wasm" ]]; then
  echo "Missing release WASM: $wasm" >&2
  exit 2
fi
if [[ ! "$network" =~ ^[a-zA-Z0-9_-]+$ ]] || [[ ! "$expected_version" =~ ^[0-9]+$ ]]; then
  echo "Invalid network or expected version" >&2
  exit 2
fi
if command -v stellar >/dev/null 2>&1; then
  cli=stellar
elif command -v soroban >/dev/null 2>&1; then
  cli=soroban
else
  echo "Stellar CLI is required" >&2
  exit 2
fi
local_hash="$(sha256sum "$wasm" | cut -d' ' -f1)"
remote_hash="$("$cli" contract info hash --contract-id "$contract_id" --network "$network" | tr -d '\r\n[:space:]' | tr '[:upper:]' '[:lower:]')"
if [[ ! "$remote_hash" =~ ^[0-9a-f]{64}$ ]] || [[ "$local_hash" != "$remote_hash" ]]; then
  echo "WASM hash mismatch: local=$local_hash remote=$remote_hash" >&2
  exit 1
fi
actual_version="$("$cli" contract invoke --id "$contract_id" --network "$network" -- get_version | tr -d '\r\n[:space:]' | tr -d '"')"
if [[ "$actual_version" != "$expected_version" ]]; then
  echo "Contract version mismatch: expected=$expected_version actual=$actual_version" >&2
  exit 1
fi
echo "Verified $network contract $contract_id: SHA-256 $local_hash, version $actual_version"
