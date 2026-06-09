<#
.SYNOPSIS
  GG-CMS — Windows Build Script
  Builds Docker images (for deployment) and native Windows/Linux binaries.

.PARAMETER DockerOnly
  Build Docker images only (skip native binary build).

.PARAMETER NativeOnly
  Build native binaries only (skip Docker).

.PARAMETER Export
  Export Docker images as .tar.gz files for offline/air-gapped deployment.

.PARAMETER NoCache
  Force full Docker rebuild (no layer cache).

.PARAMETER Platform
  Docker target platform: amd64 (default) or arm64.

.EXAMPLE
  .\build.ps1                        # Docker images + native binaries
  .\build.ps1 -DockerOnly            # Docker images only
  .\build.ps1 -NativeOnly            # Native binaries only
  .\build.ps1 -Export                # Build images and save as .tar.gz
  .\build.ps1 -NoCache               # Force full rebuild
  .\build.ps1 -Platform arm64        # Target ARM64 for Docker
#>

param(
    [switch]$DockerOnly,
    [switch]$NativeOnly,
    [switch]$Export,
    [switch]$NoCache,
    [string]$Platform = "amd64"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ScriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Path
$ReleaseDir  = (Resolve-Path "$ScriptDir\..\.." ).Path
$RepoRoot    = (Resolve-Path "$ReleaseDir\.." ).Path
$BackendSrc  = "$RepoRoot\gg-cms\backend\go-cms"
$FrontendSrc = "$RepoRoot\gg-cms\frontend\react-ui"
$OutDir      = "$ReleaseDir\dist"
Set-Location $ReleaseDir

$BuildDocker = -not $NativeOnly
$BuildNative = -not $DockerOnly
$TargetPlatform = "linux/$Platform"

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

Write-Header "GG-CMS — Windows Build"
Info "Docker target platform: $TargetPlatform"

# ── Output directories ────────────────────────────────────────────────────────
@("$OutDir\bin", "$OutDir\frontend", "$OutDir\images") | ForEach-Object {
    New-Item -ItemType Directory -Force -Path $_ | Out-Null
}

# ══ DOCKER IMAGE BUILD ════════════════════════════════════════════════════════
if ($BuildDocker) {
    Write-Header "Docker Image Build"

    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        Fail "Docker not found. Install Docker Desktop: https://docs.docker.com/desktop/windows/"
    }
    try { docker info 2>&1 | Out-Null } catch {
        Fail "Docker Desktop is not running. Start it first."
    }

    $env:DOCKER_DEFAULT_PLATFORM = $TargetPlatform

    # Ensure .env exists for build args
    if (-not (Test-Path ".env")) {
        Copy-Item ".env.example" ".env"
        Warn ".env created from example — fill required values before deploying"
    }

    $buildArgs = @("compose", "build")
    if ($NoCache) { $buildArgs += "--no-cache" }

    Info "Building backend image (gg-cms-backend:latest)..."
    & docker @($buildArgs + @("backend"))
    if ($LASTEXITCODE -ne 0) { Fail "Backend image build failed." }
    Ok "Backend image built"

    Info "Building frontend image (gg-cms-frontend:latest)..."
    & docker @($buildArgs + @("frontend"))
    if ($LASTEXITCODE -ne 0) { Fail "Frontend image build failed." }
    Ok "Frontend image built"

    # ── Export images ──────────────────────────────────────────────────────────
    if ($Export) {
        Write-Header "Exporting images"

        $images = @(
            @{ name = "gg-cms-backend:latest";  file = "gg-cms-backend.tar.gz" },
            @{ name = "gg-cms-frontend:latest"; file = "gg-cms-frontend.tar.gz" },
            @{ name = "postgres:16-alpine";      file = "postgres-16-alpine.tar.gz" },
            @{ name = "mongo:7-jammy";           file = "mongo-7-jammy.tar.gz" }
        )

        foreach ($img in $images) {
            Info "Saving $($img.name)..."
            # Pull base images if not present
            if ($img.name -notmatch "gg-cms") {
                docker pull $img.name 2>&1 | Out-Null
            }
            $outFile = "$OutDir\images\$($img.file)"
            docker save $img.name | & { [System.IO.File]::WriteAllBytes($outFile, [System.IO.Stream]::new()) } 2>&1 | Out-Null
            # Use docker save piped through gzip if available
            docker save $img.name -o "$OutDir\images\$($img.name -replace '[:\/]', '-').tar"
            Ok "Saved: dist\images\$($img.file -replace '.gz','.tar')"
        }

        Write-Host ""
        Write-Host "  Load on target server:" -ForegroundColor Gray
        Write-Host "    docker load -i gg-cms-backend.tar" -ForegroundColor Gray
        Write-Host "    docker compose up -d" -ForegroundColor Gray
    }
}

# ══ NATIVE BINARY BUILD ═══════════════════════════════════════════════════════
if ($BuildNative) {
    Write-Header "Native Binary Build"

    # ── Go binary ──────────────────────────────────────────────────────────────
    if (-not (Get-Command go -ErrorAction SilentlyContinue)) {
        Fail "Go not found. Install: https://go.dev/dl/ or: winget install GoLang.Go"
    }
    $goVer = (go version)
    Info "Go: $goVer"

    Set-Location $BackendSrc

    $targets = @(
        @{ OS = "windows"; Arch = "amd64"; Ext = ".exe" },
        @{ OS = "linux";   Arch = "amd64"; Ext = "" },
        @{ OS = "linux";   Arch = "arm64"; Ext = "" },
        @{ OS = "darwin";  Arch = "amd64"; Ext = "" },
        @{ OS = "darwin";  Arch = "arm64"; Ext = "" }
    )

    foreach ($t in $targets) {
        $outBin = "$OutDir\bin\gg-cms-server-$($t.OS)-$($t.Arch)$($t.Ext)"
        Info "Building $($t.OS)/$($t.Arch)..."
        $env:CGO_ENABLED = "0"
        $env:GOOS        = $t.OS
        $env:GOARCH      = $t.Arch
        go build -a -ldflags="-w -s" -o $outBin .\cmd\server
        if ($LASTEXITCODE -ne 0) { Fail "Build failed for $($t.OS)/$($t.Arch)" }
        Ok "dist\bin\gg-cms-server-$($t.OS)-$($t.Arch)$($t.Ext)"
    }
    # Reset env
    Remove-Item Env:\CGO_ENABLED, Env:\GOOS, Env:\GOARCH -ErrorAction SilentlyContinue

    Set-Location $ReleaseDir

    # ── Frontend Vite production bundle ────────────────────────────────────────
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        Fail "Node.js not found. Install: https://nodejs.org or: winget install OpenJS.NodeJS.LTS"
    }
    Info "Node: $(node --version)"

    Set-Location $FrontendSrc

    Info "Installing frontend dependencies..."
    npm ci --silent
    Ok "Dependencies installed"

    # Load VITE_ vars from release .env
    if (Test-Path "$ReleaseDir\.env") {
        Get-Content "$ReleaseDir\.env" | Where-Object { $_ -match "^VITE_" } | ForEach-Object {
            $parts = $_ -split "=", 2
            [System.Environment]::SetEnvironmentVariable($parts[0], $parts[1], "Process")
        }
    }
    $env:VITE_APP_ENV = "production"

    Info "Building React production bundle..."
    npm run build
    if ($LASTEXITCODE -ne 0) { Fail "Frontend build failed." }

    Copy-Item -Recurse -Force "dist\*" "$OutDir\frontend\"
    Ok "Frontend bundle saved to dist\frontend\"

    Set-Location $ReleaseDir
}

# ── Summary ───────────────────────────────────────────────────────────────────
Write-Header "Build complete"
Write-Host "  Output: $OutDir" -ForegroundColor Green
Write-Host ""
Get-ChildItem -Recurse "$OutDir" -File | Sort-Object FullName | ForEach-Object {
    $size = "{0,8}" -f (Format-FileSize $_.Length)
    Write-Host "    $size  $($_.FullName.Replace($OutDir + '\', ''))"
}
Write-Host ""

function Format-FileSize([long]$bytes) {
    if ($bytes -ge 1MB) { return "{0:N1} MB" -f ($bytes / 1MB) }
    if ($bytes -ge 1KB) { return "{0:N1} KB" -f ($bytes / 1KB) }
    return "$bytes B"
}
