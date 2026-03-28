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
