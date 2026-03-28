#!/bin/bash

# CLI Test Suite Runner
# Run this script to verify CLI setup and basic functionality

set -e

echo "================================"
echo "Diffolio CLI Test Suite"
echo "================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

CLI_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$CLI_DIR"

echo "📁 CLI Directory: $CLI_DIR"
echo ""

# Test 1: Check directory structure
echo "Test 1: Directory Structure"
echo "----------------------------"
if [ -d "src" ] && [ -d "src/commands" ] && [ -d "src/lib" ]; then
    echo -e "${GREEN}✓${NC} Source directories exist"
else
    echo -e "${RED}✗${NC} Missing source directories"
    exit 1
fi

# Test 2: Check package.json
echo ""
echo "Test 2: Package Configuration"
echo "------------------------------"
if [ -f "package.json" ]; then
    echo -e "${GREEN}✓${NC} package.json exists"
    
    # Check for required dependencies
    if grep -q "commander" package.json; then
        echo -e "${GREEN}✓${NC} commander dependency found"
    else
        echo -e "${RED}✗${NC} commander dependency missing"
        exit 1
    fi
    
    if grep -q "@prisma/client" package.json; then
        echo -e "${GREEN}✓${NC} @prisma/client dependency found"
    else
        echo -e "${RED}✗${NC} @prisma/client dependency missing"
        exit 1
    fi
else
    echo -e "${RED}✗${NC} package.json not found"
    exit 1
fi

# Test 3: Check TypeScript configuration
echo ""
echo "Test 3: TypeScript Configuration"
echo "---------------------------------"
if [ -f "tsconfig.json" ]; then
    echo -e "${GREEN}✓${NC} tsconfig.json exists"
    
    # Check for path alias
    if grep -q "@backend" tsconfig.json; then
        echo -e "${GREEN}✓${NC} @backend path alias configured"
    else
        echo -e "${YELLOW}⚠${NC} @backend path alias not found in tsconfig"
    fi
else
    echo -e "${RED}✗${NC} tsconfig.json not found"
    exit 1
fi

# Test 4: Check Prisma client generation
echo ""
echo "Test 4: Prisma Client"
echo "----------------------"
if [ -d "node_modules/@prisma/client" ] && [ -d "node_modules/.prisma/client" ]; then
    echo -e "${GREEN}✓${NC} Prisma client is generated"
else
    echo -e "${YELLOW}⚠${NC} Prisma client not found, attempting to generate..."
    if [ -f "../backend/prisma/schema.prisma" ]; then
        npx prisma generate --schema=../backend/prisma/schema.prisma || {
            echo -e "${YELLOW}⚠${NC} Failed to generate Prisma client automatically"
            echo "   Run manually: npx prisma generate --schema=../backend/prisma/schema.prisma"
        }
    else
        echo -e "${RED}✗${NC} Backend Prisma schema not found"
        exit 1
    fi
fi

# Test 5: Check CLI entry point
echo ""
echo "Test 5: CLI Entry Point"
echo "------------------------"
if [ -f "src/index.ts" ]; then
    echo -e "${GREEN}✓${NC} src/index.ts exists"
    
    # Test if CLI can show help
    if npx tsx src/index.ts --help >/dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} CLI help command works"
    else
        echo -e "${YELLOW}⚠${NC} CLI help command failed (may need dependencies installed)"
    fi
else
    echo -e "${RED}✗${NC} src/index.ts not found"
    exit 1
fi

# Test 6: Check parse command
echo ""
echo "Test 6: Parse Command"
echo "----------------------"
if [ -f "src/commands/parse.ts" ]; then
    echo -e "${GREEN}✓${NC} Parse command exists"
    
    # Test if parse help works
    if npx tsx src/index.ts parse --help >/dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} Parse command help works"
    else
        echo -e "${YELLOW}⚠${NC} Parse command help failed"
    fi
else
    echo -e "${RED}✗${NC} Parse command not found"
    exit 1
fi

# Test 7: Backend integration
echo ""
echo "Test 7: Backend Integration"
echo "----------------------------"
BACKEND_DIR="$CLI_DIR/../backend"
if [ -d "$BACKEND_DIR/src/services" ]; then
    echo -e "${GREEN}✓${NC} Backend services directory exists"
    
    if [ -f "$BACKEND_DIR/src/services/config-engine.ts" ]; then
        echo -e "${GREEN}✓${NC} Config engine service accessible"
    fi
    
    if [ -f "$BACKEND_DIR/src/services/parser/txt.parser.ts" ]; then
        echo -e "${GREEN}✓${NC} TXT parser accessible"
    fi
else
    echo -e "${RED}✗${NC} Backend services not found"
    exit 1
fi

# Test 8: Documentation
echo ""
echo "Test 8: Documentation"
echo "----------------------"
if [ -f "README.md" ]; then
    echo -e "${GREEN}✓${NC} CLI README exists"
else
    echo -e "${YELLOW}⚠${NC} CLI README not found"
fi

# Summary
echo ""
echo "================================"
echo "Test Summary"
echo "================================"
echo -e "${GREEN}All critical tests passed!${NC}"
echo ""
echo "Next steps:"
echo "  1. Ensure database is configured (PostgreSQL or SQLite)"
echo "  2. Run: npx tsx src/index.ts parse --help"
echo "  3. Test parsing: npx tsx src/index.ts parse -f test.txt -c config.json -d 'file:./test.db' -n test"
echo ""
