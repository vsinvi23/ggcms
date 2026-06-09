<#
.SYNOPSIS
  GG-CMS — Windows Deployment Script

.PARAMETER WithTools
  Also start pgAdmin database UI.

.PARAMETER NoCache
  Force full Docker image rebuild.

.PARAMETER Down
  Stop and remove all GG-CMS containers.

.PARAMETER Logs
  Stream live logs from all services.

.EXAMPLE
  .\deploy.ps1
  .\deploy.ps1 -WithTools
  .\deploy.ps1 -NoCache
  .\deploy.ps1 -Down
  .\deploy.ps1 -Logs
#>

param(
    [switch]$WithTools,
    [switch]$NoCache,
    [switch]$Down,
    [switch]$Logs
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ScriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Path
$ReleaseDir  = (Resolve-Path "$ScriptDir\..\.." ).Path
Set-Location $ReleaseDir

# ── Helpers ───────────────────────────────────────────────────────────────────
function Write-Header([string]$msg) {
    Write-Host ""
    Write-Host "══════════════════════════════════════" -ForegroundColor Cyan
    Write-Host "  $msg" -ForegroundColor Cyan
    Write-Host "══════════════════════════════════════" -ForegroundColor Cyan
}
function Info([string]$m)  { Write-Host "  [INFO]  $m" -ForegroundColor Gray }
function Ok([string]$m)    { Write-Host "  [OK]    $m" -ForegroundColor Green }
function Warn([string]$m)  { Write-Host "  [WARN]  $m" -ForegroundColor Yellow }
function Fail([string]$m)  { Write-Host "  [ERROR] $m" -ForegroundColor Red; exit 1 }

Write-Header "GG-CMS — Windows Deploy"

# ── Docker Desktop check ──────────────────────────────────────────────────────
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Fail "Docker not found. Install Docker Desktop: https://docs.docker.com/desktop/windows/"
}

# Check Docker daemon is reachable (Desktop may be installed but not started)
$dockerRunning = $false
try { docker info 2>&1 | Out-Null; $dockerRunning = $true } catch {}
if (-not $dockerRunning) {
    Warn "Docker Desktop not running — attempting to start..."
    $desktopPath = @(
        "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe",
        "$env:LOCALAPPDATA\Programs\Docker\Docker\Docker Desktop.exe"
    ) | Where-Object { Test-Path $_ } | Select-Object -First 1

    if ($desktopPath) {
        Start-Process $desktopPath
        Write-Host "  Waiting for Docker to start (up to 90s)..." -NoNewline
        for ($i = 0; $i -lt 45; $i++) {
            Start-Sleep 2
            try { docker info 2>&1 | Out-Null; $dockerRunning = $true; break } catch {}
            Write-Host "." -NoNewline
        }
        Write-Host ""
        if (-not $dockerRunning) { Fail "Docker Desktop did not start. Open it manually and retry." }
    } else {
        Fail "Docker Desktop executable not found. Install: https://docs.docker.com/desktop/windows/"
    }
}
Ok "Docker Desktop running"

try { docker compose version | Out-Null } catch {
    Fail "docker compose plugin not found. Update Docker Desktop."
}

# ── Handle -Down ──────────────────────────────────────────────────────────────
if ($Down) {
    docker compose down
    Ok "All services stopped."
    exit 0
}

# ── Handle -Logs ──────────────────────────────────────────────────────────────
if ($Logs) {
    docker compose logs -f --tail=100
    exit 0
}

# ── Data directories (bind mounts) ────────────────────────────────────────────
Write-Header "Preparing directories"
@("data\postgres","data\mongodb","data\mongodb-config","data\uploads","data\pgadmin") | ForEach-Object {
    New-Item -ItemType Directory -Force -Path $_ | Out-Null
    Ok $_
}

# ── Environment ───────────────────────────────────────────────────────────────
Write-Header "Environment"
if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Warn ".env created from .env.example — edit it then re-run"
    Write-Host ""
    Write-Host "  Required values to change:" -ForegroundColor Yellow
    Write-Host "    POSTGRES_PASSWORD  MONGO_PASSWORD  JWT_SECRET  ADMIN_PASSWORD"
    Write-Host ""
    Write-Host "  Open .env to edit:" -ForegroundColor Gray
    Write-Host "    notepad .env"
    Write-Host ""
    # Open in Notepad for easy editing
    Start-Process notepad ".env"
    exit 0
}
Ok ".env present"

if (-not (Test-Path "config\backend\app.env")) {
    Copy-Item "config\backend\app.env.example" "config\backend\app.env"
    Info "config\backend\app.env created"
}
Ok "config\backend\app.env ready"
Ok "config\frontend\nginx.conf ready"

# ── Read ports from .env ──────────────────────────────────────────────────────
$envContent = Get-Content ".env" -Raw
function Get-EnvVal([string]$key, [string]$default) {
    if ($envContent -match "(?m)^$key=(.+)$") { return $Matches[1].Trim() }
    return $default
}
$frontendPort = Get-EnvVal "FRONTEND_PORT" "80"
$backendPort  = Get-EnvVal "BACKEND_PORT"  "8080"
$pgadminPort  = Get-EnvVal "PGADMIN_PORT"  "5050"

# ── Build ──────────────────────────────────────────────────────────────────────
Write-Header "Building Docker images (release mode)"

$profileArgs = @()
if ($WithTools) {
    $profileArgs = @("--profile", "tools")
    Info "pgAdmin enabled (port: $pgadminPort)"
}

$buildArgs = @("compose") + $profileArgs + @("build")
if ($NoCache) { $buildArgs += "--no-cache" }
& docker @buildArgs
if ($LASTEXITCODE -ne 0) { Fail "Image build failed." }
Ok "Images built"

# ── Start ──────────────────────────────────────────────────────────────────────
Write-Header "Starting services"
$upArgs = @("compose") + $profileArgs + @("up", "-d")
& docker @upArgs
if ($LASTEXITCODE -ne 0) { Fail "Failed to start services." }
Ok "Services started"

# ── Status ────────────────────────────────────────────────────────────────────
Write-Header "Service status"
docker compose ps

# ── Access URLs ───────────────────────────────────────────────────────────────
Write-Header "Access"
Write-Host "  UI:   http://localhost:$frontendPort" -ForegroundColor Green
Write-Host "  API:  http://localhost:$backendPort/api/health" -ForegroundColor Green
if ($WithTools) {
    Write-Host "  pgAdmin: http://localhost:$pgadminPort" -ForegroundColor Green
}
Write-Host ""
Write-Host "  Logs:  .\deploy.ps1 -Logs"
Write-Host "  Stop:  .\deploy.ps1 -Down"
Write-Host ""

# Open browser after a short delay
Start-Job -ScriptBlock {
    Start-Sleep 6
    Start-Process "http://localhost:$using:frontendPort"
} | Out-Null
