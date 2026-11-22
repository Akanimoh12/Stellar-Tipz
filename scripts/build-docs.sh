#!/bin/bash
#
# Build and validate the documentation site.
#
# This script:
# 1. Validates all internal links
# 2. Generates API reference from OpenAPI spec
# 3. Generates contract ABI documentation
# 4. Builds the Docusaurus site
# 5. Reports any build failures
#
# Usage: ./scripts/build-docs.sh
#

set -e

DOCS_DIR="docs"
SCRIPTS_DIR="scripts"

echo "═══════════════════════════════════════════════════════════════"
echo "Building Stellar Tipz Documentation"
echo "═══════════════════════════════════════════════════════════════"

# Step 1: Validate internal links
echo ""
echo "Step 1: Validating internal links..."
if ! npx tsx "${SCRIPTS_DIR}/validate-docs-links.ts"; then
  echo "✗ FAIL: Found broken links in documentation"
  echo "   Fix the broken links and run again"
  exit 1
fi
echo "✓ All internal links are valid"

# Step 2: Generate API reference
echo ""
echo "Step 2: Generating API reference from OpenAPI spec..."
if [ -f "backend/openapi-generated.json" ]; then
  npx tsx "${SCRIPTS_DIR}/generate-api-docs.ts" \
    "backend/openapi-generated.json" \
    "${DOCS_DIR}/api-reference.md"
  echo "✓ API reference generated"
else
  echo "⚠ OpenAPI spec not found (this is OK during initial setup)"
  echo "   Run: npm run sdk:generate"
fi

# Step 3: Generate contract ABI documentation
echo ""
echo "Step 3: Generating contract ABI documentation..."
npx tsx "${SCRIPTS_DIR}/generate-contract-docs.ts" \
  "contracts/abi/tipz_contract.spec.json" \
  "${DOCS_DIR}/contract-abi.md"
echo "✓ Contract ABI documentation generated"

# Step 4: Install Docusaurus dependencies (if needed)
echo ""
echo "Step 4: Installing documentation dependencies..."
if [ ! -d "${DOCS_DIR}/node_modules" ]; then
  cd "${DOCS_DIR}"
  npm install
  cd ".."
  echo "✓ Dependencies installed"
else
  echo "✓ Dependencies already installed"
fi

# Step 5: Build Docusaurus site
echo ""
echo "Step 5: Building Docusaurus site..."
cd "${DOCS_DIR}"
npm run build
BUILD_EXIT=$?
cd ".."

if [ $BUILD_EXIT -ne 0 ]; then
  echo "✗ FAIL: Docusaurus build failed"
  exit 1
fi

echo "✓ Docusaurus site built successfully"

# Step 6: Report output
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "✓ Documentation build complete!"
echo ""
echo "Output location:"
echo "  - Built site: ${DOCS_DIR}/build"
echo "  - Generated API docs: ${DOCS_DIR}/api-reference.md"
echo "  - Generated contract docs: ${DOCS_DIR}/contract-abi.md"
echo ""
echo "Next steps:"
echo "  1. Preview locally: cd ${DOCS_DIR} && npm run start"
echo "  2. Deploy to GitHub Pages: git push (auto-deploys via CI)"
echo "═══════════════════════════════════════════════════════════════"
