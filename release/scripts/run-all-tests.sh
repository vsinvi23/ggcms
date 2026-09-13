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

# 2. Content Factory Python Tests
echo "▶ Running AI Content Factory pytest suite..."
PYTHON_EXEC="python3"
if [[ -f "$REPO_ROOT/content-factory/.venv/bin/python3" ]]; then
  PYTHON_EXEC="$REPO_ROOT/content-factory/.venv/bin/python3"
fi

(cd content-factory && \
 JWT_SECRET="${JWT_SECRET:-testsecret}" \
 FACTORY_SYNC_SECRET="${FACTORY_SYNC_SECRET:-testsecret}" \
 MOCK_MODE=true \
 PYTHONPATH=. \
 "$PYTHON_EXEC" -m pytest tests/unit tests/integration)

# 3. GG-CMS React UI SPA Build
echo "▶ Verifying GG-CMS React UI SPA frontend build..."
(cd gg-cms/frontend/react-ui && npm run build)

# 4. Content Factory React SPA Build
echo "▶ Verifying AI Content Factory React SPA frontend build..."
(cd content-factory/frontend && npm run build)

echo "============================================================"
echo "✅ All Sanity & Automated Test Suites Passed Successfully!"
echo "============================================================"
