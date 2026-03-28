# diffolio Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-02-25

## Active Technologies
- TypeScript 5.x (backend Fastify + Prisma; frontend Vue 3.5) + BullMQ (async import), Prisma (ORM), Fastify (HTTP), Vue 3.5 + Pinia (frontend), ExcelJS (export) (003-semantic-taxonomy)
- PostgreSQL (existing); 4 new tables (TaxonomySource, TaxonomyImportTask, TaxonomyNode, TaxonomyEntry) (003-semantic-taxonomy)
- TypeScript 5.x (Node.js 24 LTS backend); Vue 3.5 + TypeScript 5.x (frontend) + Fastify + @fastify/session (existing), Prisma + PostgreSQL (existing), BullMQ + Redis (existing), bcryptjs (existing), Zod (existing), nodemailer (new — SMTP email delivery) (004-multi-user-auth)
- PostgreSQL — 3 schema changes (users table: 8 new columns; dictionaries + taxonomy_sources: 1 new FK each; 1 new table: system_settings) (004-multi-user-auth)
- TypeScript 5.x (Node.js 24 LTS backend), TypeScript 5.x + Vue 3.5 (frontend) + Fastify (HTTP), Prisma + PostgreSQL (ORM/storage), BullMQ + Redis (job (005-coffee-subscription)
- PostgreSQL — 6 new tables (user_subscriptions, energy_balances, energy_events, (005-coffee-subscription)
- TypeScript 5.x (Node.js 24 LTS backend; Vue 3.5 frontend) + Fastify + Prisma (backend); Vue 3.5 + Pinia + Element Plus (frontend) (007-config-management)
- PostgreSQL via Prisma ORM — 3 新表 + 2 枚举 + format_configs 新增 2 字段 (007-config-management)

- Node.js 22 LTS + TypeScript 5.x (backend); Vue 3.5 + TypeScript 5.x (frontend) (001-dict-version-compare)

## Project Structure

```text
src/
tests/
```

## Commands

npm test && npm run lint

## Code Style

Node.js 22 LTS + TypeScript 5.x (backend); Vue 3.5 + TypeScript 5.x (frontend): Follow standard conventions

### Database Schema & Migrations

- **Always use the migration system** for schema changes in projects that already have migrations in place (Prisma). Do NOT write raw SQL `ALTER TABLE` statements unless explicitly requested.
- **Naming convention**: All table names and column names must use `snake_case` (e.g., `user_id`, `created_at`, `entry_alignments`). Never use `camelCase` in the database.
- **Consistency**: Follow the existing naming convention of the project. If it's snake_case, stay with snake_case everywhere.

## Recent Changes
- 007-config-management: Added TypeScript 5.x (Node.js 24 LTS backend; Vue 3.5 frontend) + Fastify + Prisma (backend); Vue 3.5 + Pinia + Element Plus (frontend)
- 005-coffee-subscription: Added TypeScript 5.x (Node.js 24 LTS backend), TypeScript 5.x + Vue 3.5 (frontend) + Fastify (HTTP), Prisma + PostgreSQL (ORM/storage), BullMQ + Redis (job
- 004-multi-user-auth: Added TypeScript 5.x (Node.js 24 LTS backend); Vue 3.5 + TypeScript 5.x (frontend) + Fastify + @fastify/session (existing), Prisma + PostgreSQL (existing), BullMQ + Redis (existing), bcryptjs (existing), Zod (existing), nodemailer (new — SMTP email delivery)


<!-- MANUAL ADDITIONS START -->

## Key File Locations

### Backend Parser Pipeline
- `backend/src/services/parser/types.ts` — `ParsedSense` (phonetic, grammaticalCat, register…), `ParsedEntry`
- `backend/src/services/parser/inline-sense.ts` — `extractInlineSenses()`, `extractRegister()`, `extractSensePhonetic()`, `extractPos()`; per-sense pipeline: register → sensePhonetic → POS → definition
- `backend/src/services/config-engine.ts` — `FormatConfigJson` interface, `CompiledConfig`, `validateConfig()`, `compileConfig()`
- `backend/src/workers/parse.worker.ts` — writes Entry + Sense + Example records to DB
- `backend/src/workers/export.worker.ts` — generates Excel; `senseFullText()` for cell content
- `backend/src/workers/comparison.worker.ts` — computes EntryAlignment + SenseDiff records

### Backend Routes
- `backend/src/routes/comparisons.ts` — alignments: page-based pagination (page/pageSize → total/totalPages)
- `backend/src/routes/exports.ts` — POST create export; GET `.../exports/latest` (persists download link); GET download
- `backend/src/routes/versions.ts` — parse-preview endpoint; file download; POST .../config/apply (snapshot pattern)
- `backend/src/routes/system-configs.ts` — GET list (visibility-filtered) + GET /:id + POST /:id/clone
- `backend/src/routes/user-configs.ts` — full CRUD: GET list, GET /:id, POST, PATCH /:id, DELETE /:id
- `backend/src/routes/admin/system-configs.ts` — admin CRUD + PUT /:id/visibility
- `backend/src/lib/config-ownership.ts` — `assertUserConfigOwner()`, `assertSystemConfigVisible()` helpers

### Config Management System (007-config-management)
- `frontend/src/pages/admin/ConfigManagementPage.vue` — `/admin/configs`; tabs: 我的配置 (CRUD) + 系统配置 (view/clone)
- `frontend/src/pages/admin/AdminSystemConfigsPage.vue` — `/admin/system-configs`; admin-only CRUD + visibility mgmt
- `frontend/src/pages/admin/VersionDetailPage.vue` — grouped el-select for system/user configs; apply → snapshot
- `frontend/src/stores/configs.ts` — Pinia store: systemConfigs, userConfigs; load/apply/CRUD/clone actions
- `frontend/src/api/configs.ts` — typed API client for all config endpoints (user + system + admin)
- `backend/src/scripts/seed-system-configs.ts` — migrates backend/samples/*.json → system_format_configs table

### Frontend Key Files
- `frontend/src/pages/ComparisonDetailPage.vue` — el-pagination, change-type filter, tabs (sense-tree / examples)
- `frontend/src/components/diff/SideBySideView.vue` — vxe-table, dynamic row height, 词头 col, merged 变更 col (全匹配/有变更)
- `frontend/src/components/diff/ExportDownloadButton.vue` — fetches latest export on mount (link persists across refreshes); taxonomy order selector via el-popover
- `frontend/src/stores/comparisons.ts` — alignmentsTotal, alignmentsTotalPages, alignmentsPage

### Taxonomy System (003-semantic-taxonomy)
- `backend/src/services/taxonomy/config.ts` — `TaxonomyFormatConfig`, `validateTaxonomyConfig()`, `compileTaxonomyConfig()`, `normalizeHeadword()`
- `backend/src/services/taxonomy/parser.ts` — `parseTaxonomyFile()` async generator; 4-level tree with zero-padded materialized paths
- `backend/src/services/taxonomy/tree.ts` — `getSubtreeNodeIds()`, `getSubtreeHeadwords()` for filtering
- `backend/src/workers/taxonomy.worker.ts` — BullMQ worker for async taxonomy import
- `backend/src/routes/taxonomy.ts` — all taxonomy CRUD + tree + node edit + entry edit endpoints
- `frontend/src/stores/taxonomy.ts` — Pinia store for taxonomy sources, trees, entries
- `frontend/src/api/taxonomy.ts` — typed API client for all taxonomy endpoints
- `frontend/src/pages/admin/TaxonomyPage.vue` — source list + upload dialog + polling
- `frontend/src/pages/admin/TaxonomyEditPage.vue` — editor page wrapper
- `frontend/src/components/taxonomy/` — TaxonomyTreeBrowser, TaxonomyFilterPanel, TaxonomyOrderSelector, TaxonomyTreeEditor

### Multi-User Auth System (004-multi-user-auth)
- `backend/src/lib/session-secret.ts` — auto-generates/persists SESSION_SECRET in `system_settings` table if not set
- `backend/src/lib/password-validator.ts` — Zod-based validator (8+ chars, upper/lower/digit/special)
- `backend/src/lib/ownership.ts` — `assertDictionaryOwner`, `assertVersionOwner`, `assertComparisonOwner`, `assertTaxonomySourceOwner` helpers
- `backend/src/lib/email.ts` — nodemailer wrapper for verification emails; SMTP from env vars
- `backend/src/workers/email.worker.ts` — BullMQ worker on `email` queue for async email delivery
- `backend/src/routes/admin/users.ts` — GET/PATCH admin user management routes (ADMIN-only)
- `backend/src/scripts/seed-admin.ts` — CLI script: `node dist/scripts/seed-admin.js --email x --password y`
- `frontend/src/pages/RegisterPage.vue` — registration form with email+password
- `frontend/src/pages/VerifyEmailPage.vue` — reads `?token` from URL, calls verify-email API
- `frontend/src/pages/admin/UserManagementPage.vue` — paginated user table with filter/edit
- `frontend/src/components/admin/UserEditDialog.vue` — edit role, exportEnabled, maxVersions, maxBooks, canEditBuiltinConfigs
- `frontend/src/api/admin.ts` — `listAdminUsers()`, `getAdminUser()`, `updateAdminUser()` typed functions
- `backend/.env.example` — documents all env vars including new SMTP_* and APP_BASE_URL vars

## Sample Format Configs — `backend/samples/`

| File | 辞书 | 义项标记 | 词性格式 | 义项拼音 | 词条序号 |
|------|------|----------|----------|----------|----------|
| config-xhd5.json | 示例词典-圆圈序号版 | ①②③ | `名\|动\|形` | — | 可选（如埃1、埃2） |
| config-xhd7.json | 示例词典-括号序号版 | （1）（2） | `{名}` | `(Gē)` style | 可选（如蔼1、蔼2） |
| config-v1/v2.json | 旧版 | ①/数字 | — | `[拼音]` 括号格式 | — |

## Format Config Fields Reference

```json
{
  "headwordPattern": "正则，捕获词头",
  "entrySequencePattern": "正则，捕获词条序号如 \"([1-9])$\" 匹配蔼1蔼2",
  "senseNumberPatterns": ["正则[]，匹配①/（1）/1.等标记"],
  "phoneticPattern": "正则，词条级拼音（接在词头/】之后）",
  "sensePhoneticPattern": "正则，义项级拼音，如 ^\\(([^)]+)\\)\\s* 匹配 (Gē)",
  "posPattern": "正则，^{名} 或 ^名 等，从义项头提取词性",
  "registerPattern": "正则，^〈方〉 等使用域标注",
  "headwordVariantSuffixPattern": "正则，词头后的变体标注如 (呵)",
  "crossReferencePattern": "正则，另见… 行",
  "skipLinePatterns": ["正则[]，跳过的行，如纯拼音小节头"],
  "exampleSeparator": "字符串，例句分隔符如 ｜",
  "substitutionRules": [{"symbol": "～", "expandTo": "headword"}],
  "glyphVariants": [{"canonical": "爱", "variants": ["愛"]}],
  "tradSimpMap": {"愛": "爱"}
}
```

## Infrastructure

### Docker
- Postgres 直连：`docker exec diffolio-postgres-1 psql -U dict -d dictdb`
- Schema 变更（无 migration 文件）：直接 `ALTER TABLE senses ADD COLUMN IF NOT EXISTS phonetic TEXT;`
- 重建并重启：`docker compose build api worker && docker compose up -d api worker`
- `prisma migrate dev` 在容器内不可用（非交互式环境 + schema engine 仅有 openssl-1.1.x 二进制）

### DB 关键模型字段
- `Entry`：rawHeadword, normalizedHeadword, entrySequence（词条序号1/2/3）, phonetic（词条级）
- `Sense`：rawNumber, normalizedNumber, definition, phonetic（义项级）, grammaticalCat, register, position
- `EntryAlignment`：changeType (MATCHED/ADDED/DELETED/MATCHED_VARIANT)
- `ExportJob`：downloadPath, downloadUrl, expiresAt（null = 永不过期）, orderBy, taxonomySourceId
- `TaxonomySource`：name, status (PENDING/IMPORTING/ACTIVE/FAILED), configJson, totalEntries
- `TaxonomyNode`：level (1-4), label, sequencePosition, path（零填充物化路径如 "0000/0001/0002"）
- `TaxonomyEntry`：headword, normalizedHeadword, sequencePosition, nodeId, taxonomySourceId

## Development Operations Guide

### 常用操作

#### 1. 容器管理

```bash
# 查看运行状态
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# 重启 API 服务
docker compose up -d api

# 查看日志
docker logs diffolio-api-1 --tail 50
docker logs diffolio-worker-1 --tail 50

# 进入容器
docker exec -it diffolio-api-1 sh
docker exec -it diffolio-postgres-1 psql -U dict -d dictdb
```

#### 2. 数据库操作

```bash
# 连接数据库
docker exec -it diffolio-postgres-1 psql -U dict -d dictdb

# 常用查询
## 查看对比任务
SELECT id, status, "version_a_id", "version_b_id" FROM comparisons LIMIT 5;

## 查看对齐结果统计
SELECT "change_type", COUNT(*) FROM entry_alignments WHERE "comparison_id" = 'UUID' GROUP BY "change_type";

## 查看用户
SELECT email, role, email_verified FROM users;

## 更新密码（生成 bcrypt hash）
# 在容器内运行:
docker exec diffolio-api-1 node -e "const bcrypt = require('bcryptjs'); bcrypt.hash('YourPassword123!', 12).then(h => console.log(h));"

# 然后更新数据库（注意：使用单引号包裹 hash）
UPDATE users SET "passwordHash" = '$2a$12$...' WHERE email = 'user@example.com';
```

#### 3. 用户认证测试

```bash
# 1. 登录获取 session cookie
curl -s -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"YourPassword123!"}' \
  -c /tmp/cookies.txt

# 2. 使用 cookie 访问受保护接口
curl -s "http://localhost:3000/api/v1/comparisons" \
  -b /tmp/cookies.txt | jq

# 3. 测试对齐接口（注意 URL 编码）
curl -s "http://localhost:3000/api/v1/comparisons/COMPARISON_ID/alignments?page=1&pageSize=5&headword=%E9%98%BF" \
  -b /tmp/cookies.txt | jq
```

#### 4. 代码修改后的部署

```bash
# 修改代码后需要重建容器
docker compose build api
docker compose up -d api

# 或者完整重建
docker compose build
docker compose up -d
```

#### 5. Prisma 操作

```bash
# 生成客户端（在容器内）
docker exec diffolio-api-1 npx prisma generate

# 数据库迁移（在容器内）
docker exec diffolio-api-1 npx prisma migrate deploy

# 查看数据库结构
docker exec diffolio-api-1 npx prisma studio
```

### 常见问题和调试

#### 认证失败 (401 Unauthorized)

1. 检查 session cookie 是否存在：`cat /tmp/cookies.txt`
2. 检查用户 email 是否已验证：`SELECT email_verified FROM users WHERE email = 'xxx';`
3. 检查密码 hash 是否正确比较（在容器内测试）

#### 接口返回 400 Bad Request

1. 检查请求参数是否正确 URL 编码（中文需要编码，`阿` → `%E9%98%BF`）
2. 检查请求体 JSON 格式
3. 查看 API 日志：`docker logs diffolio-api-1 --tail 50`

#### Prisma 查询错误

**问题**: `Argument where of type EntryAlignmentWhereInput needs at least one argument.`

**解决**: 检查 nullable 关系字段的查询语法（entryA/entryB 可能为 null）：

```typescript
// 错误 - entryA 为 null 时会失败
{ entryA: { rawHeadword: { contains: 'xxx' } } }

// 正确 - 使用 is: 语法处理 nullable 关系
{ entryA: { is: { rawHeadword: { contains: 'xxx' } } } }

// 完整过滤条件示例
where.AND = [{
  OR: [
    { entryA: { is: { rawHeadword: { contains: searchTerm } } } },
    { entryB: { is: { rawHeadword: { contains: searchTerm } } } },
  ]
}]
```

#### 密码 Hash 问题

bcrypt hash 在 shell 中传递时需要正确处理 `$` 字符：

```bash
# 错误 - shell 会展开 $
HASH='$2a$12$xxx'
docker exec ... psql -c "UPDATE ... '$HASH'"

# 正确 - 在 psql 中直接设置
docker exec diffolio-postgres-1 psql -U dict -d dictdb -c "UPDATE users SET \"passwordHash\" = '$HASH' WHERE email = 'xxx';"

# 或者使用生成的 hash（通过容器内 node）
docker exec diffolio-api-1 node -e "const bcrypt = require('bcryptjs'); bcrypt.hash('pass', 12).then(h => console.log('PLAIN:' + h));"
```

### 重要提示

1. **数据库列名**: Prisma 使用 camelCase，但 PostgreSQL 实际列名可能是 snake_case（如 `userId` → `user_id`）
2. **URL 编码**: 中文参数需要 URL 编码，使用 `encodeURIComponent()` 或手动编码
3. **Session 持久化**: 使用 cookie 文件（`-c`）保存 session，后续请求使用 `-b` 带上
4. **容器内执行**: Node.js 和 Prisma 命令需要在容器内执行，因为数据库连接字符串指向容器网络（`postgres:5432`）
5. **Prisma Migrate**: `prisma migrate dev` 在容器内不可用（非交互式环境），使用 `prisma migrate deploy` 代替

<!-- MANUAL ADDITIONS END -->
