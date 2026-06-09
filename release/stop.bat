@echo off
REM =============================================================================
REM  GG-CMS — Stop all services
REM  Stops the native server.exe and all Docker containers.
REM =============================================================================
echo.
echo [STOP] Stopping GG-CMS...

taskkill /f /im server.exe >nul 2>&1
if %errorlevel%==0 (echo [OK]   API stopped.) else (echo [INFO] No API process found.)

cd /d "%~dp0"
docker compose -f docker-compose.native.yml down 2>&1 | findstr /v "^$"
echo [OK]   Docker services stopped.

echo.
echo  All services stopped.
pause
