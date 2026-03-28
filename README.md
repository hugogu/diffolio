# 辞书版本对比分析平台

A full-stack web platform for comparing dictionary versions — parsing uploaded files, aligning entries across versions, computing sense-level diffs, and exporting results to Excel.

## Quick Start

```bash
# Clone and enter the repo
git clone <repo-url> && cd diffolio

# Copy environment template
cp .env.example .env

# Start all services (postgres, redis, api, worker, frontend)
docker compose up
```

Wait for `api` to print `Fastify server listening on :3000`, then:

```bash
# Create the admin user (first run only)
docker compose exec api npm run seed:admin
# → Creates: admin@localhost.com / Changeme!23
```

Open **http://localhost:5173** and log in.

---

## Environment Variables

All settings are configured via `.env` (copy from `.env.example`):

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgresql://dict:dict@postgres:5432/dictdb` | PostgreSQL connection string |
| `REDIS_URL` | `redis://redis:6379` | Redis connection string |
| `SESSION_SECRET` | `change-me-in-production` | Cookie session secret (change in production) |
| `FILE_STORAGE_TYPE` | `local` | Storage backend: `local` or `s3` |
| `FILE_STORAGE_LOCAL_PATH` | `/data/uploads` | Path for uploaded files (local mode) |
| `FILE_STORAGE_S3_BUCKET` | — | S3 bucket name (s3 mode) |
| `FILE_STORAGE_S3_REGION` | — | S3 region (s3 mode) |
| `UPLOAD_MAX_SIZE_MB` | `500` | Max upload file size in MB |
| `API_PORT` | `3000` | Backend API port |
| `FRONTEND_PORT` | `5173` | Frontend port |
| `DIFF_API_RATE_LIMIT_PER_MINUTE` | `60` | Rate limit for the batch diff API |

---

## API Reference

Key endpoints:

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/v1/auth/login` | — | Log in, returns session cookie |
| `GET` | `/api/v1/dictionaries` | — | List dictionaries (paginated) |
| `POST` | `/api/v1/dictionaries` | ADMIN | Create dictionary |
| `POST` | `/api/v1/dictionaries/:id/versions` | ADMIN | Create version |
| `POST` | `/api/v1/versions/:id/upload` | ADMIN | Upload & parse file |
| `GET` | `/api/v1/parse-tasks/:id` | Auth | Parse task status |
| `POST` | `/api/v1/comparisons` | Auth | Start comparison job |
| `GET` | `/api/v1/comparisons/:id/alignments` | Auth | Paginated alignments |
| `POST` | `/api/v1/comparisons/:id/exports` | Auth | Export to Excel |
| `GET` | `/api/v1/search/headword?q=` | — | Search headwords across versions |
| `POST` | `/api/v1/diff/batch` | — | Batch diff (rate limited) |
| `GET` | `/api/v1/health` | — | Health check |

---

## Project Structure

```
diffolio/
├── backend/                  # Fastify + TypeScript API + BullMQ workers
│   ├── src/
│   │   ├── routes/           # HTTP route handlers
│   │   ├── services/         # aligner.ts, differ.ts, config-engine.ts
│   │   ├── workers/          # BullMQ worker processes
│   │   ├── lib/              # auth-guard, errors, pagination, storage
│   │   └── plugins/          # prisma, bullmq, socketio plugins
│   ├── prisma/schema.prisma  # Database schema
│   └── samples/              # Sample dictionary files for quickstart
├── frontend/                 # Vue 3 + Element Plus SPA
│   └── src/
│       ├── pages/            # Route-level page components
│       ├── components/       # Shared UI components
│       ├── stores/           # Pinia state management
│       └── api/              # Typed API clients
├── cli/                      # Standalone CLI tool for local use
│   ├── src/commands/         # CLI commands (parse, query, compare, export)
│   ├── src/lib/              # Shared utilities
│   └── README.md             # CLI documentation
├── docker-compose.yml        # Service definitions
└── docker-compose.override.yml # Development overrides (hot reload)
```

---

## Development

```bash
# Start with hot reload
docker compose up

# Run DB schema push (from host, using exposed port 5432)
cd backend && DATABASE_URL=postgresql://dict:dict@localhost:5432/dictdb npx prisma db push

# Type-check
cd backend && npm run typecheck
cd ../frontend && npm run typecheck
```

---

## CLI Tool

Diffolio also provides a standalone CLI tool for local dictionary processing without requiring a web server.

### Features

- 🚀 **Fast local processing** - No Docker or web server needed
- 🔄 **Code sharing** - Uses same parsing/comparison logic as web version
- 💾 **Flexible storage** - SQLite for local development, PostgreSQL for production
- 📊 **Rich querying** - Filter by headword, pinyin, POS, etc.
- 📑 **Excel export** - Professional comparison reports

### Quick Start

```bash
cd cli

# Install dependencies
npm install

# Copy Prisma client from backend
npm run prisma:copy

# Parse a dictionary
cd cli && npx tsx src/index.ts parse \
  -f ../backend/samples/sample-dict.txt \
  -c ../backend/samples/config-v1.json \
  -d "file:./test.db" \
  -n "v1"

# Query entries
npx tsx src/index.ts query -d "file:./test.db" -w "爱"

# Compare versions
npx tsx src/index.ts compare -a "v1" -b "v2" -d "file:./test.db"

# Export to Excel
npx tsx src/index.ts export -c "comparison-id" -o results.xlsx -d "file:./test.db"
```

### Documentation

- [CLI README](cli/README.md) - Installation and command reference
- [CLI User Guide](docs/cli/README.md) - Detailed usage guide
- [Examples](cli/EXAMPLES.md) - Real-world usage examples

### Commands

| Command | Description |
|---------|-------------|
| `parse` | Parse dictionary files (txt, docx, doc, pdf) |
| `query` | Query parsed content or comparison results |
| `compare` | Compare two dictionary versions |
| `export` | Export comparison results to Excel |

See `cli/README.md` for detailed documentation.
