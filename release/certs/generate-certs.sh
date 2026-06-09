#!/usr/bin/env bash
# GG-CMS — Internal CA and mTLS Certificate Generator
#
# Creates:
#   ca/            Root CA (10 years)
#   postgres/      Server cert for PostgreSQL TLS
#   mongodb/       Server cert for MongoDB TLS  (server.pem = key + cert)
#   backend/       Server cert (HTTPS API) + client cert (DB connections)
#   frontend/      Server cert (HTTPS UI)  + client cert (proxy → backend)
#
# Usage (run from the release/ folder):
#   bash certs/generate-certs.sh
#   bash certs/generate-certs.sh --host api.example.com --days 365
#
# Options:
#   --host <hostname>   Extra hostname SAN for frontend/backend certs (default: localhost)
#   --days <n>          Service cert validity in days (default: 825)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

DAYS=825
CA_DAYS=3650
HOST="localhost"

for arg in "$@"; do
  case $arg in --days=*) DAYS="${arg#*=}" ;; --host=*) HOST="${arg#*=}" ;; esac
done
# Handle --host <value> and --days <value> (space-separated)
PREV=""
for arg in "$@"; do
  [ "$PREV" = "--host" ]  && HOST="$arg"
  [ "$PREV" = "--days" ]  && DAYS="$arg"
  PREV="$arg"
done

header()  { echo ""; echo "══════════════════════════════════════"; echo "  $*"; echo "══════════════════════════════════════"; }
ok()      { echo "  [OK]    $*"; }
info()    { echo "  [INFO]  $*"; }

header "GG-CMS — Internal CA and mTLS Certificates"
info "Service cert validity : $DAYS days"
info "CA validity           : $CA_DAYS days"
info "External hostname SAN : $HOST"
echo ""

command -v openssl &>/dev/null || { echo "  [ERR] openssl not found. Install it first."; exit 1; }
info "OpenSSL: $(openssl version)"

mkdir -p ca postgres mongodb backend frontend

# ══ ROOT CA ═══════════════════════════════════════════════════════════════════
header "Root CA"

if [ ! -f ca/ca.key ]; then
  openssl genrsa -out ca/ca.key 4096
  ok "ca/ca.key (4096-bit RSA)"
else
  info "ca/ca.key already exists — reusing (delete to regenerate)"
fi

# CA config
cat > /tmp/gg-cms-ca.cnf << EOF
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
EOF

openssl req -new -x509 \
  -key ca/ca.key \
  -out ca/ca.crt \
  -days "$CA_DAYS" \
  -config /tmp/gg-cms-ca.cnf
ok "ca/ca.crt (valid $CA_DAYS days)"

# ── Helper: issue a certificate ────────────────────────────────────────────────
# issue_cert <out_dir> <cn> <san> <keyUsage> <extKeyUsage> <out_basename>
issue_cert() {
  local DIR="$1" CN="$2" SAN="$3" KEY_USAGE="$4" EXT_KEY_USAGE="$5" NAME="$6"

  openssl genrsa -out "$DIR/$NAME.key" 2048

  cat > /tmp/gg-cms-"$NAME".cnf << EOF
[req]
distinguished_name = dn
prompt             = no
[dn]
CN = $CN
O  = GG-CMS
OU = Services
[ext]
subjectAltName    = $SAN
keyUsage          = critical,$KEY_USAGE
extendedKeyUsage  = $EXT_KEY_USAGE
basicConstraints  = CA:FALSE
EOF

  openssl req -new \
    -key "$DIR/$NAME.key" \
    -out "$DIR/$NAME.csr" \
    -config /tmp/gg-cms-"$NAME".cnf

  openssl x509 -req \
    -in "$DIR/$NAME.csr" \
    -CA ca/ca.crt -CAkey ca/ca.key -CAcreateserial \
    -out "$DIR/$NAME.crt" \
    -days "$DAYS" \
    -extensions ext \
    -extfile /tmp/gg-cms-"$NAME".cnf

  rm -f "$DIR/$NAME.csr" /tmp/gg-cms-"$NAME".cnf

  # Combined PEM (key + cert) — required by MongoDB, convenient for others
  cat "$DIR/$NAME.key" "$DIR/$NAME.crt" > "$DIR/$NAME.pem"

  # Copy CA cert into service dir for runtime verification
  cp ca/ca.crt "$DIR/ca.crt"

  ok "$DIR/$NAME.crt  (CN=$CN)"
}

# ══ PostgreSQL ═════════════════════════════════════════════════════════════════
header "PostgreSQL — server cert"
issue_cert "postgres" \
  "postgres" \
  "DNS:postgres,DNS:localhost,IP:127.0.0.1" \
  "digitalSignature,keyEncipherment" \
  "serverAuth" \
  "server"

# ══ MongoDB ════════════════════════════════════════════════════════════════════
header "MongoDB — server cert"
issue_cert "mongodb" \
  "mongodb" \
  "DNS:mongodb,DNS:localhost,IP:127.0.0.1" \
  "digitalSignature,keyEncipherment" \
  "serverAuth" \
  "server"

# ══ Backend ════════════════════════════════════════════════════════════════════
header "Backend — server cert (HTTPS API)"
issue_cert "backend" \
  "backend" \
  "DNS:backend,DNS:localhost,DNS:${HOST},IP:127.0.0.1" \
  "digitalSignature,keyEncipherment" \
  "serverAuth" \
  "server"

header "Backend — client cert (DB connections)"
# CN must match gg_cms_user so PostgreSQL clientcert=verify-full accepts it
issue_cert "backend" \
  "gg_cms_user" \
  "DNS:backend,DNS:localhost" \
  "digitalSignature" \
  "clientAuth" \
  "client"

# ══ Frontend (Nginx) ════════════════════════════════════════════════════════════
header "Frontend — server cert (HTTPS UI)"
issue_cert "frontend" \
  "frontend" \
  "DNS:frontend,DNS:localhost,DNS:${HOST},IP:127.0.0.1" \
  "digitalSignature,keyEncipherment" \
  "serverAuth" \
  "server"

header "Frontend — client cert (proxy to backend)"
issue_cert "frontend" \
  "frontend-client" \
  "DNS:frontend,DNS:localhost" \
  "digitalSignature" \
  "clientAuth" \
  "client"

# ── Permissions ────────────────────────────────────────────────────────────────
header "Permissions"
find . -name "*.key" -exec chmod 600 {} \;
find . -name "*.pem" -exec chmod 600 {} \;
find . -name "*.crt" -exec chmod 644 {} \;
chmod 600 ca/ca.key
ok "*.key / *.pem → 600   *.crt → 644"

# ── Verify all certs against CA ────────────────────────────────────────────────
header "Verifying certificates"
for CERT in postgres/server.crt mongodb/server.crt backend/server.crt backend/client.crt frontend/server.crt frontend/client.crt; do
  openssl verify -CAfile ca/ca.crt "$CERT" > /dev/null && ok "$CERT"
done

# ── Summary ────────────────────────────────────────────────────────────────────
header "Done — $(find . -name '*.crt' | wc -l | tr -d ' ') certificates issued"
find . -type f | sort | while IFS= read -r f; do
  printf "  %s\n" "$f"
done
echo ""
echo "  Next steps:"
echo "    1. Keep release/certs/ alongside release/ on every machine"
echo "    2. bash deploy.sh --build   OR   bash deploy.sh --load"
echo "    3. Access UI at https://localhost (self-signed — trust ca/ca.crt in your browser)"
echo ""
echo "  To trust the CA in your browser / OS:"
echo "    macOS:   sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain ca/ca.crt"
echo "    Linux:   sudo cp ca/ca.crt /usr/local/share/ca-certificates/gg-cms.crt && sudo update-ca-certificates"
echo "    Windows: certutil -addstore Root ca\\ca.crt"
echo ""
