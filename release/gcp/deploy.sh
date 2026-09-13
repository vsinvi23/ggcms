#!/usr/bin/env bash
set -e

# Delegation script — forwards to production delta deployment script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec bash "$SCRIPT_DIR/../deploy-prod.sh" "$@"

