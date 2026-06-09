<#
.SYNOPSIS
  GG-CMS — Full-stack Production Deployment Script (Windows PowerShell)
  Starts UI + API + Databases.

.DESCRIPTION
  Workflow:
    1. Build:   .\build.ps1              → populates dist\ with images
    2. Deploy:  .\deploy.ps1 -Load       → loads dist\ images, starts stack

  OR single command (source must be alongside release\):
    .\deploy.ps1 -Build                  → build from source then start

.PARAMETER Load
  Load pre-built images from dist\images\ before starting. No source required.

.PARAMETER Build
  Build images from source before starting.

.PARAMETER NoCache
  Force full Docker rebuild (implies -Build).

.PARAMETER WithTools
  Also start pgAdmin.

.PARAMETER Down
  Stop and remove all containers.

.PARAMETER Logs
  Stream live logs.

.EXAMPLE
  .\deploy.ps1              # start with existing Docker images
  .\deploy.ps1 -Load        # load from dist\ then start (air-gapped)
  .\deploy.ps1 -Build       # build from source then start
  .\deploy.ps1 -WithTools   # include pgAdmin
  .\deploy.ps1 -Down        # stop all services
  .\deploy.ps1 -Logs        # tail logs
#>

param(
    [switch]$Load,
    [switch]$Build,
    [switch]$NoCache,
    [switch]$WithTools,
    [switch]$Down,
    [switch]$Logs
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

if ($NoCache) { $Build = $true }

# ── Helpers ───────────────────────────────────────────────────────────────────
function Header([string]$m) {
    Write-Host ""
    Write-Host "══════════════════════════════════════" -ForegroundColor Cyan
    Write-Host "  $m" -ForegroundColor Cyan
    Write-Host "══════════════════════════════════════" -ForegroundColor Cyan
}
function Info([string]$m)  { Write-Host "  [INFO]  $m" -ForegroundColor Gray }
function Ok([string]$m)    { Write-Host "  [OK]    $m" -ForegroundColor Green }
function Warn([string]$m)  { Write-Host "  [WARN]  $m" -ForegroundColor Yellow }
function Fail([string]$m)  { Write-Host "  [ERROR] $m" -ForegroundColor Red; exit 1 }

Header "GG-CMS — Full-stack Deploy"

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { Fail "docker not found. Install Docker Desktop." }
try { docker compose version | Out-Null } catch { Fail "docker compose plugin not found." }
$v = (docker --version) -replace "Docker version ","" -replace ",.*",""
Ok "Docker $v"

# ── Docker Desktop running check ──────────────────────────────────────────────
$dockerReady = $false
try { docker info 2>&1 | Out-Null; $dockerReady = $true } catch {}
if (-not $dockerReady) {
    Warn "Docker Desktop not running — attempting to start..."
    $desktopPath = @(
        "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe",
        "$env:LOCALAPPDATA\Programs\Docker\Docker\Docker Desktop.exe"
    ) | Where-Object { Test-Path $_ } | Select-Object -First 1
    if ($desktopPath) {
        Start-Process $desktopPath
        Write-Host "  Waiting for Docker..." -NoNewline
        for ($i=0; $i -lt 45; $i++) {
            Start-Sleep 2
            try { docker info 2>&1 | Out-Null; $dockerReady = $true; break } catch {}
            Write-Host "." -NoNewline
        }
        Write-Host ""
        if (-not $dockerReady) { Fail "Docker Desktop did not start. Open it manually." }
    } else { Fail "Docker Desktop not found." }
}

# ── Handle -Down / -Logs ──────────────────────────────────────────────────────
if ($Down) { docker compose down; Ok "All services stopped."; exit 0 }
if ($Logs) { docker compose logs -f --tail=100; exit 0 }

# ── Data directories ──────────────────────────────────────────────────────────
Header "Preparing directories"
@("data\postgres","data\mongodb","data\mongodb-config","data\uploads","data\pgadmin") | ForEach-Object {
    New-Item -ItemType Directory -Force -Path $_ | Out-Null; Ok $_
}

# ── Environment ───────────────────────────────────────────────────────────────
Header "Environment"
if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Warn ".env created — edit required values then re-run"
    Write-Host "  Required: POSTGRES_PASSWORD  MONGO_PASSWORD  JWT_SECRET  ADMIN_PASSWORD" -ForegroundColor Yellow
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
function Get-EnvVal([string]$key,[string]$def) {
    if ($envContent -match "(?m)^$key=(.+)$") { return $Matches[1].Trim() }
    return $def
}
$frontendPort = Get-EnvVal "FRONTEND_PORT" "80"
$backendPort  = Get-EnvVal "BACKEND_PORT"  "8080"
$pgadminPort  = Get-EnvVal "PGADMIN_PORT"  "5050"

# ── Load pre-built images from dist\ ─────────────────────────────────────────
if ($Load) {
    Header "Loading images from dist\"
    foreach ($imgName in @("gg-cms-backend","gg-cms-frontend")) {
        $f = "dist\images\$imgName.tar.gz"
        if (-not (Test-Path $f)) { Fail "Image not found: $f  Run: .\build.ps1 first" }
        Info "Loading $imgName..."
        $bytes = [System.IO.File]::ReadAllBytes((Resolve-Path $f))
        $ms = New-Object System.IO.MemoryStream(,$bytes)
        $gzip = New-Object System.IO.Compression.GZipStream($ms,[System.IO.Compression.CompressionMode]::Decompress)
        docker load 2>&1 | Out-Null
        # Simpler: use docker load with tar file directly if gzip not needed
        docker load -i $f 2>&1 | Out-Null
        Ok "$imgName`:latest loaded"
    }
    foreach ($base in @("postgres-16-alpine","mongo-7-jammy")) {
        $f = "dist\images\$base.tar.gz"
        if (Test-Path $f) {
            Info "Loading $base..."
            docker load -i $f 2>&1 | Out-Null
            Ok "$base loaded"
        }
    }
}

# ── Build ──────────────────────────────────────────────────────────────────────
$profileArgs = @()
if ($WithTools) {
    $profileArgs = @("--profile","tools")
    Info "pgAdmin enabled (port: $pgadminPort)"
}

if ($Build) {
    Header "Building images from source (release mode)"
    $buildArgs = @("compose") + $profileArgs + @("build")
    if ($NoCache) { $buildArgs += "--no-cache" }
    & docker @buildArgs
    if ($LASTEXITCODE -ne 0) { Fail "Image build failed." }
    Ok "Images built"
}

# ── Start ──────────────────────────────────────────────────────────────────────
Header "Starting services"
$upArgs = @("compose") + $profileArgs + @("up","-d")
& docker @upArgs
if ($LASTEXITCODE -ne 0) { Fail "Failed to start services." }
Ok "Services started"

Header "Service status"
docker compose ps

# ── Access ────────────────────────────────────────────────────────────────────
Header "Access"
Write-Host "  UI:       http://localhost:$frontendPort" -ForegroundColor Green
Write-Host "  API:      http://localhost:$backendPort/api/health" -ForegroundColor Green
if ($WithTools) { Write-Host "  pgAdmin:  http://localhost:$pgadminPort" -ForegroundColor Green }
Write-Host ""
Write-Host "  Logs:  .\deploy.ps1 -Logs"
Write-Host "  Stop:  .\deploy.ps1 -Down"
Write-Host ""

Start-Job -ScriptBlock { Start-Sleep 6; Start-Process "http://localhost:$using:frontendPort" } | Out-Null
