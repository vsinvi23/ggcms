@echo off
setlocal enabledelayedexpansion

REM =============================================================================
REM  GG-CMS — Windows Release Launcher (native binary mode)
REM
REM  Services:
REM    PostgreSQL  : localhost:5433  (Docker)
REM    MongoDB     : localhost:27017 (Docker)
REM    React UI    : http://localhost  (Docker / Nginx)
REM    Go API      : http://localhost:1337/api  (native Windows binary)
REM
REM  Requires: Docker Desktop running. No Go or Node.js needed.
REM
REM  Usage:
REM    start.bat           — start everything
REM    start.bat --api     — restart API only (Docker already running)
REM    start.bat --tools   — also start pgAdmin
REM =============================================================================

set SCRIPT_DIR=%~dp0
set API_ONLY=false
set WITH_TOOLS=false

for %%A in (%*) do (
    if "%%A"=="--api"   set API_ONLY=true
    if "%%A"=="--tools" set WITH_TOOLS=true
)

echo.
echo  ============================================
echo   GG-CMS  ^|  Windows Release Launcher
echo  ============================================
echo.

REM ── Check Docker ──────────────────────────────────────────────────────────────
docker --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERR] Docker not found. Install Docker Desktop: https://www.docker.com/
    pause & exit /b 1
)
docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo [WARN] Docker Desktop not running — attempting to start...
    start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe" >nul 2>&1
    echo [INFO] Waiting for Docker to start...
    :docker_wait
    timeout /t 3 /nobreak >nul
    docker info >nul 2>&1
    if %errorlevel% neq 0 goto docker_wait
)
echo [OK]   Docker running.

REM ── Kill existing API if running ──────────────────────────────────────────────
echo [STOP] Killing any running server.exe...
taskkill /f /im server.exe >nul 2>&1
timeout /t 1 /nobreak >nul

if "%API_ONLY%"=="true" goto start_api

REM ── Create data directories ───────────────────────────────────────────────────
for %%D in (data\postgres data\mongodb data\mongodb-config data\pgadmin) do (
    if not exist "%%D\" mkdir "%%D"
)

REM ── Setup .env for Docker services ───────────────────────────────────────────
if not exist ".env" (
    if exist ".env.example" (
        copy .env.example .env >nul
        echo [WARN] .env created from .env.example — edit passwords before production use.
    )
)

REM ── Setup native binary .env ─────────────────────────────────────────────────
if not exist "dist\native\.env" (
    if exist "dist\native\.env.example" (
        copy "dist\native\.env.example" "dist\native\.env" >nul
        echo [WARN] dist\native\.env created — edit JWT_SECRET and ADMIN_PASSWORD.
    )
)
if not exist "dist\native\uploads\" mkdir "dist\native\uploads"
if not exist "dist\native\logs\"   mkdir "dist\native\logs"

REM ── Start Docker services ─────────────────────────────────────────────────────
echo.
echo [DB]   Starting PostgreSQL, MongoDB and Nginx via Docker...
cd /d "%SCRIPT_DIR%"
set COMPOSE_FILE=-f docker-compose.native.yml
set PROFILES=
if "%WITH_TOOLS%"=="true" set PROFILES=--profile tools

docker compose %COMPOSE_FILE% %PROFILES% up -d postgres mongodb frontend
if %errorlevel% neq 0 (
    echo [ERR] docker compose up failed.
    pause & exit /b 1
)

REM ── Wait for PostgreSQL ───────────────────────────────────────────────────────
echo [DB]   Waiting for PostgreSQL (up to 60s)...
set RETRIES=30
:pg_wait
docker compose %COMPOSE_FILE% exec -T postgres pg_isready -U gg_cms_user -d gg_cms >nul 2>&1
if %errorlevel%==0 goto pg_ready
set /a RETRIES-=1
if %RETRIES%==0 ( echo [ERR] PostgreSQL timeout. & pause & exit /b 1 )
timeout /t 2 /nobreak >nul
goto pg_wait
:pg_ready
echo [OK]   PostgreSQL ready.

REM ── Wait for MongoDB ──────────────────────────────────────────────────────────
echo [DB]   Waiting for MongoDB (up to 60s)...
set RETRIES=30
:mg_wait
docker compose %COMPOSE_FILE% exec -T mongodb mongosh --quiet --eval "db.adminCommand('ping').ok" >nul 2>&1
if %errorlevel%==0 goto mg_ready
set /a RETRIES-=1
if %RETRIES%==0 ( echo [ERR] MongoDB timeout. & pause & exit /b 1 )
timeout /t 2 /nobreak >nul
goto mg_wait
:mg_ready
echo [OK]   MongoDB ready.

:start_api
REM ── Launch Go API ─────────────────────────────────────────────────────────────
echo.
echo [API]  Launching GG-CMS API server...
cd /d "%SCRIPT_DIR%dist\native"
if not exist "server.exe" (
    echo [ERR] dist\native\server.exe not found.
    echo       Run build.ps1 first, or copy a pre-built binary here.
    pause & exit /b 1
)
start "GG-CMS API :1337" cmd /k "cd /d "%SCRIPT_DIR%dist\native" && echo. && echo  GG-CMS API ^| http://localhost:1337/api && echo  Press Ctrl+C to stop. && echo. && server.exe"

if "%API_ONLY%"=="true" goto done

REM ── Summary ───────────────────────────────────────────────────────────────────
echo.
echo  ============================================
echo   All services started!
echo  ============================================
echo.
echo   PostgreSQL  :  localhost:5433
echo   MongoDB     :  localhost:27017
echo   API         :  http://localhost:1337/api/health
echo   UI          :  http://localhost
echo.
echo   API runs in a separate window. Ctrl+C to stop it.
echo   Docker services: stop.bat  or  docker compose -f docker-compose.native.yml down
echo   Restart API only:  start.bat --api
echo.

:done
cd /d "%SCRIPT_DIR%"
pause
endlocal
