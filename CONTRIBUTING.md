# Contributing Guidelines

## Development Principles

### 1. Configuration Over Hardcoding

**Rule**: All data processing rules, transformations, and sanitization logic MUST be configurable through format configuration files, NOT hardcoded in source code.

**Rationale**: Hardcoded rules make the system inflexible and difficult to adapt to different data sources. Configuration files allow users to customize behavior without modifying code.

**Examples**:
- Text sanitization rules (null byte removal, control character handling) → Configurable in `TaxonomyFormatConfig.textSanitization`
- Pattern matching rules (regex patterns for parsing) → Configurable in format config JSON
- Data transformations (traditional to simplified character mapping) → Configurable in `tradSimpMap`

**Example Configuration**:
```json
{
  "name": "义类词典-示例格式",
  "level1Pattern": "^[一二三四五六七八九十百千]+[、.．](.+)",
  "level2Pattern": "^([A-Z].+)",
  "level3Pattern": "^([a-z].+)",
  "level4Pattern": "^(\\d{2,3})\\s+(.+)",
  "headwordSeparator": "、",
  "skipLinePatterns": ["^\\s*$"],
  "textSanitization": {
    "enabled": true,
    "removeNullBytes": true,
    "removeControlChars": true,
    "customReplacements": [
      { "pattern": "\\\\x00", "replacement": "" },
      { "pattern": "[\\\\x01-\\\\x08]", "replacement": "" }
    ]
  }
}
```

**Implementation Guidelines**:
1. Define configuration interfaces in TypeScript with optional fields and sensible defaults
2. Use Zod schemas for runtime validation
3. Compile configuration into runtime-usable format (e.g., RegExp objects)
4. Default behavior should be safe (e.g., null byte removal enabled by default for PostgreSQL compatibility)
5. Document all configuration options with examples

### 2. Code Style

- Use TypeScript for all new code
- Follow existing naming conventions
- Add JSDoc comments for public functions
- Write tests for new functionality

### 3. Testing

- Run `npm test` before submitting PRs
- Add tests for new features
- Ensure type checking passes: `npm run typecheck`

### 4. Commit Messages

- Use clear, descriptive commit messages
- Reference issue numbers when applicable
- Keep commits focused on single changes

## Submitting Changes

1. Create a feature branch
2. Make your changes following the guidelines above
3. Run tests and type checking
4. Submit a pull request with clear description
