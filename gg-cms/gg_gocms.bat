@echo off
setlocal enabledelayedexpansion

REM =============================================================================
REM  gg_gocms.bat  — Start Go CMS backend + React frontend (testcms project)
REM
REM  Services started:
REM    PostgreSQL  : localhost:5433  (Docker)
REM    MongoDB     : localhost:27017 (Docker)
REM    Go CMS API  : http://localhost:1337/api
REM    React UI    : http://localhost:8080
REM
REM  Usage:  gg_gocms.bat              — start everything (DB + API + UI)
REM          gg_gocms.bat --server     — rebuild & restart API only (DB already up)
REM  Stop :  close the two terminal windows, then run:
REM          docker compose -f backend\go-cms\docker-compose.yml stop
REM =============================================================================

set SCRIPT_DIR=%~dp0
set GOCMS_DIR=%SCRIPT_DIR%backend\go-cms
set FRONTEND_DIR=%SCRIPT_DIR%frontend\react-ui
set SERVER_ONLY=false

if "%~1"=="--server" set SERVER_ONLY=true

echo.
echo  ============================================
echo   GeekGully CMS  ^|  Go CMS + React Frontend
echo  ============================================
echo.

REM ── Pre-flight checks ─────────────────────────────────────────────────────
echo [CHECK] Verifying prerequisites...

go version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERR] Go not found. Install from https://go.dev/dl/ and re-run.
    pause & exit /b 1
)

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERR] Node.js not found. Install from https://nodejs.org/ and re-run.
    pause & exit /b 1
)

docker --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERR] Docker not found. Install Docker Desktop and re-run.
    pause & exit /b 1
)

docker compose version >nul 2>&1
if %errorlevel%==0 (
    set COMPOSE=docker compose
) else (
    set COMPOSE=docker-compose
)

echo [OK]    Go, Node, Docker all present.
echo.

REM ── Ensure go-cms .env exists ─────────────────────────────────────────────
cd /d "%GOCMS_DIR%"

if not exist ".env" (
    echo [INFO] Creating backend\.env from .env.example ...
    copy .env.example .env >nul
    echo [WARN] Review backend\go-cms\.env before first production use.
) else (
    echo [INFO] backend\go-cms\.env already exists.
)

REM ── Skip databases when --server flag is used ─────────────────────────────
if "%SERVER_ONLY%"=="true" goto skip_db

REM ── Start databases ───────────────────────────────────────────────────────
echo.
echo [DB]   Starting PostgreSQL and MongoDB via Docker Compose...
%COMPOSE% up -d postgres mongodb
if %errorlevel% neq 0 (
    echo [ERR] docker compose up failed. Is Docker Desktop running?
    pause & exit /b 1
)

REM ── Wait for PostgreSQL ───────────────────────────────────────────────────
echo [DB]   Waiting for PostgreSQL to be ready (up to 60 s)...
set PG_RETRIES=30
:pg_wait
%COMPOSE% exec -T postgres pg_isready -U gg_cms_user -d gg_cms >nul 2>&1
if %errorlevel%==0 goto pg_ready
set /a PG_RETRIES-=1
if %PG_RETRIES%==0 (
    echo [ERR] PostgreSQL did not become ready in time.
    pause & exit /b 1
)
timeout /t 2 /nobreak >nul
goto pg_wait
:pg_ready
echo [OK]    PostgreSQL is ready.

REM ── Wait for MongoDB ──────────────────────────────────────────────────────
echo [DB]   Waiting for MongoDB to be ready (up to 60 s)...
set MG_RETRIES=30
:mongo_wait
%COMPOSE% exec -T mongodb mongosh --quiet --eval "db.adminCommand('ping').ok" >nul 2>&1
if %errorlevel%==0 goto mongo_ready
set /a MG_RETRIES-=1
if %MG_RETRIES%==0 (
    echo [ERR] MongoDB did not become ready in time.
    pause & exit /b 1
)
timeout /t 2 /nobreak >nul
goto mongo_wait
:mongo_ready
echo [OK]    MongoDB is ready.

:skip_db

REM ── Kill existing server if running ───────────────────────────────────────
echo.
echo [STOP]  Stopping any existing server.exe...
taskkill /f /im server.exe >nul 2>&1
timeout /t 1 /nobreak >nul

REM ── Build Go binary ───────────────────────────────────────────────────────
echo.
echo [BUILD] Compiling Go CMS server...
cd /d "%GOCMS_DIR%"
go build -o server.exe .\cmd\server
if %errorlevel% neq 0 (
    echo [ERR] Go build failed. Check the error above.
    pause & exit /b 1
)
echo [OK]    Build successful  -^>  backend\go-cms\server.exe

REM ── Launch Go CMS in new window ───────────────────────────────────────────
echo.
echo [START] Launching Go CMS API server (new window)...
start "Go CMS API  :1337" cmd /k "cd /d "%GOCMS_DIR%" && echo. && echo  Go CMS API  ^|  http://localhost:1337/api && echo  Press Ctrl+C to stop. && echo. && server.exe"

REM ── Skip frontend when --server flag is used ──────────────────────────────
if "%SERVER_ONLY%"=="true" goto skip_ui

echo [INFO]  Waiting 5 s for API to initialise before starting UI...
timeout /t 5 /nobreak >nul

REM ── Install frontend deps if needed ──────────────────────────────────────
cd /d "%FRONTEND_DIR%"
if not exist "node_modules\" (
    echo [NPM]  node_modules missing — running npm install...
    call npm install
    if %errorlevel% neq 0 (
        echo [ERR] npm install failed.
        pause & exit /b 1
    )
)

REM ── Launch React frontend in new window ───────────────────────────────────
echo.
echo [START] Launching React UI (new window)...
start "React UI  :8080" cmd /k "cd /d "%FRONTEND_DIR%" && echo. && echo  React UI  ^|  http://localhost:8080 && echo  Press Ctrl+C to stop. && echo. && npm run dev"

:skip_ui

REM ── Summary ───────────────────────────────────────────────────────────────
echo.
echo  ============================================
echo   All services started!
echo  ============================================
echo.
if "%SERVER_ONLY%"=="false" (
    echo   PostgreSQL  :  localhost:5433
    echo   MongoDB     :  localhost:27017
)
echo   Go CMS API  :  http://localhost:1337/api
if "%SERVER_ONLY%"=="false" echo   React UI    :  http://localhost:8080
echo.
echo   Two terminal windows have been opened.
echo   Close them (or press Ctrl+C inside them) to stop each service.
echo.
echo   To rebuild ^& restart the backend only (DB already running):
echo     gg_gocms.bat --server
echo.
if "%SERVER_ONLY%"=="false" (
    echo   To stop Docker databases:
    echo     docker compose -f backend\go-cms\docker-compose.yml stop
    echo.
)
pause
endlocal
