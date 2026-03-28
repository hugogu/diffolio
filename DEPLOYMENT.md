# 上线操作说明书

## 架构概览

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  frontend   │────▶│     api     │────▶│  postgres   │
│  (nginx:80) │     │ (node:3000) │     │  (pg:5432)  │
└─────────────┘     └──────┬──────┘     └─────────────┘
                           │                    ▲
                    ┌──────▼──────┐     ┌───────┴─────┐
                    │   worker    │────▶│    redis    │
                    │ (bullmq)    │     │  (6379 AOF) │
                    └─────────────┘     └─────────────┘
```

持久化 volumes：`postgres_data` / `redis_data` / `uploads_data`

数据库 migration 在 `api` 和 `worker` 容器**启动时自动运行**（`prisma migrate deploy`）。

---

## 首次上线

### 前提条件

- 服务器上已安装：`git`、`docker`（含 `docker compose` v2）
- 代码已推送到 Git 远端

### 1. 登录服务器，克隆代码

```bash
git clone <repo-url> /opt/diffolio
cd /opt/diffolio
```

### 2. 配置环境变量

```bash
cp .env.example .env
vim .env   # 按下方说明填写生产值
```

**必须修改的字段：**

| 变量 | 说明 | 示例 |
|------|------|------|
| `DATA_DIR` | 数据目录（postgres/redis/uploads）| `/mnt/data/diffolio` |
| `POSTGRES_PASSWORD` | 数据库密码（自定义强密码） | `s3cr3tP@ss` |
| `DATABASE_URL` | 必须与上面的密码保持一致 | `postgresql://dict:s3cr3tP@ss@postgres:5432/dictdb` |
| `APP_BASE_URL` | 对外访问域名（用于邮件链接） | `https://your-domain.com` |
| `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | 邮件服务（用于注册验证） | — |

> **重要**：`DATA_DIR` 应指向专用数据盘路径，确保该目录存在且 Docker 有读写权限：
> ```bash
> sudo mkdir -p /mnt/data/diffolio/{postgres,redis,uploads}
> sudo chown -R 1000:1000 /mnt/data/diffolio  # 或根据实际 UID/GID 调整
> ```

**可选配置（留空则使用默认值）：**

| 变量 | 默认行为 |
|------|----------|
| `SESSION_SECRET` | 留空：自动生成并持久化到 DB，重启不失效 |
| `UPLOAD_MAX_SIZE_MB` | 500 MB |
| `FRONTEND_PORT` | 5173（对外端口） |

### 3. 执行部署（一条命令）

```bash
APP_DIR=/opt/diffolio bash scripts/deploy-ecs.sh
```
或更明确的
```bash
IMAGE_TAG=930f093f docker compose -f docker-compose.prod.yml --env-file .env up -d 
```

脚本会依次完成：
1. `git pull` 最新代码
2. 创建 Docker 共享网络 `common_backend`
3. 构建镜像并启动所有服务（postgres → redis → api → worker → frontend）
4. `api` 容器启动时自动执行 `prisma migrate deploy` 建立完整数据库结构
5. 等待 `api` 健康检查通过，打印服务状态

### 4. 创建管理员账号

首次上线后运行一次：

```bash
cd /opt/diffolio/backend
docker compose exec api node dist/scripts/seed-admin.js
# 或直接传参（如脚本支持）：
docker compose exec api sh -c "node dist/scripts/seed-admin.js --email hugogu@outlook.com --password pass"
```

### 5. 验证上线

```bash
# 检查所有容器状态
docker compose ps

# 检查 API 健康接口
curl http://localhost:3000/api/v1/health

# 查看 api 日志（含 migration 输出）
docker compose logs api --tail=50
```

预期 `api` 日志输出（首次部署）：

```
Prisma Migrate applied the following migration(s):
  20260101000000_init
Fastify server listening on :3000
```

---

## 后续更新部署

代码有更新时，同样一条命令：

```bash
APP_DIR=/opt/diffolio bash scripts/deploy-ecs.sh
```

- 若有新 migration，`api` 启动时会自动执行
- 若无 schema 变更，`prisma migrate deploy` 会立即返回（幂等）

---

## 日常运维

### 查看日志

```bash
docker compose logs -f api        # API 实时日志
docker compose logs -f worker     # Worker 实时日志
docker compose logs --tail=100 api worker  # 最近 100 行
```

### 重启单个服务

```bash
docker compose restart api
docker compose restart worker
```

### 手动执行 migration（紧急情况）

```bash
docker compose exec api npx prisma migrate deploy
```

### 备份数据库

```bash
docker compose exec postgres pg_dump -U dict dictdb > backup_$(date +%Y%m%d).sql
```

### 恢复数据库

```bash
docker compose exec -T postgres psql -U dict dictdb < backup_20260101.sql
```

---

## 目录结构与数据持久化

所有数据通过 bind mount 挂载到 `DATA_DIR` 目录（默认 `/mnt/data/diffolio`）：

| 宿主机路径 | 容器内路径 | 用途 |
|-----------|-----------|------|
| `${DATA_DIR}/postgres` | `/var/lib/postgresql/data` | PostgreSQL 数据文件 |
| `${DATA_DIR}/redis` | `/data` | Redis AOF 持久化文件 |
| `${DATA_DIR}/uploads` | `/data/uploads` | 上传文件、导出文件（api + worker 共享）|

**备份策略**：直接备份整个 `DATA_DIR` 目录即可，无需操作 Docker volumes。

---

## 回滚

```bash
cd /opt/diffolio
git log --oneline -10        # 找到目标版本
git checkout <commit-hash>
APP_DIR=/opt/diffolio bash scripts/deploy-ecs.sh
```

> 注意：数据库 migration 只能前进，不支持自动回滚。如需回滚 schema 需手动操作 DB。

---

## 故障排查

| 现象 | 排查步骤 |
|------|----------|
| `api` 反复重启 | `docker compose logs api` — 通常是 DB 连接失败或 migration 错误 |
| migration 报错 | 检查 `DATABASE_URL` 是否与 `POSTGRES_PASSWORD` 匹配 |
| 邮件发不出去 | 检查 `SMTP_*` 配置；`docker compose logs api \| grep -i smtp` |
| 上传文件丢失 | 确认 `uploads_data` volume 存在：`docker volume ls` |
| 前端 502 | `api` 是否健康：`docker compose ps`；检查 `api` 端口是否为 3000 |
