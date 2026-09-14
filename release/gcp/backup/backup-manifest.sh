#!/usr/bin/env bash
# GG-CMS — Unified Backup Manifest Generator
# Stitches PostgreSQL and MongoDB backup details, SHA-256 checksums, and release contract fields
# into a single backup-manifest.json recovery envelope.

set -euo pipefail

ENV_TARGET="prod"
DEPLOYMENT_ID=""
PG_FILE=""
PG_SIZE=""
PG_HASH=""
MONGO_FILE=""
MONGO_SIZE=""
MONGO_HASH=""
OUTPUT_FILE=""

usage() {
  echo "Usage: bash release/gcp/backup/backup-manifest.sh [OPTIONS]"
  echo ""
  echo "Options:"
  echo "  --env <prod|test|local>     Target environment (default: prod)"
  echo "  --deployment-id <id>        Deployment contract ID"
  echo "  --pg-file <filename>        PostgreSQL dump filename"
  echo "  --pg-size <size>            PostgreSQL dump file size"
  echo "  --pg-hash <sha256>          PostgreSQL dump SHA-256 hash"
  echo "  --mongo-file <filename>     MongoDB snapshot filename"
  echo "  --mongo-size <size>         MongoDB snapshot file size"
  echo "  --mongo-hash <sha256>       MongoDB snapshot SHA-256 hash"
  echo "  --output <path>             Path to write backup-manifest.json"
  echo "  --help                      Display this help message"
  exit 0
}

while [[ $# -gt 0 ]]; do
  case $1 in
    --env) ENV_TARGET="$2"; shift 2 ;;
    --deployment-id) DEPLOYMENT_ID="$2"; shift 2 ;;
    --pg-file) PG_FILE="$2"; shift 2 ;;
    --pg-size) PG_SIZE="$2"; shift 2 ;;
    --pg-hash) PG_HASH="$2"; shift 2 ;;
    --mongo-file) MONGO_FILE="$2"; shift 2 ;;
    --mongo-size) MONGO_SIZE="$2"; shift 2 ;;
    --mongo-hash) MONGO_HASH="$2"; shift 2 ;;
    --output) OUTPUT_FILE="$2"; shift 2 ;;
    --help|-h) usage ;;
    *) echo "Unknown option: $1"; usage ;;
  esac
done

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

if [[ -z "$DEPLOYMENT_ID" ]]; then
  DEPLOYMENT_ID="$(date +%Y-%m-%d)-${ENV_TARGET}-001"
fi

python3 -c "
import json, os, glob

env = '$ENV_TARGET'
contract_path = f'release/ga/{env}/latest/deployment-contract.json'
contract = {}

if os.path.exists(contract_path):
    try:
        contract = json.load(open(contract_path))
    except Exception:
        pass

manifest = {
    'manifest_version': '1.0.0',
    'timestamp': '$TIMESTAMP',
    'environment': '$ENV_TARGET',
    'deployment_id': '$DEPLOYMENT_ID',
    'ui_version': contract.get('ui_version', '1.0.0'),
    'backend_version': contract.get('backend_version', '1.0.0'),
    'db_migration_version': contract.get('db_migration_version', '001'),
    'db_schema_hash': contract.get('db_schema_hash', ''),
    'api_contract_version': contract.get('api_contract_version', 'v1'),
    'postgres': {
        'filename': '$PG_FILE',
        'size': '$PG_SIZE',
        'sha256': '$PG_HASH'
    },
    'mongodb': {
        'filename': '$MONGO_FILE',
        'size': '$MONGO_SIZE',
        'sha256': '$MONGO_HASH'
    }
}

out_path = '$OUTPUT_FILE'
if not out_path:
    out_path = f'backup-manifest-{manifest[\"deployment_id\"]}.json'

with open(out_path, 'w') as f:
    json.dump(manifest, f, indent=2)

print(f'✅ Backup manifest generated: {out_path}')
"
