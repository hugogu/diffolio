# Diffolio CLI User Guide

Complete guide for using the Diffolio command-line interface.

## Table of Contents

1. [Overview](#overview)
2. [Installation](#installation)
3. [Core Concepts](#core-concepts)
4. [Command Reference](#command-reference)
5. [Database Setup](#database-setup)
6. [Format Configuration](#format-configuration)
7. [Advanced Usage](#advanced-usage)
8. [Troubleshooting](#troubleshooting)

## Overview

Diffolio CLI provides local access to dictionary parsing and comparison capabilities without requiring a web server. It's designed for:

- **Dictionary editors** who need to parse and compare dictionary versions locally
- **Developers** integrating dictionary processing into automated workflows
- **Researchers** analyzing dictionary data programmatically
- **AI/MCP integration** (future) for automated dictionary processing

### Key Features

- 🚀 **Fast local processing** - No web server required
- 🔄 **Code sharing** - Uses same logic as online version
- 💾 **Flexible storage** - SQLite for local, PostgreSQL for production
- 📊 **Rich querying** - Filter by headword, pinyin, POS, etc.
- 📑 **Excel export** - Professional comparison reports
- 📈 **Progress tracking** - Real-time progress for long operations

## Installation

### Prerequisites

- Node.js 22 LTS or later
- npm 10 or later

### Install from Source

```bash
# Clone the repository
git clone https://github.com/hugogu/diffolio.git
cd diffolio/cli

# Install dependencies
npm install

# Link globally (optional, for global access)
npm link

# Or use npx
npx diffolio --help
```

### Verify Installation

```bash
diffolio --version
diffolio --help
```

## Core Concepts

### Dictionary Version

A **version** represents one parsed dictionary file. Each version has:
- Unique identifier (name or UUID)
- Format configuration used for parsing
- Timestamp of creation
- Collection of entries, senses, and examples

### Format Configuration

Format configurations tell the parser how to extract structured data from dictionary text files. They include:
- **Headword patterns** - How to identify entry headwords
- **Sense markers** - How to identify different senses (①, 1., etc.)
- **Pinyin patterns** - How to extract pronunciation
- **POS patterns** - How to identify parts of speech
- **Example separators** - How to split examples

### Comparison

A **comparison** analyzes differences between two versions:
- Entry-level alignment (which entries match, were added, or deleted)
- Sense-level differences (modified definitions, examples, etc.)
- Change type classification

## Command Reference

### parse

Parse a dictionary file and save structured data to database.

```bash
diffolio parse --file <path> --config <path> --database <url> --version-name <name>
```

**When to use**: Initial data ingestion, adding new dictionary versions.

**Workflow**:
1. Prepare dictionary text file (UTF-8 encoding)
2. Create or select format configuration
3. Run parse command
4. Verify results with query command

**Example Workflow**:

```bash
# Step 1: Parse the file
$ diffolio parse -f xinhua-v6.txt -c config.json -d file:./db.sqlite -n "v6"
✓ Parsing xinhua-v6.txt...
Progress: [████████████████████] 100% | 15432 entries | 2m 34s
✓ Parse complete!
  - Entries: 15,432
  - Senses: 42,891
  - Examples: 128,456

# Step 2: Verify with query
$ diffolio query -d file:./db.sqlite -w "爱"
+--------+--------+------+--------------------------------+
| Entry  | Phonetic| POS  | Definition                     |
+--------+--------+------+--------------------------------+
| 爱     | ài     | 动   | 对人或事物有很深的感情         |
+--------+--------+------+--------------------------------+
```

### query

Search and display dictionary content.

```bash
diffolio query --database <url> [filters...]
```

**When to use**: Verifying parse results, exploring dictionary data, finding specific entries.

**Common Queries**:

```bash
# Find exact headword
diffolio query -d file:./db.sqlite -w "爱情"

# Search partial matches
diffolio query -d file:./db.sqlite -w "爱%"

# Filter by part of speech
diffolio query -d file:./db.sqlite --pos "名" --limit 20

# Multiple filters
diffolio query -d file:./db.sqlite -w "爱" --pos "动" -p "ài"

# JSON output for processing
diffolio query -d file:./db.sqlite -w "爱" --format json | jq '.[0]'
```

### compare

Compare two dictionary versions and compute differences.

```bash
diffolio compare --version-a <id> --version-b <id> --database <url>
```

**When to use**: Identifying changes between dictionary editions, QA review, content migration.

**Comparison Process**:
1. Align entries between versions
2. Identify added/deleted entries
3. Compare senses for matched entries
4. Classify changes by type
5. Save results for export

**Example**:

```bash
$ diffolio compare -a "v5" -b "v6" -d file:./db.sqlite -n "v5-to-v6"
✓ Comparing versions...
Progress: [████████████████████] 100% | 15432 entries compared | 45s
✓ Comparison complete!
  - Total entries: 15,432
  - Matched: 14,890
  - Added: 342
  - Deleted: 200
  - Modified: 1,234

Comparison ID: comp-uuid-abc123
```

### export

Export comparison results to Excel.

```bash
diffolio export --comparison-id <id> --output <path> --database <url>
```

**When to use**: Creating reports for review, sharing with team members, archiving comparison results.

**Output Structure**:
- **Sheet 1: Summary** - Overview statistics
- **Sheet 2: Alignments** - Entry-level comparison
- **Sheet 3: Details** - Sense-level differences
- **Additional sheets** - Per-entry detail views (optional)

**Example**:

```bash
$ diffolio export -c "comp-uuid-abc123" -o "./v5-v6-comparison.xlsx" -d file:./db.sqlite
✓ Exporting comparison results...
Progress: [████████████████████] 100% | 15,432 rows | 1m 12s
✓ Export complete!
  - File: ./v5-v6-comparison.xlsx
  - Sheets: 3
  - Rows: 15,432
```

## Database Setup

### SQLite (Recommended for Local Development)

**Advantages**:
- No server setup required
- Single file (easy to backup/share)
- Good performance for local use
- Zero configuration

**Usage**:
```bash
# SQLite database file
diffolio parse -d "file:./my-dictionary.db" ...

# With connection limit (recommended)
diffolio parse -d "file:./my-dictionary.db?connection_limit=1" ...
```

**Setup**:
```bash
# Initialize database schema
npx prisma migrate deploy --schema=./backend/prisma/schema.prisma

# Or use db push for development
npx prisma db push --schema=./backend/prisma/schema.prisma
```

### PostgreSQL (Production/Team Use)

**Advantages**:
- Multi-user support
- Better performance for large datasets
- Centralized storage
- Backup/restore tools

**Usage**:
```bash
diffolio parse -d "postgresql://user:pass@localhost:5432/dictdb" ...
```

**Setup**:
```bash
# Create database
createdb dictdb

# Initialize schema
npx prisma migrate deploy --schema=./backend/prisma/schema.prisma
```

### Database Migration

Both SQLite and PostgreSQL use the same Prisma schema:

```bash
# Generate Prisma client
npx prisma generate --schema=./backend/prisma/schema.prisma

# Deploy migrations
npx prisma migrate deploy --schema=./backend/prisma/schema.prisma
```

## Format Configuration

Format configurations define how to parse dictionary text files.

### Basic Structure

```json
{
  "headwordPattern": "^([一-龥]+)",
  "senseNumberPatterns": ["([①②③④⑤])"],
  "phoneticPattern": "【([^】]+)】",
  "posPattern": "^\\{([^}]+)\\}",
  "registerPattern": "^〈([^〉]+)〉",
  "exampleSeparator": "｜"
}
```

### Pattern Reference

| Field | Description | Example |
|-------|-------------|---------|
| `headwordPattern` | Regex to match entry headwords | `"^([一-龥]+)"` |
| `senseNumberPatterns` | Array of regexes for sense markers | `["([①②③])", "([0-9]+\\.)"]` |
| `phoneticPattern` | Regex to extract pronunciation | `"【([^】]+)】"` |
| `posPattern` | Regex for part of speech | `"^\\{([^}]+)\\}"` |
| `registerPattern` | Regex for register/usage notes | `"^〈([^〉]+)〉"` |
| `exampleSeparator` | String separating examples | `"｜"` |

### Example Configurations

**Xinhua Dictionary Style**:
```json
{
  "headwordPattern": "^([一-龥]+)([1-9])?$",
  "senseNumberPatterns": ["([①②③④⑤⑥⑦⑧⑨⑩])"],
  "phoneticPattern": "【([^】]+)】",
  "posPattern": "^\\{([^}]+)\\}",
  "registerPattern": "^〈([^〉]+)〉",
  "exampleSeparator": "｜"
}
```

**Modern Dictionary Style**:
```json
{
  "headwordPattern": "^([一-龥]+)",
  "senseNumberPatterns": ["^([0-9]+)\\.", "^\\(([0-9]+)\\)"],
  "phoneticPattern": "\\[([^\\]]+)\\]",
  "posPattern": "^([a-z\\.]+)",
  "exampleSeparator": "；"
}
```

## Advanced Usage

### Batch Processing

Process multiple files in sequence:

```bash
#!/bin/bash

for file in ./dicts/*.txt; do
  version=$(basename "$file" .txt)
  echo "Processing: $version"
  diffolio parse \
    -f "$file" \
    -c ./config.json \
    -d file:./combined.db \
    -n "$version"
done
```

### Automated Comparisons

Compare all version pairs:

```bash
#!/bin/bash

versions=("v1" "v2" "v3")

for ((i=0; i<${#versions[@]}-1; i++)); do
  for ((j=i+1; j<${#versions[@]}; j++)); do
    v1="${versions[$i]}"
    v2="${versions[$j]}"
    echo "Comparing $v1 vs $v2"
    
    diffolio compare \
      -a "$v1" \
      -b "$v2" \
      -d file:./combined.db \
      -n "$v1-to-$v2"
  done
done
```

### Integration with Scripts

Parse JSON output for automation:

```bash
# Get entry count
COUNT=$(diffolio query -d file:./db.sqlite --format json | jq length)
echo "Total entries: $COUNT"

# Find all modified entries in comparison
diffolio export -c "$COMP_ID" -o - --format json | \
  jq '.[] | select(.changeType == "MODIFIED")'
```

### Environment-Based Configuration

Use environment variables for cleaner commands:

```bash
# .env file
export DIFFOLIO_DATABASE_URL="file:./my-dictionary.db"
export DIFFOLIO_CONFIG_PATH="./configs/xinhua.json"

# Now use shorter commands
diffolio parse -f dict.txt -n "v1"
diffolio query -w "爱"
```

## Troubleshooting

### Common Issues

#### "Database connection failed"

**Cause**: Invalid connection string or database doesn't exist

**Solutions**:
- For SQLite: Ensure parent directory exists
- For PostgreSQL: Verify credentials and network access
- Check connection string format

#### "Parse error at line X"

**Cause**: Format configuration doesn't match file structure

**Solutions**:
1. Review error message for line number
2. Check file at that line
3. Adjust regex patterns in config
4. Use `--verbose` for detailed error info

#### "Out of memory"

**Cause**: Large file consuming too much RAM

**Solutions**:
- Increase Node.js memory: `node --max-old-space-size=4096`
- Use streaming mode (if available)
- Process file in chunks

#### "Version not found"

**Cause**: Referenced version doesn't exist in database

**Solutions**:
- List available versions with query
- Check version name/ID spelling
- Ensure database connection is correct

### Debug Mode

Enable verbose logging:

```bash
diffolio parse -f file.txt ... --verbose
```

Or set environment variable:

```bash
export DIFFOLIO_LOG_LEVEL=debug
diffolio parse -f file.txt ...
```

### Getting Help

1. **Command help**: `diffolio <command> --help`
2. **This guide**: Full documentation above
3. **Examples**: See `cli/README.md`
4. **Issues**: https://github.com/hugogu/diffolio/issues

## Best Practices

1. **Use SQLite for local development** - Faster setup, easier to manage
2. **Version your databases** - Keep backups before major operations
3. **Test with small samples first** - Verify config works before processing full dataset
4. **Use meaningful version names** - "xinhua-v6-2024" is better than "v1"
5. **Export regularly** - Create Excel backups of important comparisons
6. **Monitor progress** - Long operations show progress bars; don't interrupt
7. **Validate results** - Use query command to spot-check parsed data

## Next Steps

- Review [Format Configuration Examples](../backend/samples/)
- Explore [API Documentation](../CLAUDE.md)
- Check out [Contributing Guide](../CONTRIBUTING.md)
