#!/bin/bash
#
# Generate TypeScript SDK from OpenAPI spec.
#
# This script uses @openapitools/openapi-generator-cli to generate a typed
# TypeScript client from the OpenAPI spec. The client is committed to the repo
# and updated whenever the spec changes.
#
# Usage: ./scripts/generate-sdk.sh
#

set -e

BACKEND_DIR="backend"
SPEC_FILE="${BACKEND_DIR}/openapi-generated.json"
OUTPUT_DIR="sdk/stellar-tipz-sdk"
GENERATOR_CONFIG="sdk/openapi-generator-config.json"

echo "═══════════════════════════════════════════════════════════════"
echo "Stellar Tipz TypeScript SDK Generation"
echo "═══════════════════════════════════════════════════════════════"

# Step 1: Generate the OpenAPI spec
echo ""
echo "Step 1: Generating OpenAPI spec from backend..."
cd "${BACKEND_DIR}"
npx tsx scripts/generate-openapi-spec.ts "$SPEC_FILE"
cd ".."

if [ ! -f "$SPEC_FILE" ]; then
  echo "✗ Failed to generate spec file"
  exit 1
fi

ROUTE_COUNT=$(jq '.paths | length' "$SPEC_FILE")
echo "✓ Spec generated with $ROUTE_COUNT routes"

# Step 2: Generate TypeScript client
echo ""
echo "Step 2: Generating TypeScript client..."
if command -v npx &> /dev/null; then
  npx @openapitools/openapi-generator-cli@2.x generate \
    -i "$SPEC_FILE" \
    -g typescript-axios \
    -o "$OUTPUT_DIR" \
    -c "$GENERATOR_CONFIG"
else
  echo "✗ npx not found. Install Node.js and npm."
  exit 1
fi

if [ ! -f "${OUTPUT_DIR}/package.json" ]; then
  echo "✗ Client generation failed"
  exit 1
fi

echo "✓ TypeScript client generated"

# Step 3: Build the generated client
echo ""
echo "Step 3: Building generated client..."
cd "$OUTPUT_DIR"
npm install
npm run build
cd "../.."

echo "✓ Client built successfully"

# Step 4: Verify the client exports
echo ""
echo "Step 4: Verifying client exports..."
if grep -q "export.*Api" "${OUTPUT_DIR}/dist/index.js" 2>/dev/null; then
  echo "✓ Client exports verified"
else
  echo "⚠ Warning: Could not verify client exports"
fi

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "✓ SDK generation complete!"
echo ""
echo "Generated files:"
echo "  - SDK: ${OUTPUT_DIR}"
echo "  - OpenAPI spec: ${SPEC_FILE}"
echo ""
echo "Next steps:"
echo "  1. Review the generated SDK in ${OUTPUT_DIR}"
echo "  2. Commit ${SPEC_FILE} and ${OUTPUT_DIR} to version control"
echo "  3. Update frontend imports to use the new SDK"
echo "  4. Consider publishing to npm: npm publish ${OUTPUT_DIR}"
echo "═══════════════════════════════════════════════════════════════"
