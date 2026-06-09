# GG-CMS — Configuration & Deployment Reference

> **Single source of truth** for every credential, environment variable, certificate,
> and step-by-step deployment procedure.

---

## Table of contents

1. [Admin accounts — how they work](#1-admin-accounts--how-they-work)
2. [All credentials and where to change them](#2-all-credentials-and-where-to-change-them)
3. [Database configuration parameters](#3-database-configuration-parameters)
4. [Certificate placement guide](#4-certificate-placement-guide)
5. [Step-by-step deployment — Mode A: Full Docker + mTLS](#5-mode-a-full-docker--mtls-recommended)
6. [Step-by-step deployment — Mode B: Backend only Docker](#6-mode-b-backend-only-docker)
7. [Step-by-step deployment — Mode C: Native binary (Windows)](#7-mode-c-native-binary-windows)
8. [Step-by-step deployment — Mode D: Air-gapped (pre-built images)](#8-mode-d-air-gapped--offline)
9. [Step-by-step deployment — Local development](#9-local-development)
10. [Post-deployment verification](#10-post-deployment-verification)
11. [Credential rotation](#11-credential-rotation)

---

## 1. Admin accounts — how they work

The backend auto-seeds **up to two** admin accounts on every startup. Both operations
are idempotent — they only create the user if the email is not already registered.

### Master admin (`ADMIN_*`)

| Env var | Purpose | Required |
|---------|---------|----------|
| `ADMIN_EMAIL` | Login email for the primary admin | Yes |
| `ADMIN_PASSWORD` | Login password — **seeding skipped if empty** | Yes |
| `ADMIN_NAME` | Display name | No (default: `Super Admin`) |

- Created by `internal/bootstrap/admin.go → SeedAdmin()`
- Automatically placed in the **Admin** group
- The Admin group is linked to the hidden **geek** root category, giving full
  content-review access across the entire category tree
- **Password update**: changing `ADMIN_PASSWORD` and restarting the backend does NOT
  update an existing account's password — it only affects first-time creation.
  To change an existing password: use the API `PATCH /api/users/{id}` as an Admin,
  or directly UPDATE the `password_hash` column in PostgreSQL.

### Secondary admin (`GEEK_ADMIN_*`)

| Env var | Purpose | Required |
|---------|---------|----------|
| `GEEK_ADMIN_EMAIL` | Login email for the secondary admin | No |
| `GEEK_ADMIN_PASSWORD` | Login password — **seeding skipped if empty** | No |
| `GEEK_ADMIN_NAME` | Display name | No (default: `Geek Admin`) |

- Seeded by `seedSecondaryAdmin()` — only runs when `GEEK_ADMIN_PASSWORD` is non-empty
- Used by API integration tests and E2E tests
- Also placed in the Admin group
- Set `GEEK_ADMIN_PASSWORD=` (empty) in production to skip creating this account

> **Security rule**: Never set `ADMIN_PASSWORD` or `GEEK_ADMIN_PASSWORD` to their
> development defaults (`Geekadmin@2026`, `Admin@123`) in any environment that is
> reachable from the internet.

---

## 2. All credentials and where to change them

### 2.1 The credential hierarchy

```
release/.env                   ← PRODUCTION: single file that drives ALL Docker deployments
    │
    ├── docker-compose.yml          reads ${VAR} from .env
    ├── docker-compose.backend.yml  reads ${VAR} from .env
    └── docker-compose.native.yml   reads ${VAR} from .env

release/dist/native/.env       ← PRODUCTION (native binary mode only)
    │
    └── server.exe reads this file directly on startup

gg-cms/backend/go-cms/.env     ← DEVELOPMENT ONLY (local go run / go build)
```

### 2.2 `release/.env` — the master credentials file

Copy from `.env.example` and fill every value listed below.

```
# ── COPY THIS FILE TO .env AND CHANGE ALL VALUES ──────────────────────────────
```

| Variable | What it controls | Minimum requirements |
|----------|-----------------|---------------------|
| `COMPOSE_PROJECT_NAME` | Docker project namespace (keep `gg-cms`) | Do not change |
| `POSTGRES_PASSWORD` | PostgreSQL password for `gg_cms_user` | ≥ 16 random chars |
| `MONGO_PASSWORD` | MongoDB password for `gg_cms_user` | ≥ 16 random chars |
| `JWT_SECRET` | Signs all user session tokens | ≥ 32 random chars |
| `ADMIN_EMAIL` | Master admin login email | Valid email address |
| `ADMIN_PASSWORD` | Master admin login password | ≥ 12 chars, mixed case + symbols |
| `ADMIN_NAME` | Master admin display name | Any string |
| `GEEK_ADMIN_EMAIL` | Secondary admin email (leave empty to disable) | Valid email or empty |
| `GEEK_ADMIN_PASSWORD` | Secondary admin password (leave empty to disable) | ≥ 12 chars or empty |
| `GEEK_ADMIN_NAME` | Secondary admin display name | Any string |
| `VITE_API_BASE_URL` | API URL baked into the frontend bundle at build time | `/api` (nginx proxy) or `http://host:8443/api` |
| `VITE_APP_NAME` | Browser title / branding | Any string |
| `FRONTEND_PORT` | Host port for HTTP (redirect to HTTPS) | Default: `80` |
| `FRONTEND_PORT_HTTPS` | Host port for HTTPS | Default: `443` |
| `BACKEND_PORT` | Host port for backend API | Default: `8443` (mTLS) |
| `UPLOAD_BASE_URL` | Public URL where uploaded files are served | `https://yourdomain/uploads` |
| `CORS_ALLOWED_ORIGINS` | Comma-separated list of allowed frontend origins | `https://yourdomain` |
| `FRONTEND_URL` | Full frontend URL (used in OAuth redirects) | `https://yourdomain` |
| `LOG_LEVEL` | Backend verbosity: `debug`/`info`/`warn`/`error` | `info` for production |
| `JWT_EXPIRY_HOURS` | Token lifetime in hours | `24` |
| `PGADMIN_EMAIL` | pgAdmin login (optional tools profile) | Any email |
| `PGADMIN_PASSWORD` | pgAdmin password | Any string |
| `GOOGLE_CLIENT_ID` | Google OAuth app ID (leave empty to disable) | From Google Console |
| `GOOGLE_CLIENT_SECRET` | Google OAuth app secret | From Google Console |
| `GOOGLE_REDIRECT_URL` | Must match Google Console callback URL | `https://yourdomain:8443/api/auth/google/callback` |
| `GITHUB_CLIENT_ID` | GitHub OAuth app ID (leave empty to disable) | From GitHub Settings |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth app secret | From GitHub Settings |
| `GITHUB_REDIRECT_URL` | Must match GitHub OAuth callback URL | `https://yourdomain:8443/api/auth/github/callback` |

### 2.3 `release/dist/native/.env` — native binary credentials

Used **only** by `server.exe` running on the host (Mode C / native binary).
All DB passwords must be manually embedded in the connection URLs.

| Variable | Format | Example |
|----------|--------|---------|
| `DB_WRITE_URL` | `postgres://gg_cms_user:<PG_PASS>@localhost:5433/gg_cms?sslmode=disable` | Replace `<PG_PASS>` |
| `MONGO_URI` | `mongodb://gg_cms_user:<MONGO_PASS>@localhost:27017/?authSource=admin` | Replace `<MONGO_PASS>` |
| `JWT_SECRET` | Any string ≥ 32 chars | `your-secret-here` |
| `ADMIN_EMAIL` | Email | `admin@example.com` |
| `ADMIN_PASSWORD` | Password | `StrongPass!2026` |

### 2.4 `gg-cms/backend/go-cms/.env` — local development only

This file is **never used in Docker deployments** — it is read only when running
the Go binary directly on the host for development.

Change the following for your local setup:

| Variable | Dev default | What to change for custom local DB |
|----------|------------|-------------------------------------|
| `DB_WRITE_URL` | `postgres://gg_cms_user:gg_cms_pass@localhost:5433/gg_cms?sslmode=disable` | Replace password and port |
| `MONGO_URI` | `mongodb://gg_cms_user:gg_cms_pass@localhost:27017/?authSource=admin` | Replace password |
| `ADMIN_EMAIL` | `geekadmin@geekgully.com` | Your dev admin email |
| `ADMIN_PASSWORD` | `Geekadmin@2026` | Any password |
| `JWT_SECRET` | `gg-cms-dev-jwt-secret-min-32-chars-ok` | Any 32+ char string |

### 2.5 Hardcoded defaults to be aware of

These are compiled defaults in `pkg/config/config.go`. They are overridden by env vars.
If an env var is missing, these kick in:

| Config field | Compiled default | Danger if not overridden |
|---|---|---|
| `ADMIN_EMAIL` | `admin@serenya.com` | Wrong email used for admin |
| `ADMIN_PASSWORD` | `""` (empty) | Admin seed skipped — no admin created |
| `GEEK_ADMIN_EMAIL` | `geekadmin@geekgully.com` | Secondary admin gets wrong email |
| `GEEK_ADMIN_PASSWORD` | `""` (empty) | Secondary admin seed skipped |
| `MONGO_DATABASE` | `gg_cms` | Correct — do not change |
| `JWT_EXPIRY_HOURS` | `24` | Acceptable |
| `UPLOAD_BASE_URL` | `http://localhost:8080/uploads` | Wrong for production |

---

## 3. Database configuration parameters

### 3.1 PostgreSQL

**Where credentials live (Docker mode):**

```
release/.env
  POSTGRES_PASSWORD=<your-password>        ← the only place to set PG password
```

Docker compose constructs the connection URL automatically:
```
DB_WRITE_URL = postgres://gg_cms_user:${POSTGRES_PASSWORD}@postgres:5432/gg_cms
               ?sslmode=verify-full
               &sslrootcert=/certs/ca/ca.crt
               &sslcert=/certs/backend/client.crt
               &sslkey=/certs/backend/client.key
```

**Parameters you can tune (add to `config/backend/app.env`):**

| Parameter in URL | Default | Meaning |
|---|---|---|
| `sslmode` | `verify-full` (mTLS) / `disable` (native mode) | TLS enforcement level |
| `sslrootcert` | `/certs/ca/ca.crt` | CA cert for server verification |
| `sslcert` | `/certs/backend/client.crt` | Client cert for mTLS |
| `sslkey` | `/certs/backend/client.key` | Client key for mTLS |
| `connect_timeout` | (not set) | Add `&connect_timeout=10` |
| `pool_max_conns` | GORM default | Add `&pool_max_conns=20` |

**Read replica (optional):**
```
DB_READ_URL=postgres://gg_cms_user:<pass>@replica-host:5432/gg_cms?sslmode=verify-full&...
```
Leave empty to fall back to the write DB.

**Database name and user** — fixed values, changing requires:
1. Update `POSTGRES_USER` and `POSTGRES_DB` in docker-compose.yml
2. Update `DB_WRITE_URL` to match
3. Wipe `data/postgres/` and restart (or migrate manually)

### 3.2 MongoDB

**Where credentials live (Docker mode):**

```
release/.env
  MONGO_PASSWORD=<your-password>           ← the only place to set Mongo password
```

Docker compose constructs the URI:
```
MONGO_URI = mongodb://gg_cms_user:${MONGO_PASSWORD}@mongodb:27017/
            ?authSource=admin&tls=true
```

TLS config (CA + client cert) is applied in Go code via `SetTLSConfig()` —
the env vars controlling those paths are:

| Variable | Default value in compose | What it points to |
|---|---|---|
| `TLS_CA_FILE` | `/certs/ca/ca.crt` | CA cert to verify MongoDB server |
| `TLS_CLIENT_CERT_FILE` | `/certs/backend/client.crt` | Client cert presented to MongoDB |
| `TLS_CLIENT_KEY_FILE` | `/certs/backend/client.key` | Client key |

**Database name** — fixed at `gg_cms`. To rename:
1. Change `MONGO_DATABASE` env var in compose + `MONGO_INITDB_DATABASE` in compose
2. Drop and recreate MongoDB data (`data/mongodb/`)

### 3.3 Both databases — changing passwords on a running system

> Changing database passwords on a live system is a multi-step operation.
> Do it during a maintenance window.

```bash
# 1. Stop the backend (not the DBs)
docker compose stop backend

# 2. Update PostgreSQL password
docker compose exec postgres psql -U gg_cms_user -d gg_cms \
  -c "ALTER USER gg_cms_user WITH PASSWORD 'new-pg-password';"

# 3. Update MongoDB password
docker compose exec mongodb mongosh -u gg_cms_user -p old_password \
  --authenticationDatabase admin \
  --eval "db.changeUserPassword('gg_cms_user', 'new-mongo-password')"

# 4. Update .env with new passwords
nano .env   # change POSTGRES_PASSWORD and MONGO_PASSWORD

# 5. Restart backend (picks up new .env values)
docker compose up -d backend
```

---

## 4. Certificate placement guide

### 4.1 Certificate tree (generated by `certs/generate-certs.sh`)

```
release/certs/
├── ca/
│   ├── ca.key          ← ROOT CA PRIVATE KEY — guard this
│   └── ca.crt          ← ROOT CA CERT — distribute to browsers/OS
│
├── postgres/
│   ├── server.key      ← PostgreSQL TLS private key
│   ├── server.crt      ← PostgreSQL TLS certificate (CN=postgres)
│   ├── server.pem      ← key + cert combined (not used by PG, kept for reference)
│   └── ca.crt          ← copy of root CA cert
│
├── mongodb/
│   ├── server.key      ← MongoDB TLS private key
│   ├── server.crt      ← MongoDB TLS certificate (CN=mongodb)
│   ├── server.pem      ← key + cert combined (MongoDB requires this format)
│   └── ca.crt          ← copy of root CA cert
│
├── backend/
│   ├── server.key      ← Backend HTTPS server key
│   ├── server.crt      ← Backend HTTPS server cert (CN=backend)
│   ├── server.pem      ← combined
│   ├── client.key      ← Backend client key (presented to DBs)
│   ├── client.crt      ← Backend client cert (CN=gg_cms_user)
│   ├── client.pem      ← combined
│   └── ca.crt          ← copy of root CA cert
│
└── frontend/
    ├── server.key      ← Nginx HTTPS server key
    ├── server.crt      ← Nginx HTTPS server cert (CN=frontend)
    ├── server.pem      ← combined
    ├── client.key      ← Nginx client key (presented to backend when proxying)
    ├── client.crt      ← Nginx client cert (CN=frontend-client)
    ├── client.pem      ← combined
    └── ca.crt          ← copy of root CA cert
```

### 4.2 How certs reach each container

The entire `release/certs/` tree is mounted **read-only** at `/certs/` inside every
container via the `volumes:` block in both compose files:

```yaml
# docker-compose.yml and docker-compose.backend.yml
volumes:
  - ./certs:/certs:ro           # ← backend, frontend
  - ./certs/postgres:/pg-certs-ro:ro   # ← postgres (special handling)
  - ./certs/mongodb:/certs:ro   # ← mongodb
```

Inside containers the certs are found at:

| Container | Cert path inside container | Used for |
|---|---|---|
| `postgres` | `/pg-certs/server.crt`, `/pg-certs/server.key`, `/pg-certs/ca.crt` | Serve TLS |
| `mongodb` | `/certs/server.pem`, `/certs/ca.crt` | Serve mTLS |
| `backend` | `/certs/backend/server.crt`, `/certs/backend/server.key` | Serve HTTPS |
| `backend` | `/certs/backend/client.crt`, `/certs/backend/client.key` | Connect to DBs |
| `backend` | `/certs/ca/ca.crt` | Verify all server certs + verify nginx client cert |
| `frontend` | `/certs/frontend/server.crt`, `/certs/frontend/server.key` | Serve HTTPS |
| `frontend` | `/certs/frontend/client.crt`, `/certs/frontend/client.key` | Proxy to backend |
| `frontend` | `/certs/ca/ca.crt` | Verify backend server cert |

### 4.3 Replacing / renewing certificates

```bash
# Regenerate all certs (e.g. after expiry or domain change):
cd release
bash certs/generate-certs.sh --host new-domain.com --days 825

# Restart all services to pick up new certs (no rebuild needed):
docker compose restart postgres mongodb backend frontend
```

To renew **only one** service cert without regen everything:
```bash
# Edit generate-certs.sh to call only the service section you need,
# then restart just that service:
docker compose restart backend
```

### 4.4 Trusting the internal CA in browsers / OS

After generating certs, import `release/certs/ca/ca.crt`:

| OS | Command |
|---|---|
| macOS | `sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain certs/ca/ca.crt` |
| Linux | `sudo cp certs/ca/ca.crt /usr/local/share/ca-certificates/gg-cms.crt && sudo update-ca-certificates` |
| Windows | `certutil -addstore Root certs\ca\ca.crt` |
| Browser (Chrome/Firefox) | Settings → Privacy → Certificates → Import `ca.crt` as trusted CA |

---

## 5. Mode A — Full Docker + mTLS (Recommended)

Everything runs in Docker. Nginx serves HTTPS on 443 and proxies to the backend
over mTLS. All DB connections are encrypted and mutually authenticated.

### Prerequisites

- Docker Desktop / Docker Engine ≥ 24
- Docker Compose plugin v2
- `openssl` (for cert generation — bundled with Git on Windows)
- Source code at `../gg-cms/` (for building images) **OR** pre-built images in `dist/`

### Step 1 — Generate internal CA and certificates

```bash
cd release
bash certs/generate-certs.sh --host your-domain.com
```

> Windows: `.\certs\generate-certs.ps1 -Host your-domain.com`

This creates the full `certs/` tree (see §4). Run **once per environment**.
Keep `certs/ca/ca.key` secure — it is the root of trust.

### Step 2 — Create and configure `.env`

```bash
cp .env.example .env
```

Open `.env` and set **every** value in this order:

```bash
# ── Secrets (generate with: openssl rand -hex 32) ─────────────────────────────
COMPOSE_PROJECT_NAME=gg-cms
POSTGRES_PASSWORD=<strong-random-password>
MONGO_PASSWORD=<strong-random-password>
JWT_SECRET=<min-32-random-characters>

# ── Admin accounts ────────────────────────────────────────────────────────────
ADMIN_EMAIL=admin@your-domain.com
ADMIN_PASSWORD=<strong-password>
ADMIN_NAME=Super Admin
# Leave GEEK_ADMIN_PASSWORD empty in production to skip secondary admin
GEEK_ADMIN_EMAIL=
GEEK_ADMIN_PASSWORD=

# ── Network / URLs ────────────────────────────────────────────────────────────
VITE_API_BASE_URL=/api                        # nginx proxy — recommended
VITE_APP_NAME=GeekGully CMS
FRONTEND_PORT=80
FRONTEND_PORT_HTTPS=443
BACKEND_PORT=8443
UPLOAD_BASE_URL=https://your-domain.com/uploads
CORS_ALLOWED_ORIGINS=https://your-domain.com
FRONTEND_URL=https://your-domain.com

# ── Log level ─────────────────────────────────────────────────────────────────
LOG_LEVEL=info

# ── pgAdmin (optional) ───────────────────────────────────────────────────────
PGADMIN_EMAIL=admin@your-domain.com
PGADMIN_PASSWORD=<strong-password>

# ── OAuth (leave all empty to disable) ────────────────────────────────────────
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
```

### Step 3 — (Optional) Customise backend runtime overrides

Edit `config/backend/app.env` to override any backend env var at runtime without
rebuilding. All lines are commented by default — uncomment only what you need.

Common overrides:
```bash
# config/backend/app.env
LOG_LEVEL=debug           # verbose logging for troubleshooting
JWT_EXPIRY_HOURS=8        # shorter sessions
```

### Step 4 — (Optional) Customise Nginx

Edit `config/frontend/nginx.conf` to add custom headers, rate limits, or SSL settings.
Changes take effect after `docker compose restart frontend` (no image rebuild needed).

### Step 5 — Build images

**Option A — build from source** (requires `../gg-cms/` source alongside):
```bash
# Linux / macOS / WSL
bash build.sh

# Windows
.\build.ps1
```

**Option B — use pre-built images** (skip this step, go straight to Step 6 with `--load`).

### Step 6 — Deploy

```bash
# Linux / macOS / WSL
bash deploy.sh              # uses images already built/present in Docker
bash deploy.sh --build      # build from source then start (combines steps 5+6)
bash deploy.sh --load       # load images from dist/images/ then start (air-gapped)

# Windows
.\deploy.ps1
.\deploy.ps1 -Build
.\deploy.ps1 -Load

# With pgAdmin:
bash deploy.sh --with-tools
```

### Step 7 — Verify

```bash
# All containers must show "healthy"
docker compose ps

# API health check
curl -k https://localhost:8443/api/health

# UI
open https://localhost    # then trust the CA if browser warns
```

### Step 8 — Trust the CA in your browser

Import `certs/ca/ca.crt` using the commands in §4.4.

---

## 6. Mode B — Backend only Docker

Use when the frontend is hosted elsewhere (CDN, separate VM, etc.).
The Go API and both databases run in Docker; no Nginx container.

### Steps

**Steps 1–3**: Same as Mode A.

**Step 4 — Set CORS to your frontend origin**:
```bash
# In .env
CORS_ALLOWED_ORIGINS=https://your-frontend.com
FRONTEND_URL=https://your-frontend.com
```

**Step 5 — Build**:
```bash
bash build.sh --backend-only    # or .\build.ps1 -BackendOnly
```

**Step 6 — Deploy**:
```bash
bash deploy-backend.sh --build       # build then start
bash deploy-backend.sh --load        # load from dist/ then start
.\deploy-backend.ps1 -Build
.\deploy-backend.ps1 -Load
```

**Step 7 — Point your frontend at the API**:

In your separately hosted frontend, set:
```
VITE_API_BASE_URL=https://api.your-domain.com:8443/api
```

---

## 7. Mode C — Native binary (Windows)

DBs and Nginx run in Docker. The Go API binary (`server.exe`) runs natively on Windows.
No Docker image build required — use the pre-compiled `dist/native/server.exe`.

### Prerequisites

- Docker Desktop for Windows (running)
- No Go or Node.js required at runtime

### Step 1 — Configure `release/dist/native/.env`

```bash
# Copy the example and edit
copy dist\native\.env.example dist\native\.env
```

Edit `dist\native\.env`:

```bash
SERVER_PORT=1337
GIN_MODE=release
LOG_LEVEL=info

# Replace <PG_PASS> with your PostgreSQL password
DB_WRITE_URL=postgres://gg_cms_user:<PG_PASS>@localhost:5433/gg_cms?sslmode=disable

# Replace <MONGO_PASS> with your MongoDB password
MONGO_URI=mongodb://gg_cms_user:<MONGO_PASS>@localhost:27017/?authSource=admin
MONGO_DATABASE=gg_cms

JWT_SECRET=<min-32-chars>
JWT_EXPIRY_HOURS=24

UPLOAD_DIR=./uploads
UPLOAD_BASE_URL=http://localhost:1337/uploads

CORS_ALLOWED_ORIGINS=http://localhost,http://localhost:80

ADMIN_EMAIL=admin@your-domain.com
ADMIN_PASSWORD=<strong-password>
ADMIN_NAME=Super Admin

# Leave empty to disable secondary admin
GEEK_ADMIN_EMAIL=
GEEK_ADMIN_PASSWORD=
```

### Step 2 — Configure `release/.env` for Docker services

Same as Mode A `.env` — but only the following vars are used by `docker-compose.native.yml`:

```bash
COMPOSE_PROJECT_NAME=gg-cms
POSTGRES_PASSWORD=<same-as-in-dist/native/.env>
MONGO_PASSWORD=<same-as-in-dist/native/.env>
PGADMIN_EMAIL=admin@your-domain.com
PGADMIN_PASSWORD=<password>
FRONTEND_PORT=80
```

> The passwords in `release/.env` must match those embedded in
> `dist/native/.env` connection URLs, or the DB containers will start
> with a different password than the binary expects.

### Step 3 — (Optional) Use a newer server.exe

Replace `dist\native\server.exe` with a freshly compiled binary:
```powershell
# Build natively on Windows
cd ..\gg-cms\backend\go-cms
go build -o ..\..\..\release\dist\native\server.exe .\cmd\server
```

### Step 4 — Start everything

```bat
start.bat
```

The script:
1. Checks Docker Desktop is running (starts it if not)
2. Creates `data/` directories
3. Starts PostgreSQL, MongoDB, and Nginx via `docker-compose.native.yml`
4. Waits for databases to be healthy
5. Launches `dist\native\server.exe` in a new terminal window

### Step 5 — Stop everything

```bat
stop.bat
```

Or close the API window + run `docker compose -f docker-compose.native.yml down`.

---

## 8. Mode D — Air-gapped / Offline

Deploy on a machine with no internet access using pre-built Docker image tarballs.

### On the build machine (has internet + source)

```bash
cd release
# Build all images and export as .tar.gz files into dist/images/
bash build.sh --docker-only
```

This creates:
```
dist/images/gg-cms-backend.tar.gz
dist/images/gg-cms-frontend.tar.gz
dist/images/postgres-16-alpine.tar.gz
dist/images/mongo-7-jammy.tar.gz
```

### Transfer to target machine

Copy the entire `release/` folder (including `dist/images/` and `certs/`) to
the target machine via USB, SCP, or any file transfer method.

### On the target machine

```bash
# 1. Complete Steps 1–4 of Mode A (generate certs, configure .env, etc.)
#    If certs were generated on the build machine, they travel with the release/ folder.

# 2. Deploy by loading images from dist/ (no internet, no source needed)
bash deploy.sh --load

# Windows
.\deploy.ps1 -Load
```

---

## 9. Local development

Run the full stack locally with hot-reload.

### Step 1 — Start databases

```bash
cd gg-cms/backend/go-cms
docker compose up -d postgres mongodb
```

Or from `gg-cms/` root:
```bash
bash gg_gocms.sh --db     # starts DBs only
```

### Step 2 — Configure backend

```bash
cd gg-cms/backend/go-cms
cp .env.example .env
# Edit .env: set ADMIN_EMAIL, ADMIN_PASSWORD, JWT_SECRET
```

The `.env.example` DB URLs already match the `docker-compose.yml` service names
(`localhost:5433` for PG, `localhost:27017` for Mongo).

### Step 3 — Run the backend

```bash
# From gg-cms/backend/go-cms/
go run ./cmd/server
# or
bash scripts/dev.sh
```

### Step 4 — Run the frontend

```bash
cd gg-cms/frontend/react-ui
cp .env.example .env.local
# Set VITE_API_BASE_URL=http://localhost:1337/api
npm install
npm run dev
```

### Step 5 — Full stack launcher (convenience)

```bash
# From gg-cms/ root
bash gg_gocms.sh          # starts DBs + API + UI in one command
.\gg_gocms.bat            # Windows
```

---

## 10. Post-deployment verification

Run these checks after every deployment to confirm the stack is healthy.

```bash
# 1. All containers running and healthy
docker compose ps
# Expected: all STATUS = "healthy"

# 2. API health endpoint
curl -k https://localhost:8443/api/health
# Expected: {"status":"ok"} or similar

# 3. Login as master admin
curl -k -X POST https://localhost:8443/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@your-domain.com","password":"your-password"}'
# Expected: {"token":"...","user":{...}}

# 4. Frontend loads
curl -k -L https://localhost/
# Expected: HTML page (React SPA)

# 5. Nginx proxying to backend
curl -k https://localhost/api/health
# Expected: same as #2 but through nginx

# 6. Database connectivity (logged at backend startup)
docker compose logs backend | grep -E "postgres|mongo|connected|failed"
# Expected: "postgres: write DB connected", "MongoDB connected"

# 7. Admin account seeded
docker compose logs backend | grep "bootstrap:"
# Expected: "master admin user created" or "master admin user already exists"
```

---

## 11. Credential rotation

### Rotate JWT_SECRET

> All existing user sessions become invalid immediately.

```bash
# Generate new secret
NEW_SECRET=$(openssl rand -hex 32)

# Update .env
sed -i "s/^JWT_SECRET=.*/JWT_SECRET=$NEW_SECRET/" .env

# Restart backend (no rebuild needed)
docker compose restart backend
```

### Rotate database passwords

See §3.3 — requires a maintenance window.

### Rotate TLS certificates

```bash
# Regenerate all certs
bash certs/generate-certs.sh --host your-domain.com

# Restart services that use certs
docker compose restart postgres mongodb backend frontend
```

### Rotate admin password

> The bootstrap system does NOT update passwords of existing users.
> Must be done via API or direct DB update.

```bash
# Via API (as admin)
curl -k -X PATCH https://localhost:8443/api/users/<user-id> \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{"password":"NewStrongPassword!2026"}'

# Via PostgreSQL directly
docker compose exec postgres psql -U gg_cms_user -d gg_cms -c \
  "UPDATE users SET password_hash = '<bcrypt-hash>' WHERE email = 'admin@your-domain.com';"
```

---

## Quick reference card

```
┌─────────────────────────────────────────────────────────────┐
│              WHERE TO CHANGE WHAT                           │
├──────────────────────────────┬──────────────────────────────┤
│ ALL Docker deployments       │ release/.env                 │
│ Native binary (server.exe)   │ release/dist/native/.env     │
│ Local development            │ gg-cms/backend/go-cms/.env   │
│ Backend runtime overrides    │ release/config/backend/app.env│
│ Nginx routing / TLS          │ release/config/frontend/nginx.conf│
│ Nginx native mode            │ release/config/frontend/nginx.native.conf│
├──────────────────────────────┼──────────────────────────────┤
│ Generate certs (Linux/Mac)   │ bash certs/generate-certs.sh │
│ Generate certs (Windows)     │ .\certs\generate-certs.ps1   │
│ Certs live at                │ release/certs/               │
│ CA cert to trust in browser  │ release/certs/ca/ca.crt      │
├──────────────────────────────┼──────────────────────────────┤
│ Full Docker deploy (Linux)   │ bash deploy.sh --build       │
│ Full Docker deploy (Windows) │ .\deploy.ps1 -Build          │
│ Backend only (Linux)         │ bash deploy-backend.sh --build│
│ Backend only (Windows)       │ .\deploy-backend.ps1 -Build  │
│ Native binary (Windows)      │ start.bat                    │
│ Air-gapped load + deploy     │ bash deploy.sh --load        │
│ Stop all services            │ docker compose down           │
│ Stop native services         │ stop.bat                     │
└──────────────────────────────┴──────────────────────────────┘
```
