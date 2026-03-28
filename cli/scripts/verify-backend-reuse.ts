#!/usr/bin/env node

/**
 * Code Reuse Verification Script
 * 
 * This script verifies that CLI actually reuses backend services,
 * not just duplicates the logic.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, '..');

console.log('================================');
console.log('Code Reuse Verification');
console.log('================================\n');

let issues = [];
let checks = 0;

// Check 1: Verify CLI imports backend services
console.log('Check 1: CLI imports backend services');
checks++;

const parseCommand = readFileSync(resolve(__dirname, '../src/commands/parse.ts'), 'utf-8');
const compareCommand = readFileSync(resolve(__dirname, '../src/commands/compare.ts'), 'utf-8');

// Check if imports use dynamic import with backend path
const hasBackendImport = parseCommand.includes("import('../../../backend/src/services/") ||
                         parseCommand.includes('import("../../../backend/src/services/');

if (hasBackendImport) {
  console.log('  ✓ CLI attempts to import from backend');
} else {
  console.log('  ✗ CLI does NOT import from backend');
  issues.push('CLI commands should import from backend services');
}

// Check 2: Verify imports are actually used
console.log('\nCheck 2: Backend imports are used in logic');
checks++;

const parseUsesParser = parseCommand.includes('parseTxt') || 
                        parseCommand.includes('parseDocx') ||
                        parseCommand.includes('parsePdf');

const compareUsesAligner = compareCommand.includes('alignEntries');
const compareUsesDiffer = compareCommand.includes('diffSenses');

if (parseUsesParser) {
  console.log('  ✓ Parse command uses parser functions');
} else {
  console.log('  ✗ Parse command does NOT use parser functions');
  issues.push('Parse command should call backend parser functions');
}

if (compareUsesAligner) {
  console.log('  ✓ Compare command uses aligner');
} else {
  console.log('  ✗ Compare command does NOT use aligner');
  issues.push('Compare command should call backend aligner');
}

if (compareUsesDiffer) {
  console.log('  ✓ Compare command uses differ');
} else {
  console.log('  ✗ Compare command does NOT use differ');
  issues.push('Compare command should call backend differ');
}

// Check 3: Verify no duplicated logic
console.log('\nCheck 3: No duplicated business logic in CLI');
checks++;

// Check for common duplicated patterns
const duplicatedPatterns = [
  'function parseTxt',
  'function parseDocx',
  'function parsePdf',
  'function alignEntries',
  'function diffSenses',
  'class.*Parser',
];

let hasDuplication = false;
for (const pattern of duplicatedPatterns) {
  const regex = new RegExp(pattern, 'g');
  const matches = parseCommand.match(regex) || compareCommand.match(regex);
  if (matches && matches.length > 0) {
    console.log(`  ✗ Found duplicated: ${pattern}`);
    hasDuplication = true;
    issues.push(`Duplicated logic found: ${pattern}`);
  }
}

if (!hasDuplication) {
  console.log('  ✓ No obvious duplicated logic in CLI');
}

// Check 4: Check backend services exist and are exported
console.log('\nCheck 4: Backend services are exportable');
checks++;

try {
  const alignerPath = resolve(__dirname, '../../../backend/src/services/aligner.ts');
  const alignerContent = readFileSync(alignerPath, 'utf-8');
  
  if (alignerContent.includes('export') && alignerContent.includes('alignEntries')) {
    console.log('  ✓ Backend aligner exports alignEntries');
  } else {
    console.log('  ⚠ Backend aligner may not export required functions');
    issues.push('Backend aligner should export alignEntries function');
  }
} catch (e) {
  console.log('  ✗ Cannot read backend aligner:', e.message);
  issues.push('Cannot verify backend aligner exports');
}

try {
  const differPath = resolve(__dirname, '../../../backend/src/services/differ.ts');
  const differContent = readFileSync(differPath, 'utf-8');
  
  if (differContent.includes('export') && differContent.includes('diffSenses')) {
    console.log('  ✓ Backend differ exports diffSenses');
  } else {
    console.log('  ⚠ Backend differ may not export required functions');
    issues.push('Backend differ should export diffSenses function');
  }
} catch (e) {
  console.log('  ✗ Cannot read backend differ:', e.message);
  issues.push('Cannot verify backend differ exports');
}

// Summary
console.log('\n================================');
console.log('Summary');
console.log('================================');

if (issues.length === 0) {
  console.log('✅ All checks passed!');
  console.log(`✅ ${checks}/${checks} checks successful`);
  console.log('\nCLI properly reuses backend services.');
  process.exit(0);
} else {
  console.log(`⚠️  ${issues.length} issue(s) found:`);
  issues.forEach((issue, i) => {
    console.log(`  ${i + 1}. ${issue}`);
  });
  console.log(`\n⚠️  ${checks - issues.length}/${checks} checks passed`);
  console.log('\n❌ CLI does NOT properly reuse backend services!');
  console.log('   Business logic may be duplicated.');
  process.exit(1);
}
