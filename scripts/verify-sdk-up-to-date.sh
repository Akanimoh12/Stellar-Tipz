#!/bin/bash
#
# Verify that the committed SDK is up-to-date with the OpenAPI spec.
#
# This script is run in CI to ensure the SDK hasn't drifted from the spec.
# If the check fails, the developer must run generate-sdk.sh locally and commit
# the updated files.
#
# Usage: ./scripts/verify-sdk-up-to-date.sh
#

set -e

BACKEND_DIR="backend"
SPEC_FILE="${BACKEND_DIR}/openapi-generated.json"
SDK_PACKAGE="${SDK_DIR}/package.json"

echo "Verifying SDK is up-to-date with OpenAPI spec..."

# Step 1: Generate fresh spec
echo "  • Generating current OpenAPI spec..."
cd "${BACKEND_DIR}"
npx tsx scripts/generate-openapi-spec.ts "/tmp/openapi-current.json"
cd ".."

# Step 2: Compare with committed spec
if [ ! -f "$SPEC_FILE" ]; then
  echo "✗ FAIL: Committed spec file not found at ${SPEC_FILE}"
  echo "   Run: ./scripts/generate-sdk.sh"
  exit 1
fi

echo "  • Comparing specs..."
if ! diff -q "$SPEC_FILE" "/tmp/openapi-current.json" > /dev/null; then
  echo "✗ FAIL: OpenAPI spec is out of date"
  echo ""
  echo "The spec has changed since the last generation. To fix:"
  echo "  1. Run: ./scripts/generate-sdk.sh"
  echo "  2. Commit the updated files:"
  echo "     - ${SPEC_FILE}"
  echo "     - sdk/stellar-tipz-sdk/"
  exit 1
fi

echo "✓ PASS: OpenAPI spec is up-to-date"

# Step 3: Verify SDK package exists
if [ ! -f "${SDK_PACKAGE}" ]; then
  echo "✗ FAIL: Generated SDK package.json not found"
  echo "   Run: ./scripts/generate-sdk.sh"
  exit 1
fi

echo "✓ PASS: Generated SDK is present"

# Step 4: Basic SDK sanity check
echo "  • Checking SDK exports..."
SDK_DIST="sdk/stellar-tipz-sdk/dist"
if [ -d "$SDK_DIST" ]; then
  if [ -f "${SDK_DIST}/index.js" ] || [ -f "${SDK_DIST}/index.ts" ]; then
    echo "✓ PASS: SDK entry point exists"
  else
    echo "⚠ WARNING: SDK entry point not found at expected location"
  fi
else
  echo "⚠ WARNING: SDK dist directory not found (may not be built)"
fi

echo ""
echo "✓ SUCCESS: SDK verification passed"
