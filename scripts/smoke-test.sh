#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-http://localhost:5000}"
PASSED=0
FAILED=0
TOTAL=0

test_endpoint() {
  local method="$1" url="$2" expected_status="$3" body_contains="${4:-}"
  TOTAL=$((TOTAL + 1))

  if [ "$method" = "POST" ]; then
    local response=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL$url" -H "Content-Type: application/json" -d '{}')
  else
    local response=$(curl -s -w "\n%{http_code}" "$BASE_URL$url")
  fi

  local status=$(echo "$response" | tail -1)
  local body=$(echo "$response" | sed '$d')

  if [ "$status" = "$expected_status" ]; then
    if [ -n "$body_contains" ] && ! echo "$body" | grep -q "$body_contains"; then
      echo "FAIL [$method $url] — status $status OK but body missing '$body_contains'"
      FAILED=$((FAILED + 1))
      return
    fi
    echo "PASS [$method $url] → $status"
    PASSED=$((PASSED + 1))
  else
    echo "FAIL [$method $url] — expected $expected_status, got $status"
    FAILED=$((FAILED + 1))
  fi
}

echo "=== Ultra Computer Smoke Tests ==="
echo "Target: $BASE_URL"
echo ""

# Core endpoints
test_endpoint GET /api/health 200 "status"
test_endpoint GET /api/models 200
test_endpoint GET /api/skills 200
test_endpoint GET /api/memory 200
test_endpoint GET /api/connectors 200
test_endpoint GET /api/conversations 200
test_endpoint GET /api/settings 200
test_endpoint GET /api/setup/status 200 "firstRun"
test_endpoint GET /api/setup/detect 200 "os"
test_endpoint GET /api/swarm/sessions 200

# Engine endpoints
test_endpoint GET /api/sandbox/config 200
test_endpoint GET /api/cache/stats 200
test_endpoint GET /api/autonomy/health 200
test_endpoint GET /api/protocols/a2a/card 200
test_endpoint GET /api/messaging/channels 200
test_endpoint GET /api/identity/stats 200
test_endpoint GET /api/marketplace/skills 200
test_endpoint GET /api/knowledge 200

# Auth endpoints
test_endpoint GET /api/auth/setup-status 200
test_endpoint GET /api/docs 200

# Subsystem endpoints
test_endpoint GET /api/nip/sessions 200
test_endpoint GET /api/crucible/stats 200
test_endpoint GET /api/sentinel/stats 200
test_endpoint GET /api/browser/sessions 200
test_endpoint GET /api/all-agent-runs 200

echo ""
echo "=== Results: $PASSED passed, $FAILED failed, $TOTAL total ==="
[ "$FAILED" -eq 0 ] && echo "ALL TESTS PASSED" && exit 0
echo "SOME TESTS FAILED" && exit 1
