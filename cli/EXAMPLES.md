# Diffolio CLI Examples

Real-world usage examples for common dictionary workflows.

## Complete Workflow Example

```bash
#!/bin/bash

# Setup
DB_URL="file:./my-dictionary.db"
CONFIG="./configs/xinhua-config.json"

# Step 1: Parse first version
diffolio parse \
  -f ./dicts/xinhua-v5.txt \
  -c "$CONFIG" \
  -d "$DB_URL" \
  -n "xinhua-v5"

# Step 2: Parse second version
diffolio parse \
  -f ./dicts/xinhua-v6.txt \
  -c "$CONFIG" \
  -d "$DB_URL" \
  -n "xinhua-v6"

# Step 3: Compare versions
diffolio compare \
  -a "xinhua-v5" \
  -b "xinhua-v6" \
  -d "$DB_URL" \
  -n "v5-to-v6-comparison"

# Step 4: Export results
diffolio export \
  -c "comparison-id-from-above" \
  -o "./comparison-results.xlsx" \
  -d "$DB_URL"
```

## Query Examples

### Find entries by headword
```bash
# Exact match
diffolio query -d "$DB_URL" -w "爱"

# Prefix search (all entries starting with "爱")
diffolio query -d "$DB_URL" -w "爱%"

# JSON output for processing
diffolio query -d "$DB_URL" -w "爱" --format json
```

### Find entries by pinyin
```bash
diffolio query -d "$DB_URL" -p "ài"
```

### Filter by part of speech
```bash
# Find all nouns (名词)
diffolio query -d "$DB_URL" --pos "名" --limit 100

# Find all verbs (动词) starting with "打"
diffolio query -d "$DB_URL" -w "打%" --pos "动"
```

### Query comparison results
```bash
# Show all added entries
diffolio query -d "$DB_URL" \
  --comparison-id "comp-xxx" \
  --change-type ADDED

# Show modifications with details
diffolio query -d "$DB_URL" \
  --comparison-id "comp-xxx" \
  --change-type MATCHED \
  --detail
```

## Export Examples

### Export all results
```bash
diffolio export \
  -c "comparison-id" \
  -o "./full-results.xlsx" \
  -d "$DB_URL"
```

### Export only changes, sorted by pinyin
```bash
diffolio export \
  -c "comparison-id" \
  -o "./changes.xlsx" \
  -d "$DB_URL" \
  --order-by phonetic \
  --filter modified
```

### Export only new entries
```bash
diffolio export \
  -c "comparison-id" \
  -o "./new-entries.xlsx" \
  -d "$DB_URL" \
  --filter added
```

## Batch Processing

### Process multiple dictionary files
```bash
for file in ./dicts/*.txt; do
  version=$(basename "$file" .txt)
  echo "Processing: $version"
  diffolio parse \
    -f "$file" \
    -c ./config.json \
    -d "$DB_URL" \
    -n "$version"
done
```

### Compare all version pairs
```bash
versions=("v1" "v2" "v3")

for ((i=0; i<${#versions[@]}-1; i++)); do
  for ((j=i+1; j<${#versions[@]}; j++)); do
    v1="${versions[$i]}"
    v2="${versions[$j]}"
    echo "Comparing $v1 vs $v2"
    
    diffolio compare \
      -a "$v1" \
      -b "$v2" \
      -d "$DB_URL" \
      -n "$v1-to-$v2"
  done
done
```

## Integration with Scripts

### Parse and validate
```bash
#!/bin/bash

CONFIG="$1"
FILE="$2"
VERSION="$3"
DB="file:./test.db"

# Parse
diffolio parse -f "$FILE" -c "$CONFIG" -d "$DB" -n "$VERSION"

# Query to verify
COUNT=$(diffolio query -d "$DB" --version-id "$VERSION" --format json | jq length)
echo "Parsed $COUNT entries"
```

### Export and email (requires mail command)
```bash
#!/bin/bash

COMPARISON_ID="$1"
RECIPIENT="$2"

OUTPUT="/tmp/comparison-$(date +%Y%m%d).xlsx"

diffolio export \
  -c "$COMPARISON_ID" \
  -o "$OUTPUT" \
  -d "$DATABASE_URL"

echo "Comparison results attached" | \
  mail -s "Dictionary Comparison Results" \
  -A "$OUTPUT" \
  "$RECIPIENT"
```

## Advanced Usage

### Using environment variables
```bash
# Create .env file
cat > .env << 'EOF'
DATABASE_URL="file:./dict.db"
DIFFOLIO_CONFIG_PATH="./config.json"
DIFFOLIO_LOG_LEVEL="debug"
EOF

# Source and run
set -a
source .env
set +a

diffolio query -w "爱"
```

### Pagination for large result sets
```bash
# Get first 50
diffolio query -d "$DB_URL" --limit 50 --offset 0

# Get next 50
diffolio query -d "$DB_URL" --limit 50 --offset 50

# Loop through all results
offset=0
limit=50
while true; do
  results=$(diffolio query -d "$DB_URL" --limit $limit --offset $offset --format json)
  count=$(echo "$results" | jq length)
  
  if [ "$count" -eq 0 ]; then
    break
  fi
  
  echo "Processing entries $offset to $((offset + count))"
  # Process results...
  
  offset=$((offset + limit))
done
```

## Tips and Tricks

### Silent mode for scripts
```bash
# Only show errors
diffolio parse -f dict.txt -c config.json -d "$DB_URL" -n "v1" --silent
```

### Verbose mode for debugging
```bash
# Show detailed output
diffolio parse -f dict.txt -c config.json -d "$DB_URL" -n "v1" --verbose
```

### Use with jq for JSON processing
```bash
# Get all headwords
diffolio query -d "$DB_URL" --format json | jq -r '.[].headword'

# Filter and count
diffolio query -d "$DB_URL" --pos "名" --format json | jq 'length'
```

### Backup before operations
```bash
# Backup SQLite database
cp data/dictionary.db "data/dictionary-$(date +%Y%m%d).db"

# Then run operations...
```
