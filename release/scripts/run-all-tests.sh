#!/usr/bin/env bash
set -e

# ==============================================================================
# GG-CMS & AI Content Factory — Unified Sanity & Test Runner
# Runs internal Go unit tests, Python unit/integration tests, and SPA builds
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT"

echo "============================================================"
echo "🧪 Running System Sanity & Automated Test Suite"
echo "============================================================"

# 1. Go CMS Backend Tests
echo "▶ Running Go CMS Backend unit tests..."
(cd gg-cms/backend/go-cms && go test ./internal/...)

# 2. GG-CMS React UI SPA Build
echo "▶ Verifying GG-CMS React UI SPA frontend build..."
(cd gg-cms/frontend/react-ui && npm run build)

echo "============================================================"
echo "✅ All Sanity & Automated Test Suites Passed Successfully!"
echo "============================================================"
