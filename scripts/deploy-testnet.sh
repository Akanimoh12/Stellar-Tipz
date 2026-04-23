#!/usr/bin/env bash
# Deploy the Tipz contract to Stellar Testnet.
#
# Usage:
#   ./scripts/deploy-testnet.sh [options] [KEY_NAME]
#
# Options:
#   --build       Build the contract before deploying
#   --optimized   Use soroban contract optimize output (optimized.wasm)
#   --dry-run     Validate inputs and wasm path without deploying
#
# KEY_NAME defaults to "tipz-deployer"

set -euo pipefail

BUILD=false
OPTIMIZED=false
DRY_RUN=false
KEY_NAME="tipz-deployer"
NATIVE_TOKEN_ID="${NATIVE_TOKEN_ID:-CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC}"

# Parse args
for arg in "$@"; do
    case "$arg" in
        --build)     BUILD=true ;;
        --optimized) OPTIMIZED=true ;;
        --dry-run)   DRY_RUN=true ;;
        --*)
            echo "Error: Unknown option '$arg'"
            echo "Usage: $0 [--build] [--optimized] [--dry-run] [KEY_NAME]"
            exit 1
            ;;
        *)           KEY_NAME="$arg" ;;
    esac
done

echo "=== Stellar Tipz — Testnet Deployment ==="
echo ""

# Check soroban CLI is installed
if ! command -v soroban &> /dev/null; then
    echo "Error: soroban CLI not found. Install it with:"
    echo "  cargo install --locked soroban-cli"
    exit 1
fi

# Optionally build first
if [ "$BUILD" = true ]; then
    echo "Building contract..."
    (cd contracts && cargo build --target wasm32-unknown-unknown --release)
    echo "Build complete."
    echo ""
fi

# Resolve Wasm path — auto-detect from build output
RELEASE_DIR="contracts/target/wasm32-unknown-unknown/release"

if [ "$OPTIMIZED" = true ]; then
    WASM_PATH="$RELEASE_DIR/tipz_contract.optimized.wasm"
else
    # Auto-detect: prefer the known name, fall back to any .wasm in release dir
    KNOWN_WASM="$RELEASE_DIR/tipz_contract.wasm"
    if [ -f "$KNOWN_WASM" ]; then
        WASM_PATH="$KNOWN_WASM"
    else
        # Try to find any compiled wasm (handles unexpected name changes)
        DETECTED=$(find "$RELEASE_DIR" -maxdepth 1 -name "*.wasm" ! -name "*.optimized.wasm" 2>/dev/null | head -1)
        if [ -n "$DETECTED" ]; then
            WASM_PATH="$DETECTED"
            echo "Warning: expected tipz_contract.wasm not found; using detected file."
        else
            WASM_PATH="$KNOWN_WASM"  # set for the error message below
        fi
    fi
fi

# Validate Wasm exists
if [ ! -f "$WASM_PATH" ]; then
    echo "Error: Wasm file not found at $WASM_PATH"
    echo ""
    echo "Build the contract first with:"
    echo "  cd contracts && cargo build --target wasm32-unknown-unknown --release"
    echo ""
    echo "Or re-run this script with the --build flag:"
    echo "  $0 --build $KEY_NAME"
    exit 1
fi

echo "Using Wasm: $WASM_PATH"
echo ""

if [ "$DRY_RUN" = true ]; then
    echo "[dry-run] Wasm file found. Skipping deploy."
    echo "[dry-run] Key: $KEY_NAME"
    echo "[dry-run] Native token: $NATIVE_TOKEN_ID"
    exit 0
fi

# Check if key exists, create if not
if ! soroban keys address "$KEY_NAME" &> /dev/null; then
    echo "Generating new key: $KEY_NAME"
    soroban keys generate "$KEY_NAME" --network testnet
fi

DEPLOYER_ADDR="$(soroban keys address "$KEY_NAME")"
echo "Deployer address: $DEPLOYER_ADDR"

# Fund via Friendbot
echo "Funding account via Friendbot..."
curl -s "https://friendbot.stellar.org?addr=$DEPLOYER_ADDR" > /dev/null
echo "Account funded."
echo ""

# Deploy
echo "Deploying to testnet..."
CONTRACT_ID=$(soroban contract deploy \
    --wasm "$WASM_PATH" \
    --source "$KEY_NAME" \
    --network testnet)

echo ""
echo "=== Deployment Successful ==="
echo "Contract ID: $CONTRACT_ID"
echo ""

# Initialize
echo "Initializing contract..."
soroban contract invoke \
    --id "$CONTRACT_ID" \
    --source "$KEY_NAME" \
    --network testnet \
    -- \
    initialize \
    --admin "$DEPLOYER_ADDR" \
    --fee_collector "$DEPLOYER_ADDR" \
    --fee_bps 200 \
    --native_token "$NATIVE_TOKEN_ID"

echo ""
echo "Contract initialized with 2% fee."
echo "Native token SAC: $NATIVE_TOKEN_ID"
echo ""
echo "=== Done ==="
echo "Contract ID: $CONTRACT_ID"
echo "Save this in your frontend-scaffold/.env as:"
echo "  CONTRACT_ID=$CONTRACT_ID"
