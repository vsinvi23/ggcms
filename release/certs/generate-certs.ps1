<#
.SYNOPSIS
  GG-CMS — Internal CA and mTLS Certificate Generator (Windows)
  Requires OpenSSL — bundled with Git for Windows, or install standalone.

.PARAMETER Host
  Extra hostname SAN for frontend/backend certs (default: localhost).

.PARAMETER Days
  Service certificate validity in days (default: 825).

.EXAMPLE
  .\generate-certs.ps1
  .\generate-certs.ps1 -Host api.example.com -Days 365
#>

param(
    [string]$Host = "localhost",
    [int]$Days    = 825
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

$CA_DAYS = 3650

function Header([string]$m) {
    Write-Host ""
    Write-Host "══════════════════════════════════════" -ForegroundColor Cyan
    Write-Host "  $m" -ForegroundColor Cyan
    Write-Host "══════════════════════════════════════" -ForegroundColor Cyan
}
function Ok([string]$m)   { Write-Host "  [OK]    $m" -ForegroundColor Green }
function Info([string]$m) { Write-Host "  [INFO]  $m" -ForegroundColor Gray }
function Fail([string]$m) { Write-Host "  [ERROR] $m" -ForegroundColor Red; exit 1 }

Header "GG-CMS — Internal CA and mTLS Certificates"
Info "Service cert validity : $Days days"
Info "CA validity           : $CA_DAYS days"
Info "External hostname SAN : $Host"

# ── Locate openssl ─────────────────────────────────────────────────────────────
$openssl = $null
foreach ($candidate in @(
    "openssl",
    "C:\Program Files\Git\usr\bin\openssl.exe",
    "C:\Program Files\OpenSSL-Win64\bin\openssl.exe",
    "$env:LOCALAPPDATA\Programs\Git\usr\bin\openssl.exe"
)) {
    try {
        $r = Get-Command $candidate -ErrorAction SilentlyContinue
        if ($r) { $openssl = $r.Source; break }
    } catch {}
    if ((Test-Path $candidate)) { $openssl = $candidate; break }
}
if (-not $openssl) { Fail "openssl not found. Install Git for Windows or OpenSSL." }
Info "OpenSSL: $openssl"

# ── Directories ────────────────────────────────────────────────────────────────
@("ca","postgres","mongodb","backend","frontend") | ForEach-Object {
    New-Item -ItemType Directory -Force -Path $_ | Out-Null
}

# ── Helper: run openssl ────────────────────────────────────────────────────────
function Ssl { & $openssl @args; if ($LASTEXITCODE -ne 0) { Fail "openssl failed: $args" } }

# ── Helper: write temp CNF ────────────────────────────────────────────────────
function WriteCnf([string]$path, [string]$content) {
    [System.IO.File]::WriteAllText($path, $content, [System.Text.Encoding]::ASCII)
}

# ── Helper: issue a certificate ───────────────────────────────────────────────
function IssueCert([string]$dir, [string]$cn, [string]$san,
                   [string]$keyUsage, [string]$extKeyUsage, [string]$name) {

    Ssl genrsa -out "$dir\$name.key" 2048

    $cnf = @"
[req]
distinguished_name = dn
prompt             = no
[dn]
CN = $cn
O  = GG-CMS
OU = Services
[ext]
subjectAltName   = $san
keyUsage         = critical,$keyUsage
extendedKeyUsage = $extKeyUsage
basicConstraints = CA:FALSE
"@
    $cnfPath = "$env:TEMP\gg-cms-$name.cnf"
    WriteCnf $cnfPath $cnf

    Ssl req -new -key "$dir\$name.key" -out "$dir\$name.csr" -config $cnfPath
    Ssl x509 -req `
        -in "$dir\$name.csr" `
        -CA "ca\ca.crt" -CAkey "ca\ca.key" -CAcreateserial `
        -out "$dir\$name.crt" `
        -days $Days `
        -extensions ext -extfile $cnfPath

    Remove-Item "$dir\$name.csr" -Force -ErrorAction SilentlyContinue
    Remove-Item $cnfPath -Force -ErrorAction SilentlyContinue

    # Combined PEM (key + cert) required by MongoDB
    $keyData  = Get-Content "$dir\$name.key" -Raw
    $certData = Get-Content "$dir\$name.crt" -Raw
    [System.IO.File]::WriteAllText("$dir\$name.pem", $keyData + $certData, [System.Text.Encoding]::ASCII)

    # Copy CA cert into service dir
    Copy-Item "ca\ca.crt" "$dir\ca.crt" -Force

    Ok "$dir\$name.crt  (CN=$cn)"
}

# ══ ROOT CA ═══════════════════════════════════════════════════════════════════
Header "Root CA"

if (-not (Test-Path "ca\ca.key")) {
    Ssl genrsa -out "ca\ca.key" 4096
    Ok "ca\ca.key (4096-bit RSA)"
} else {
    Info "ca\ca.key already exists — reusing (delete to regenerate)"
}

$caCnf = @"
[req]
distinguished_name = dn
x509_extensions    = v3_ca
prompt             = no
[dn]
CN = GG-CMS Internal CA
O  = GG-CMS
OU = Infrastructure
[v3_ca]
basicConstraints       = critical,CA:TRUE,pathlen:1
keyUsage               = critical,keyCertSign,cRLSign
subjectKeyIdentifier   = hash
"@
$caCnfPath = "$env:TEMP\gg-cms-ca.cnf"
WriteCnf $caCnfPath $caCnf

Ssl req -new -x509 -key "ca\ca.key" -out "ca\ca.crt" -days $CA_DAYS -config $caCnfPath
Remove-Item $caCnfPath -Force -ErrorAction SilentlyContinue
Ok "ca\ca.crt (valid $CA_DAYS days)"

# ══ PostgreSQL ═════════════════════════════════════════════════════════════════
Header "PostgreSQL — server cert"
IssueCert "postgres" "postgres" `
    "DNS:postgres,DNS:localhost,IP:127.0.0.1" `
    "digitalSignature,keyEncipherment" "serverAuth" "server"

# ══ MongoDB ════════════════════════════════════════════════════════════════════
Header "MongoDB — server cert"
IssueCert "mongodb" "mongodb" `
    "DNS:mongodb,DNS:localhost,IP:127.0.0.1" `
    "digitalSignature,keyEncipherment" "serverAuth" "server"

# ══ Backend ════════════════════════════════════════════════════════════════════
Header "Backend — server cert (HTTPS API)"
IssueCert "backend" "backend" `
    "DNS:backend,DNS:localhost,DNS:$Host,IP:127.0.0.1" `
    "digitalSignature,keyEncipherment" "serverAuth" "server"

Header "Backend — client cert (DB connections)"
IssueCert "backend" "gg_cms_user" `
    "DNS:backend,DNS:localhost" `
    "digitalSignature" "clientAuth" "client"

# ══ Frontend ════════════════════════════════════════════════════════════════════
Header "Frontend — server cert (HTTPS UI)"
IssueCert "frontend" "frontend" `
    "DNS:frontend,DNS:localhost,DNS:$Host,IP:127.0.0.1" `
    "digitalSignature,keyEncipherment" "serverAuth" "server"

Header "Frontend — client cert (proxy to backend)"
IssueCert "frontend" "frontend-client" `
    "DNS:frontend,DNS:localhost" `
    "digitalSignature" "clientAuth" "client"

# ── Verify all certs ─────────────────────────────────────────────────────────
Header "Verifying certificates"
foreach ($cert in @(
    "postgres\server.crt","mongodb\server.crt",
    "backend\server.crt","backend\client.crt",
    "frontend\server.crt","frontend\client.crt"
)) {
    Ssl verify -CAfile "ca\ca.crt" $cert 2>&1 | Out-Null
    Ok $cert
}

# ── Summary ───────────────────────────────────────────────────────────────────
Header "Done"
Get-ChildItem -Recurse -File | Sort-Object FullName | ForEach-Object {
    Write-Host "  $($_.FullName.Replace($ScriptDir + '\', ''))"
}
Write-Host ""
Write-Host "  Next steps:" -ForegroundColor Green
Write-Host "    1. Keep release\certs\ alongside release\ on every machine"
Write-Host "    2. .\deploy.ps1 -Build   OR   .\deploy.ps1 -Load"
Write-Host "    3. Access UI at https://localhost (trust ca\ca.crt to remove browser warning)"
Write-Host ""
Write-Host "  Trust CA in Windows:"
Write-Host "    certutil -addstore Root certs\ca\ca.crt"
Write-Host ""
