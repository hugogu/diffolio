# Code Reuse Architecture

This document explains how the CLI tool reuses code from the backend to ensure consistency.

## Architecture Overview

```
diffolio/
├── backend/
│   ├── src/services/          # Source code (TypeScript)
│   │   ├── parser/            # Parser implementations
│   │   ├── aligner.ts         # Entry alignment logic
│   │   ├── differ.ts          # Sense difference calculation
│   │   └── config-engine.ts   # Format config validation
│   └── dist/services/         # Compiled code (JavaScript) ← CLI imports from here
├── cli/
│   └── src/commands/          # CLI commands
│       ├── parse.ts           # Imports from backend/dist/
│       ├── compare.ts         # Imports from backend/dist/
│       └── export.ts          # Uses backend logic
└── core/                      # (Future) Shared core module
```

## How It Works

### Current Approach: Compiled Backend Import

The CLI imports **compiled JavaScript** from `backend/dist/` instead of TypeScript source:

```typescript
// CLI command imports compiled backend module
const aligner = await import('../../../backend/dist/services/aligner.js');
const result = await aligner.alignEntries(entriesA, entriesB);
```

**Why this works:**
1. Backend TypeScript is compiled to `backend/dist/`
2. CLI imports the compiled `.js` files at runtime
3. Both CLI and backend use the exact same logic
4. No code duplication

### Build Process

```bash
# 1. Build backend (compiles TypeScript to dist/)
cd backend && npm run build

# 2. CLI can now import from backend/dist/
cd cli && npx tsx src/index.ts parse ...
```

## Code Reuse Verification

Run the verification script to ensure CLI properly reuses backend services:

```bash
cd cli
npm run verify:backend-reuse
```

This checks:
- ✅ CLI imports point to `backend/dist/` (not `backend/src/`)
- ✅ Backend modules are loadable at runtime
- ✅ No duplicated logic in CLI

## Benefits

1. **Single Source of Truth**: Parser, aligner, differ logic exists only in backend
2. **Consistency**: CLI and web use identical algorithms
3. **Maintainability**: Fix bugs in one place
4. **Type Safety**: Backend TypeScript provides type definitions

## Future Improvement: Core Package

In the future, we may extract core logic to a separate `@diffolio/core` package:

```
diffolio/
├── core/                      # Shared core logic (npm package)
│   ├── src/parser/
│   ├── src/aligner.ts
│   └── src/differ.ts
├── backend/                   # Depends on @diffolio/core
└── cli/                       # Depends on @diffolio/core
```

This would:
- Make dependencies explicit
- Enable versioning
- Allow independent testing
- Support npm publication

## Development Workflow

### When modifying backend services:

1. Edit source in `backend/src/services/`
2. Rebuild: `cd backend && npm run build`
3. CLI automatically uses updated compiled code
4. Test both web and CLI to ensure consistency

### When adding new CLI commands:

1. Check if logic exists in `backend/src/services/`
2. If yes: Import from `backend/dist/`
3. If no: Consider adding to backend first
4. Never duplicate business logic in CLI

## Troubleshooting

### "Cannot find module" errors

**Problem**: Backend not compiled

**Solution**:
```bash
cd backend && npm run build
```

### "Module has no exports" errors

**Problem**: Backend module doesn't export required functions

**Solution**: Check that backend source properly exports:
```typescript
// backend/src/services/aligner.ts
export function alignEntries(...) { ... }
export type ChangeType = ...
```

### Changes not reflected in CLI

**Problem**: Backend rebuilt but CLI still using old code

**Solution**: CLI loads modules at runtime, just ensure backend is built
```bash
# Verify backend is up to date
cd backend && npm run build

# CLI will pick up changes automatically
```
