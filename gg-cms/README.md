# GeekGully CMS (ggcms)

Go backend + React 19/Vite frontend — CMS/LMS platform.

## Quick Start

### 1. Start databases

```bash
cd backend/go-cms
docker compose up -d
```

Postgres on `localhost:5433`, MongoDB on `localhost:27017`.

### 2. Start backend

```bash
cd backend/go-cms
go run ./cmd/server
```

Server starts on `http://localhost:1337`. Migrations run automatically on startup.

### 3. Start frontend

```bash
cd frontend/react-ui
npm install
npm run dev
```

App opens on `http://localhost:5173`.

---

## Master Admin Login

Created automatically on first backend startup from `.env` config:

| Field    | Value                         |
|----------|-------------------------------|
| Email    | `geekadmin@geekgully.com`     |
| Password | `Geekadmin@2026`              |
| Name     | Geek Admin                    |

To change: update `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` in `backend/go-cms/.env` and restart.

## Developer Account

| Field    | Value              |
|----------|--------------------|
| Email    | `vivek@gmail.com`  |
| Password | `Password@123`     |

---

## Environment Configuration

### Backend — `backend/go-cms/.env`

| Variable                | Default                                                                  |
|-------------------------|--------------------------------------------------------------------------|
| `SERVER_PORT`           | `1337`                                                                   |
| `DB_WRITE_URL`          | `postgres://go_cms_user:go_cms_pass@localhost:5433/go_cms?sslmode=disable` |
| `MONGO_URI`             | `mongodb://go_cms_user:go_cms_pass@localhost:27017/?authSource=admin`    |
| `JWT_SECRET`            | `go-cms-dev-jwt-secret-min-32-chars-ok`                                  |
| `ADMIN_EMAIL`           | `geekadmin@geekgully.com`                                                |
| `ADMIN_PASSWORD`        | `Geekadmin@2026`                                                         |
| `CORS_ALLOWED_ORIGINS`  | `http://localhost:5173,http://localhost:3000`                             |

### Frontend — `frontend/react-ui/.env`

| Variable                   | Default                        |
|----------------------------|--------------------------------|
| `VITE_API_BASE_URL`        | `http://localhost:1337/api`    |
| `VITE_ENABLE_REGISTRATION` | `true`                         |
| `VITE_APP_NAME`            | `GeekGully CMS`                |

---

## Staging Deployment

1. Update `backend/go-cms/.env` with staging DB URLs and a strong `JWT_SECRET`.
2. Set `VITE_API_BASE_URL` in `frontend/react-ui/.env` to the staging API hostname.
3. Build frontend: `cd frontend/react-ui && npm run build` — output in `dist/`.
4. Build backend: `cd backend/go-cms && go build -o server ./cmd/server`.
5. Run `./server` — migrations and admin seed run on startup.

For Docker-based staging:

```bash
cd backend/go-cms
docker compose up -d          # databases
./server                       # or use the Dockerfile
```

Optional pgAdmin (DB browser): `docker compose --profile tools up -d` → `http://localhost:5050`  
pgAdmin login: `admin@serenya.com` / `Admin@123`

---

## Project Structure

```
ggcms/
├── backend/go-cms/           Go backend (Gin + GORM)
│   ├── cmd/server/main.go    entry point
│   ├── internal/             domain, services, handlers
│   ├── migrations/postgres/  SQL migrations (auto-run on start)
│   └── docker-compose.yml    Postgres + MongoDB
├── frontend/react-ui/        React 19 + Vite frontend
│   └── src/
│       ├── api/              axios services + React Query hooks
│       └── pages/            route-level components
├── .ai/                      AI context and project memory
├── docs/                     Architecture and API docs
├── e2e/                      Playwright end-to-end tests
└── CLAUDE.md                 AI assistant conventions
```

See [docs/README.md](docs/README.md) and [.ai/memory-bank.md](.ai/memory-bank.md) for deeper context.
