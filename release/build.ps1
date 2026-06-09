<#
.SYNOPSIS
  GG-CMS — Root Build Script (Windows)
  Auto-delegates to platforms\windows\build.ps1.
  All output lands in release\dist\ — the release folder becomes self-contained.

.PARAMETER DockerOnly
  Build Docker images only (no native binary).

.PARAMETER NativeOnly
  Build native Windows/Linux/Mac binaries only (no Docker).

.PARAMETER AllPlatforms
  Build native binaries for all OS/arch combinations.

.PARAMETER NoCache
  Force full Docker rebuild.

.PARAMETER BackendOnly
  Build backend image only (skip frontend build).

.PARAMETER Platform
  Docker target platform: amd64 (default) or arm64.

.EXAMPLE
  .\build.ps1                        # full build — Docker images + native binaries
  .\build.ps1 -DockerOnly            # Docker images only
  .\build.ps1 -BackendOnly           # backend Docker image only
  .\build.ps1 -AllPlatforms          # all OS/arch native binaries
  .\build.ps1 -NoCache               # force full rebuild
  .\build.ps1 -Platform arm64        # target ARM64 Docker image

# After build:
#   dist\images\gg-cms-backend.tar    ← backend Docker image
#   dist\images\gg-cms-frontend.tar   ← frontend Docker image
#   dist\bin\gg-cms-server-*.exe      ← Windows binary
#   dist\bin\gg-cms-server-linux-*    ← Linux binaries
#   dist\frontend\                     ← Vite production bundle
#
# Deploy after build:
#   .\deploy.ps1 -Load               ← loads dist\ images, no source needed
#   .\deploy-backend.ps1 -Load       ← backend-only equivalent
#>

param(
    [switch]$DockerOnly,
    [switch]$NativeOnly,
    [switch]$AllPlatforms,
    [switch]$NoCache,
    [switch]$BackendOnly,
    [string]$Platform = "amd64"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

function Header([string]$m) {
    Write-Host ""
    Write-Host "══════════════════════════════════════" -ForegroundColor Cyan
    Write-Host "  $m" -ForegroundColor Cyan
    Write-Host "══════════════════════════════════════" -ForegroundColor Cyan
}
function Info([string]$m) { Write-Host "  [INFO]  $m" -ForegroundColor Gray }
function Ok([string]$m)   { Write-Host "  [OK]    $m" -ForegroundColor Green }

Header "GG-CMS — Build  [platform: windows]"
Info "Source root : $(Resolve-Path '..\gg-cms')"
Info "Output dir  : $ScriptDir\dist"

# ── Build platform script args ─────────────────────────────────────────────────
$platformArgs = @()
if ($DockerOnly -or $BackendOnly) { $platformArgs += "-DockerOnly" }
if ($NativeOnly)                  { $platformArgs += "-NativeOnly" }
if ($AllPlatforms)                { $platformArgs += "-AllPlatforms" }
if ($NoCache)                     { $platformArgs += "-NoCache" }
if ($Platform)                    { $platformArgs += "-Platform"; $platformArgs += $Platform }
# Always export so dist\ is populated for self-contained deployment
if (-not $NativeOnly)             { $platformArgs += "-Export" }

if ($BackendOnly) {
    Info "Backend-only build — skipping frontend and native binaries"
}

# ── Delegate ───────────────────────────────────────────────────────────────────
$platformScript = "$ScriptDir\platforms\windows\build.ps1"
if (-not (Test-Path $platformScript)) {
    Write-Host "  [ERROR] Platform script not found: $platformScript" -ForegroundColor Red
    exit 1
}

Info "Running: platforms\windows\build.ps1 $($platformArgs -join ' ')"
Write-Host ""

& $platformScript @platformArgs
if ($LASTEXITCODE -ne 0) { Write-Host "  [ERROR] Build failed." -ForegroundColor Red; exit 1 }

# ── Post-build summary ─────────────────────────────────────────────────────────
Header "Build complete — dist\"
if (Test-Path "dist") {
    Get-ChildItem -Recurse "dist" -File | Sort-Object FullName | ForEach-Object {
        $size = if ($_.Length -ge 1MB) { "{0:N1} MB" -f ($_.Length/1MB) }
                elseif ($_.Length -ge 1KB) { "{0:N1} KB" -f ($_.Length/1KB) }
                else { "$($_.Length) B" }
        Write-Host ("  {0,8}  {1}" -f $size, $_.FullName.Replace("$ScriptDir\dist\",""))
    }
}
Write-Host ""
Write-Host "  Next: deploy from this folder" -ForegroundColor Green
Write-Host "    Full stack:   .\deploy.ps1 -Load"
Write-Host "    Backend only: .\deploy-backend.ps1 -Load"
Write-Host ""
