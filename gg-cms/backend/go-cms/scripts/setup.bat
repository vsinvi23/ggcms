@echo off
REM =============================================================================
REM setup.bat — Pull Docker images, start databases, and run the Go CMS server
REM Usage: scripts\setup.bat
REM =============================================================================
setlocal enabledelayedexpansion

set ROOT=%~dp0..
cd /d "%ROOT%"

echo [INFO] Checking Docker...
docker --version >nul 2>&1 || (echo [ERR] Docker not found. Install Docker Desktop first. & exit /b 1)

REM Prefer modern plugin
docker compose version >nul 2>&1
if %errorlevel%==0 (
    set COMPOSE=docker compose
) else (
    set COMPOSE=docker-compose
)

echo [INFO] Pulling Docker images...
%COMPOSE% pull postgres mongodb

echo [INFO] Starting PostgreSQL and MongoDB...
%COMPOSE% up -d postgres mongodb

echo [INFO] Waiting for PostgreSQL...
:pg_wait
%COMPOSE% exec -T postgres pg_isready -U gg_cms_user -d gg_cms >nul 2>&1
if %errorlevel% neq 0 (
    timeout /t 2 /nobreak >nul
    goto pg_wait
)
echo [INFO] PostgreSQL is ready.

echo [INFO] Waiting for MongoDB...
:mongo_wait
%COMPOSE% exec -T mongodb mongosh --quiet --eval "db.adminCommand('ping').ok" >nul 2>&1
if %errorlevel% neq 0 (
    timeout /t 2 /nobreak >nul
    goto mongo_wait
)
echo [INFO] MongoDB is ready.

REM ── Write .env if absent ────────────────────────────────────────────────────
if not exist .env (
    echo [INFO] Creating .env from template...
    copy .env.example .env >nul
    powershell -Command "(gc .env) -replace 'DB_WRITE_URL=.*', 'DB_WRITE_URL=postgres://gg_cms_user:gg_cms_pass@localhost:5433/gg_cms?sslmode=disable' | sc .env"
    powershell -Command "(gc .env) -replace 'MONGO_URI=.*', 'MONGO_URI=mongodb://gg_cms_user:gg_cms_pass@localhost:27017' | sc .env"
    powershell -Command "(gc .env) -replace 'MONGO_DATABASE=.*', 'MONGO_DATABASE=gg_cms' | sc .env"
    powershell -Command "(gc .env) -replace 'JWT_SECRET=.*', 'JWT_SECRET=change-me-in-production-min-32-chars!!' | sc .env"
    echo [WARN] .env created — change JWT_SECRET before deploying!
) else (
    echo [INFO] .env already exists, skipping.
)

echo [INFO] Building Go CMS server...
go build -o server.exe .\cmd\server
if %errorlevel% neq 0 (echo [ERR] Build failed. & exit /b 1)

echo.
echo   Default credentials:
echo     Admin : admin@serenya.com  / Admin@123
echo     Editor: editor@serenya.com / Admin@123
echo.
echo [INFO] Starting Go CMS server on :8080 ...
server.exe
