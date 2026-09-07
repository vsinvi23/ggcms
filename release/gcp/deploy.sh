#!/usr/bin/env bash
set -e

# Delegation script — forwards to production deployment script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec bash "$SCRIPT_DIR/production/deploy.sh" "$@"
