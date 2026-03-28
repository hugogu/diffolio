# Diffolio CLI

Standalone command-line interface for dictionary parsing, comparison, and export.

## Installation

```bash
# From npm (when published)
npm install -g @diffolio/cli

# From source
cd diffolio/cli
npm install
npm link  # or npm install -g
```

## Quick Start

```bash
# 1. Parse a dictionary file
diffolio parse \
  --file dictionary.txt \
  --config config.json \
  --database "file:./local.db" \
  --version-name "v1"

# 2. Query the parsed content
diffolio query \
  --database "file:./local.db" \
  --headword "爱"

# 3. Compare two versions
diffolio compare \
  --version-a "v1" \
  --version-b "v2" \
  --database "file:./local.db"

# 4. Export comparison results
diffolio export \
  --comparison-id "comp-id" \
  --output results.xlsx
```

## Commands

### `parse` - Parse Dictionary File

Parse a dictionary text file and save entries to database.

```bash
diffolio parse [options]
```

**Options:**
- `-f, --file <path>` - Dictionary file path (required)
- `-c, --config <path>` - Format configuration file (required)
- `-d, --database <url>` - Database connection URL (required)
- `-n, --version-name <name>` - Version identifier (required)
- `--format <type>` - File format: txt, docx, doc, pdf (auto-detected from extension)

**Examples:**

```bash
# Parse with SQLite (local development)
diffolio parse \
  -f ./dict/xinhua-v5.txt \
  -c ./configs/config-xhd5.json \
  -d "file:./data/dictionary.db" \
  -n "xinhua-v5"

# Parse with PostgreSQL
diffolio parse \
  -f ./dict/xinhua-v5.txt \
  -c ./configs/config-xhd5.json \
  -d "postgresql://user:pass@localhost:5432/dictdb" \
  -n "xinhua-v5"
```

**Database URL Formats:**
- SQLite: `file:./path/to/db.sqlite` or `file:./path/to/db.sqlite?connection_limit=1`
- PostgreSQL: `postgresql://user:password@host:port/database`

---

### `query` - Query Dictionary Content

Query parsed dictionary entries, senses, and examples.

```bash
diffolio query [options]
```

**Options:**
- `-d, --database <url>` - Database connection URL (required)
- `-w, --headword <text>` - Filter by headword (supports partial match)
- `-p, --phonetic <text>` - Filter by pinyin/pronunciation
- `--pos <type>` - Filter by part of speech (e.g., 名, 动, 形)
- `-v, --version-id <id>` - Query specific version only
- `--limit <n>` - Maximum results (default: 50)
- `--offset <n>` - Skip first N results (default: 0)
- `--format <type>` - Output format: table, json (default: table)

**Examples:**

```bash
# Query by headword
diffolio query -d "file:./data/db.sqlite" -w "爱"

# Query by pronunciation
diffolio query -d "file:./data/db.sqlite" -p "ài"

# Query with multiple filters
diffolio query -d "file:./data/db.sqlite" -w "爱" --pos "名" --format json

# Query specific version
diffolio query -d "file:./data/db.sqlite" -v "version-uuid" -w "好"
```

---

### `compare` - Compare Two Versions

Compare two dictionary versions and compute differences.

```bash
diffolio compare [options]
```

**Options:**
- `-a, --version-a <id>` - First version ID (required)
- `-b, --version-b <id>` - Second version ID (required)
- `-d, --database <url>` - Database connection URL (required)
- `-n, --name <name>` - Comparison task name (optional)

**Examples:**

```bash
# Compare two versions
diffolio compare \
  -a "xinhua-v5" \
  -b "xinhua-v6" \
  -d "file:./data/db.sqlite" \
  -n "v5-to-v6-comparison"

# The command outputs the comparison ID for later use
```

**Change Types:**
- `MATCHED` - Entry exists in both versions with same content
- `MATCHED_VARIANT` - Entry exists in both, different variants
- `ADDED` - Entry exists only in version B (new)
- `DELETED` - Entry exists only in version A (removed)

---

### `export` - Export Comparison Results

Export comparison results to Excel file.

```bash
diffolio export [options]
```

**Options:**
- `-c, --comparison-id <id>` - Comparison task ID (required)
- `-o, --output <path>` - Output file path (required)
- `-d, --database <url>` - Database connection URL (required)
- `--order-by <field>` - Sort order: headword, phonetic, change_type (default: headword)
- `--filter <type>` - Filter by change type: all, added, deleted, modified (default: all)

**Examples:**

```bash
# Export all results
diffolio export \
  -c "comparison-uuid" \
  -o "./results/comparison.xlsx" \
  -d "file:./data/db.sqlite"

# Export only modified entries, sorted by pinyin
diffolio export \
  -c "comparison-uuid" \
  -o "./results/modified.xlsx" \
  -d "file:./data/db.sqlite" \
  --order-by phonetic \
  --filter modified
```

**Output Format:**
The Excel file contains multiple sheets:
- **Summary** - Comparison overview and statistics
- **Alignments** - All entry alignments with change types
- **Details** - Sense-level differences

---

## Global Options

All commands support these global options:

- `-h, --help` - Show help for command
- `-V, --version` - Show CLI version
- `--verbose` - Enable verbose logging
- `--silent` - Suppress all output except errors

## Exit Codes

- `0` - Success
- `1` - General error
- `2` - Invalid arguments
- `3` - Database connection failed
- `4` - File not found
- `5` - Parse error
- `6` - Comparison failed
- `7` - Export failed

## Environment Variables

- `DIFFOLIO_DATABASE_URL` - Default database URL
- `DIFFOLIO_CONFIG_PATH` - Default config file path
- `DIFFOLIO_LOG_LEVEL` - Log level: debug, info, warn, error (default: info)

## Format Configuration

The `--config` file specifies how to parse dictionary files. Example:

```json
{
  "headwordPattern": "^([^【】\\s]+)",
  "senseNumberPatterns": ["([①②③④⑤])", "（([0-9]+)）"],
  "phoneticPattern": "【([^】]+)】",
  "posPattern": "^\\{([^}]+)\\}",
  "exampleSeparator": "｜"
}
```

See [Format Config Guide](../docs/format-config.md) for full documentation.

## Examples

### Complete Workflow

```bash
#!/bin/bash

# Setup
DB_URL="file:./my-dictionary.db"
CONFIG="./configs/xinhua-config.json"

# Parse version 1
diffolio parse \
  -f ./dicts/xinhua-v5.txt \
  -c "$CONFIG" \
  -d "$DB_URL" \
  -n "xinhua-v5"

# Parse version 2
diffolio parse \
  -f ./dicts/xinhua-v6.txt \
  -c "$CONFIG" \
  -d "$DB_URL" \
  -n "xinhua-v6"

# Compare versions
diffolio compare \
  -a "xinhua-v5" \
  -b "xinhua-v6" \
  -d "$DB_URL"

# Export results
diffolio export \
  -c "comparison-id-from-above" \
  -o "./comparison-results.xlsx" \
  -d "$DB_URL"
```

### Query Examples

```bash
# Find all entries starting with "爱"
diffolio query -d "$DB_URL" -w "爱%" --format json

# Find all nouns (名词)
diffolio query -d "$DB_URL" --pos "名" --limit 100

# Search by pronunciation
diffolio query -d "$DB_URL" -p "ài" --format table
```

## Troubleshooting

### Database Connection Issues

**Problem**: Cannot connect to database

**Solution**:
1. For SQLite: Ensure parent directory exists
2. For PostgreSQL: Verify connection string format
3. Check network/firewall for remote databases

### Parse Errors

**Problem**: Dictionary file fails to parse

**Solution**:
1. Verify format configuration matches file structure
2. Check file encoding (UTF-8 recommended)
3. Review error messages for specific line numbers
4. Use `--verbose` flag for detailed error info

### Performance Issues

**Problem**: Large files take too long to process

**Solution**:
1. Use SQLite for local development (faster than PostgreSQL over network)
2. Ensure adequate memory (minimum 2GB recommended)
3. Use SSD storage for database files
4. Progress indicators show current status

## Contributing

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for development setup and contribution guidelines.

## License

MIT License - see [LICENSE](../../LICENSE) for details.
