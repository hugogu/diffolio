#!/bin/bash

# Integration Test: Verify CLI Actually Uses Backend Services
# This test checks if CLI can successfully import and use backend modules

set -e

echo "================================"
echo "CLI Backend Integration Test"
echo "================================"
echo ""

CLI_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$CLI_DIR"

echo "Testing from: $CLI_DIR"
echo ""

PASSED=0
FAILED=0

# Test 1: Check if CLI can load backend parser module
echo "Test 1: Load Backend Parser Module"
echo "-----------------------------------"
cat > /tmp/test-parser.ts << 'EOF'
async function test() {
  try {
    const backendPath = '../../backend/src/services/parser';
    const txtModule = await import(`${backendPath}/txt.parser.js`);
    console.log('Parser module loaded:', Object.keys(txtModule));
    if (txtModule.parseTxt) {
      console.log('✓ parseTxt function available');
      process.exit(0);
    } else {
      console.log('✗ parseTxt function NOT available');
      process.exit(1);
    }
  } catch (e) {
    console.log('✗ Failed to load:', e.message);
    process.exit(1);
  }
}
test();
EOF

if npx tsx /tmp/test-parser.ts >/dev/null 2>&1; then
  echo "✓ Backend parser module accessible"
  ((PASSED++))
else
  echo "✗ Cannot access backend parser module"
  ((FAILED++))
fi

# Test 2: Check if CLI can load backend aligner
echo ""
echo "Test 2: Load Backend Aligner Module"
echo "------------------------------------"
cat > /tmp/test-aligner.ts << 'EOF'
async function test() {
  try {
    const aligner = await import('../../backend/src/services/aligner.js');
    console.log('Aligner module loaded:', Object.keys(aligner));
    if (aligner.alignEntries || aligner.default?.alignEntries) {
      console.log('✓ alignEntries function available');
      process.exit(0);
    } else {
      console.log('✗ alignEntries function NOT available');
      process.exit(1);
    }
  } catch (e) {
    console.log('✗ Failed to load:', e.message);
    process.exit(1);
  }
}
test();
EOF

if npx tsx /tmp/test-aligner.ts >/dev/null 2>&1; then
  echo "✓ Backend aligner module accessible"
  ((PASSED++))
else
  echo "✗ Cannot access backend aligner module"
  ((FAILED++))
fi

# Test 3: Verify import statements exist in CLI code
echo ""
echo "Test 3: Verify Import Statements in CLI"
echo "----------------------------------------"
if grep -q "backend/src/services" src/commands/parse.ts && \
   grep -q "backend/src/services" src/commands/compare.ts; then
  echo "✓ CLI code contains backend import statements"
  ((PASSED++))
else
  echo "✗ CLI code missing backend imports"
  ((FAILED++))
fi

# Test 4: Check for code duplication
echo ""
echo "Test 4: Check for Code Duplication"
echo "-----------------------------------"

# Check if CLI has its own parseTxt implementation
if grep -q "function parseTxt" src/commands/parse.ts; then
  echo "✗ CLI has its own parseTxt implementation (duplication!)"
  ((FAILED++))
else
  echo "✓ CLI does NOT duplicate parseTxt"
  ((PASSED++))
fi

# Check if CLI has its own alignEntries implementation
if grep -q "function alignEntries" src/commands/compare.ts; then
  echo "✗ CLI has its own alignEntries implementation (duplication!)"
  ((FAILED++))
else
  echo "✓ CLI does NOT duplicate alignEntries"
  ((PASSED++))
fi

# Summary
echo ""
echo "================================"
echo "Summary"
echo "================================"
echo "Passed: $PASSED"
echo "Failed: $FAILED"

if [ $FAILED -eq 0 ]; then
  echo ""
  echo "✅ All integration tests passed!"
  echo "✅ CLI properly reuses backend services"
  exit 0
else
  echo ""
  echo "⚠️  Some tests failed"
  echo "⚠️  CLI may not properly reuse backend services"
  exit 1
fi
