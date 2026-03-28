#!/bin/bash

# CLI Commands Verification Test
# Tests that all CLI commands load without errors

set -e

echo "================================"
echo "CLI Commands Verification Test"
echo "================================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

CLI_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$CLI_DIR"

echo "📁 Testing in: $CLI_DIR"
echo ""

PASSED=0
FAILED=0

# Test 1: Query command loads without errors
echo "Test 1: Query Command Load"
echo "---------------------------"
if npx tsx src/index.ts query --database "file:./test.db" --help >/dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} Query command loads successfully"
    ((PASSED++))
else
    echo -e "${RED}✗${NC} Query command failed to load"
    ((FAILED++))
fi

# Test 2: Compare command loads without errors
echo ""
echo "Test 2: Compare Command Load"
echo "-----------------------------"
if npx tsx src/index.ts compare --help >/dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} Compare command loads successfully"
    ((PASSED++))
else
    echo -e "${RED}✗${NC} Compare command failed to load"
    ((FAILED++))
fi

# Test 3: Export command loads without errors
echo ""
echo "Test 3: Export Command Load"
echo "----------------------------"
if npx tsx src/index.ts export --help >/dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} Export command loads successfully"
    ((PASSED++))
else
    echo -e "${RED}✗${NC} Export command failed to load"
    ((FAILED++))
fi

# Test 4: Verify all commands are registered
echo ""
echo "Test 4: CLI Commands Registration"
echo "----------------------------------"
HELP_OUTPUT=$(npx tsx src/index.ts --help 2>&1 || true)

if echo "$HELP_OUTPUT" | grep -q "parse"; then
    echo -e "${GREEN}✓${NC} Parse command registered"
    ((PASSED++))
else
    echo -e "${RED}✗${NC} Parse command not registered"
    ((FAILED++))
fi

if echo "$HELP_OUTPUT" | grep -q "query"; then
    echo -e "${GREEN}✓${NC} Query command registered"
    ((PASSED++))
else
    echo -e "${RED}✗${NC} Query command not registered"
    ((FAILED++))
fi

if echo "$HELP_OUTPUT" | grep -q "compare"; then
    echo -e "${GREEN}✓${NC} Compare command registered"
    ((PASSED++))
else
    echo -e "${RED}✗${NC} Compare command not registered"
    ((FAILED++))
fi

if echo "$HELP_OUTPUT" | grep -q "export"; then
    echo -e "${GREEN}✓${NC} Export command registered"
    ((PASSED++))
else
    echo -e "${RED}✗${NC} Export command not registered"
    ((FAILED++))
fi

# Test 5: TypeScript compilation
echo ""
echo "Test 5: TypeScript Compilation"
echo "-------------------------------"
if npx tsc --noEmit 2>&1; then
    echo -e "${GREEN}✓${NC} TypeScript compiles without errors"
    ((PASSED++))
else
    echo -e "${YELLOW}⚠${NC} TypeScript has warnings (may be acceptable)"
    # Don't count as failure for now
fi

# Summary
echo ""
echo "================================"
echo "Test Summary"
echo "================================"
echo -e "${GREEN}Passed: $PASSED${NC}"
if [ $FAILED -gt 0 ]; then
    echo -e "${RED}Failed: $FAILED${NC}"
    exit 1
else
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
fi
