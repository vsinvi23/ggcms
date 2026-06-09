<#
.SYNOPSIS
  GG-CMS — Backend-only Deployment Script (Windows PowerShell)
  Starts PostgreSQL + MongoDB + Go API. No frontend required.

.PARAMETER Build
  Build the backend Docker image from source before starting.

.PARAMETER Load
  Load pre-built image from dist/images/ before starting (no source needed).

.PARAMETER NoCache
  Force full Docker rebuild (implies -Build).

.PARAMETER WithTools
  Also start pgAdmin.

.PARAMETER Down
  Stop and remove backend containers.

.PARAMETER Logs
  Stream live logs.

.EXAMPLE
  .\deploy-backend.ps1              # start with existing images
  .\deploy-backend.ps1 -Build       # build image then start
  .\deploy-backend.ps1 -Load        # load from dist/ then start
  .\deploy-backend.ps1 -WithTools   # include pgAdmin
  .\deploy-backend.ps1 -Down        # stop all backend services
  .\deploy-backend.ps1 -Logs        # tail logs
#>

param(
    [switch]$Build,
    [switch]$Load,
    [switch]$NoCache,
    [switch]$WithTools,
    [switch]$Down,
    [switch]$Logs
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ScriptDir     = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir
$ComposeFile   = "docker-compose.backend.yml"

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

Header "GG-CMS — Backend Deploy"

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { Fail "docker not found. Install Docker Desktop." }
try { docker compose version | Out-Null } catch { Fail "docker compose plugin not found." }
$v = (docker --version) -replace "Docker version ","" -replace ",.*",""
Ok "Docker $v"

# ── Handle -Down / -Logs ──────────────────────────────────────────────────────
if ($Down) {
    docker compose -f $ComposeFile down
    Ok "Backend services stopped."
    exit 0
}
if ($Logs) {
    docker compose -f $ComposeFile logs -f --tail=100
    exit 0
}

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

# ── Load pre-built images ─────────────────────────────────────────────────────
if ($Load) {
    Header "Loading images from dist\"
    $img = "dist\images\gg-cms-backend.tar.gz"
    if (-not (Test-Path $img)) { Fail "Image not found: $img  Run: .\build.ps1 first" }
    Info "Loading gg-cms-backend..."
    Get-Content $img -Raw -Encoding Byte | docker load
    Ok "gg-cms-backend:latest loaded"

    foreach ($base in @("postgres-16-alpine","mongo-7-jammy")) {
        $f = "dist\images\$base.tar.gz"
        if (Test-Path $f) {
            Info "Loading $base..."
            Get-Content $f -Raw -Encoding Byte | docker load
            Ok "$base loaded"
        }
    }
}

# ── Build ──────────────────────────────────────────────────────────────────────
$profileArgs = @()
if ($WithTools) { $profileArgs = @("--profile","tools") }

if ($Build) {
    Header "Building backend image (release mode)"
    $buildArgs = @("compose","-f",$ComposeFile) + $profileArgs + @("build")
    if ($NoCache) { $buildArgs += "--no-cache" }
    & docker @buildArgs
    if ($LASTEXITCODE -ne 0) { Fail "Backend image build failed." }
    Ok "Backend image built"
}

# ── Start ──────────────────────────────────────────────────────────────────────
Header "Starting backend services"
$upArgs = @("compose","-f",$ComposeFile) + $profileArgs + @("up","-d")
& docker @upArgs
if ($LASTEXITCODE -ne 0) { Fail "Failed to start services." }
Ok "Services started"

Header "Service status"
docker compose -f $ComposeFile ps

# ── Access ────────────────────────────────────────────────────────────────────
Header "Access"
$envContent = Get-Content ".env" -Raw
function Get-EnvVal([string]$key,[string]$def) {
    if ($envContent -match "(?m)^$key=(.+)$") { return $Matches[1].Trim() }
    return $def
}
$backendPort = Get-EnvVal "BACKEND_PORT" "8080"
$hostIp      = (Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias "Ethernet*","Wi-Fi*" -ErrorAction SilentlyContinue |
                Select-Object -First 1).IPAddress
if (-not $hostIp) { $hostIp = "localhost" }

Write-Host "  API (local):   http://localhost:$backendPort/api/health" -ForegroundColor Green
Write-Host "  API (network): http://${hostIp}:$backendPort/api/health" -ForegroundColor Green
if ($WithTools) {
    $pgPort = Get-EnvVal "PGADMIN_PORT" "5050"
    Write-Host "  pgAdmin:       http://localhost:$pgPort" -ForegroundColor Green
}
Write-Host ""
Write-Host "  Point your frontend VITE_API_BASE_URL to: http://${hostIp}:$backendPort/api"
Write-Host ""
Write-Host "  Logs:  .\deploy-backend.ps1 -Logs"
Write-Host "  Stop:  .\deploy-backend.ps1 -Down"
Write-Host ""
