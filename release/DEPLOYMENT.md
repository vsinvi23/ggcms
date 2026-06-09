# GG-CMS Deployment Guide

## Release folder structure

```
release/
├── build.sh / build.ps1            ← BUILD entry point (run first)
├── deploy.sh / deploy.ps1          ← DEPLOY full stack  (UI + API + DBs)
├── deploy-backend.sh / .ps1        ← DEPLOY backend only (API + DBs)
│
├── docker-compose.yml              ← Full-stack compose (UI + API + DBs)
├── docker-compose.backend.yml      ← Backend-only compose (API + DBs)
│
├── .env.example                    ← Copy to .env and fill in secrets
├── .env                            ← Your secrets (NOT committed to git)
│
├── config/
│   ├── backend/
│   │   ├── app.env.example         ← Template; copy to app.env
│   │   └── app.env                 ← Runtime overrides (mounted into backend container)
│   └── frontend/
│       └── nginx.conf              ← Nginx routing config (mounted into frontend container)
│
├── docker/
│   ├── backend.Dockerfile          ← Reference copy of Go backend Dockerfile
│   └── frontend.Dockerfile         ← Reference copy of React/Nginx Dockerfile
│
├── data/                           ← Created on first deploy (NOT committed)
│   ├── postgres/                   ← PostgreSQL data files (bind-mounted)
│   ├── mongodb/                    ← MongoDB data files (bind-mounted)
│   ├── mongodb-config/             ← MongoDB config DB
│   ├── uploads/                    ← User-uploaded files served by backend
│   └── pgadmin/                    ← pgAdmin session data (optional)
│
├── dist/                           ← Build output (created by build scripts)
│   ├── images/                     ← Docker image tarballs for offline deploy
│   ├── bin/                        ← Native Go server binaries per OS/arch
│   └── frontend/                   ← Vite production bundle
│
└── platforms/
    ├── mac/build.sh + deploy.sh     ← macOS-specific scripts
    ├── windows/build.ps1 + deploy.ps1
    └── linux/build.sh + deploy.sh   ← Linux/server-specific scripts
```

---

## Prerequisites on the build machine

| Tool | Minimum | Purpose |
|------|---------|---------|
| Docker Desktop / Engine | 24.x | Build and run containers |
| Docker Compose plugin | v2.x | Orchestration |
| Go | 1.25 | Build native Go binary (optional) |
| Node.js | 22.x | Build frontend bundle (optional) |

Docker alone is sufficient if you only need Docker images (no native binaries).

---

## Step 1 — Configure

### 1a. Copy and fill `.env`

```bash
cp .env.example .env
```

Open `.env` and set every required value:

| Variable | Required | Description |
|----------|----------|-------------|
| `COMPOSE_PROJECT_NAME` | yes | Docker project namespace — keep `gg-cms` |
| `POSTGRES_PASSWORD` | yes | PostgreSQL password for `gg_cms_user` |
| `MONGO_PASSWORD` | yes | MongoDB password for `gg_cms_user` |
| `JWT_SECRET` | yes | Min 32 random characters — never reuse across environments |
| `ADMIN_EMAIL` | yes | Email for the auto-seeded admin account |
| `ADMIN_PASSWORD` | yes | Password for the admin account |
| `ADMIN_NAME` | no | Display name (default: `Super Admin`) |
| `VITE_API_BASE_URL` | yes | `/api` (nginx proxy, recommended) or `http://host:8080/api` |
| `VITE_APP_NAME` | no | Browser title and branding (default: `GeekGully CMS`) |
| `FRONTEND_PORT` | no | Host port for the UI (default: `80`) |
| `BACKEND_PORT` | no | Host port for the API (default: `8080`) |
| `UPLOAD_BASE_URL` | no | Public URL where uploads are served |
| `CORS_ALLOWED_ORIGINS` | no | Comma-separated allowed origins (default: `http://localhost`) |
| `FRONTEND_URL` | no | Full frontend URL — used by backend for OAuth redirects |
| `LOG_LEVEL` | no | `debug` / `info` / `warn` / `error` (default: `info`) |
| `PGADMIN_EMAIL` | no | pgAdmin login (only used with `--with-tools`) |
| `PGADMIN_PASSWORD` | no | pgAdmin password |
| `GOOGLE_CLIENT_ID` | no | Google OAuth — leave empty to disable |
| `GOOGLE_CLIENT_SECRET` | no | Google OAuth |
| `GITHUB_CLIENT_ID` | no | GitHub OAuth — leave empty to disable |
| `GITHUB_CLIENT_SECRET` | no | GitHub OAuth |

### 1b. Backend runtime overrides (optional)

`config/backend/app.env` is mounted read-only at `/app/.env` inside the backend container.

**Use case**: add env vars that are NOT already in the compose `environment:` section, or override a compose value for a specific deployment without editing the compose file.

All variables are commented out by default. Uncomment and set only what you need:

```
# config/backend/app.env
# BYPASS_RATE_LIMIT=1    ← uncomment for local e2e testing only
# LOG_LEVEL=debug         ← verbose logging
```

### 1c. Nginx routing (optional)

`config/frontend/nginx.conf` is mounted at `/etc/nginx/conf.d/default.conf` inside the frontend container.

The default config:
- Proxies `/api/*` → `backend:8080/api/` (API calls go through nginx — no CORS)
- Proxies `/uploads/*` → `backend:8080/uploads/` (file serving through nginx)
- Serves the React SPA from `/` with cache headers
- Enables gzip compression

**Change only if**:
- You need to add custom headers (e.g. CSP, HSTS)
- You're doing SSL termination inside nginx
- You want to rate-limit specific endpoints at nginx level

After editing nginx.conf, restart only the frontend container:
```bash
docker compose restart frontend
```

---

## Step 2 — Build

Run from the **release/** folder:

```bash
# Linux / macOS / WSL
bash build.sh                   # Docker images + native binary for host OS
bash build.sh --docker-only     # Docker images only
bash build.sh --backend-only    # backend image only (skip frontend)
bash build.sh --no-cache        # force full rebuild

# Windows
.\build.ps1                     # Docker images + native binaries
.\build.ps1 -DockerOnly         # Docker images only
.\build.ps1 -BackendOnly        # backend image only
.\build.ps1 -NoCache            # force full rebuild
```

Build output in `dist/`:
```
dist/images/gg-cms-backend.tar.gz     ← backend image
dist/images/gg-cms-frontend.tar.gz    ← frontend image
dist/images/postgres-16-alpine.tar.gz
dist/images/mongo-7-jammy.tar.gz
dist/bin/gg-cms-server-linux-amd64    ← Go binary (if native build)
dist/frontend/                         ← Vite bundle (if native build)
```

---

## Step 3 — Deploy

### Scenario A — Full stack (UI + API + DBs) on a single host

```bash
# Linux / macOS — load pre-built images from dist/ (no source code needed)
bash deploy.sh --load

# OR build from source (source code must be at ../gg-cms/)
bash deploy.sh --build

# Windows
.\deploy.ps1 -Load
.\deploy.ps1 -Build
```

Services started:
| Container | Port | Description |
|-----------|------|-------------|
| `gg-cms-postgres` | internal | PostgreSQL 16 |
| `gg-cms-mongodb` | internal | MongoDB 7 |
| `gg-cms-backend` | `BACKEND_PORT` (8080) | Go API server |
| `gg-cms-frontend` | `FRONTEND_PORT` (80) | React + Nginx |

Access:
- UI → `http://localhost` (or your domain)
- API → `http://localhost/api/health` (proxied through nginx)
- Direct API → `http://localhost:8080/api/health`

### Scenario B — Backend only (API + DBs, no frontend)

Use `docker-compose.backend.yml` when:
- The frontend is hosted on a CDN or a separate server
- You want to deploy the API on its own box
- You're doing API-only testing

```bash
# Linux / macOS
bash deploy-backend.sh --load     # load from dist/
bash deploy-backend.sh --build    # build from source

# Windows
.\deploy-backend.ps1 -Load
.\deploy-backend.ps1 -Build
```

Services started:
| Container | Port | Description |
|-----------|------|-------------|
| `gg-cms-postgres` | internal | PostgreSQL 16 |
| `gg-cms-mongodb` | internal | MongoDB 7 |
| `gg-cms-backend` | `BACKEND_PORT` (8080) | Go API server (direct) |

**Important**: In backend-only mode, update your frontend to point directly at the API:
```
VITE_API_BASE_URL=http://<backend-host>:8080/api
```
And set `CORS_ALLOWED_ORIGINS` in `.env` to your frontend origin:
```
CORS_ALLOWED_ORIGINS=https://your-frontend.example.com
```

### Scenario C — Air-gapped / offline deployment (target has no internet)

1. On the **build machine** (has internet + source code):
   ```bash
   bash build.sh --docker-only
   ```
   This produces `dist/images/*.tar.gz` — all 4 images saved.

2. Copy the entire **release/** folder to the target machine (USB, SCP, etc.)

3. On the **target machine**:
   ```bash
   bash deploy.sh --load    # loads images from dist/, then starts
   ```
   No internet, no source code, no Go or Node required on the target.

---

## Updating / Redeploying

### Update application code
```bash
# 1. On build machine — rebuild images
bash build.sh --no-cache

# 2. Transfer updated dist/images/ to target (if air-gapped)

# 3. On target — reload images and restart
bash deploy.sh --load
docker compose restart backend   # or frontend / all services
```

### Update .env configuration only (no rebuild)
```bash
# Edit .env
nano .env

# Restart affected services
docker compose up -d --no-deps backend   # restart backend only
# OR
docker compose up -d                      # restart all (picks up new env)
```

### Update nginx.conf (no rebuild needed)
```bash
# Edit config/frontend/nginx.conf
nano config/frontend/nginx.conf

# Hot-reload nginx config
docker compose exec frontend nginx -s reload
# OR restart just the frontend container
docker compose restart frontend
```

### Update backend app.env overrides (no rebuild needed)
```bash
# Edit config/backend/app.env
nano config/backend/app.env

# Restart backend to pick up the new file
docker compose restart backend
```

---

## With DB admin UI (pgAdmin)

```bash
bash deploy.sh --load --with-tools      # full stack + pgAdmin
bash deploy-backend.sh --load --with-tools   # backend + pgAdmin
```

Access pgAdmin at `http://localhost:5050` (default port, configurable in `.env`).

To add the PostgreSQL server in pgAdmin:
- Hostname: `postgres`
- Port: `5432`
- Database: `gg_cms`
- Username: `gg_cms_user`
- Password: value of `POSTGRES_PASSWORD` from `.env`

---

## Common commands

```bash
# View running containers
docker compose ps

# Tail all logs
bash deploy.sh --logs          # or .\deploy.ps1 -Logs

# Tail a specific service
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f postgres

# Restart one service (without rebuild)
docker compose restart backend

# Stop everything (keeps data)
bash deploy.sh --down

# Wipe data volumes (DESTRUCTIVE — deletes all DB data and uploads)
docker compose down
rm -rf data/

# Execute a command in the running backend
docker compose exec backend sh

# Open a PostgreSQL shell
docker compose exec postgres psql -U gg_cms_user -d gg_cms
```

---

## Troubleshooting

### Backend fails to start — "PostgreSQL did not become ready"
PostgreSQL takes 5–15 s on first boot (initialising the data dir).
The healthcheck retries for 50 s. If it still fails:
```bash
docker compose logs postgres    # look for errors
rm -rf data/postgres            # wipe and reinitialise (DESTRUCTIVE)
docker compose up -d postgres
```

### "POSTGRES_PASSWORD is required" error on `docker compose up`
`.env` is missing or `POSTGRES_PASSWORD` is not set. Run `cp .env.example .env` and fill the required values.

### Port 80 already in use
Change `FRONTEND_PORT` in `.env`:
```
FRONTEND_PORT=8081
```
Then redeploy.

### Backend image not found when running `deploy.sh` without `--build` or `--load`
Run `bash build.sh` first to build the images, then `bash deploy.sh`.

### Frontend shows "Cannot connect to API"
Check `VITE_API_BASE_URL` in `.env`. It is baked into the frontend image at build time.
If you change it, you must rebuild the frontend image:
```bash
bash build.sh --no-cache
bash deploy.sh --load
```

### Data persists after `docker compose down`
This is intentional — data lives in `data/` (bind mounts), not in Docker volumes.
To fully reset: `docker compose down && rm -rf data/`
