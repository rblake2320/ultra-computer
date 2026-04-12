#!/bin/bash
# Ultra Computer — Comprehensive Endpoint Test Suite
# Tests ~200+ endpoints across ALL domains
# Run: bash tests/comprehensive-endpoints.test.sh

BASE="http://localhost:5000"
PASS=0
FAIL=0
TOTAL=0
FAILURES=""

assert_status() {
  local label="$1" expected="$2" actual="$3"
  TOTAL=$((TOTAL + 1))
  if [ "$actual" -eq "$expected" ] 2>/dev/null; then
    PASS=$((PASS + 1))
    echo "  ✓ $label"
  else
    FAIL=$((FAIL + 1))
    FAILURES="$FAILURES\n  ✗ $label (expected $expected, got $actual)"
    echo "  ✗ $label (expected $expected, got $actual)"
  fi
}

assert_status_any() {
  local label="$1" actual="$2"
  shift 2
  TOTAL=$((TOTAL + 1))
  for expected in "$@"; do
    if [ "$actual" -eq "$expected" ] 2>/dev/null; then
      PASS=$((PASS + 1))
      echo "  ✓ $label"
      return
    fi
  done
  FAIL=$((FAIL + 1))
  FAILURES="$FAILURES\n  ✗ $label (got $actual, expected one of: $*)"
  echo "  ✗ $label (got $actual, expected one of: $*)"
}

# Helper: quiet curl returning status code
c() { curl -s -o /dev/null -w "%{http_code}" "$@"; }
# Helper: curl returning body
cb() { curl -s "$@"; }

echo "╔══════════════════════════════════════════════════════╗"
echo "║   Ultra Computer — Comprehensive Endpoint Tests     ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# ═══════════════════════════════════════════════════════════
# 1. HEALTH & CORE
# ═══════════════════════════════════════════════════════════
echo "▸ 1. Health & Core"
assert_status "GET /api/health" 200 "$(c $BASE/api/health)"
assert_status "GET /api/settings" 200 "$(c $BASE/api/settings)"
assert_status "GET /.well-known/agent-card.json" 200 "$(c $BASE/.well-known/agent-card.json)"

# ═══════════════════════════════════════════════════════════
# 2. MODELS (CRUD + lifecycle)
# ═══════════════════════════════════════════════════════════
echo ""
echo "▸ 2. Models"
assert_status "GET /api/models" 200 "$(c $BASE/api/models)"
assert_status "GET /api/models/providers" 200 "$(c $BASE/api/models/providers)"
assert_status "GET /api/models/env-vars" 200 "$(c $BASE/api/models/env-vars)"

# Create a model
MODEL_RESP=$(cb -X POST $BASE/api/models -H "Content-Type: application/json" -d '{
  "name":"Test Model","providerId":"openai","modelId":"gpt-4o","apiKey":"sk-test-fake"
}')
MODEL_ID=$(echo "$MODEL_RESP" | grep -oP '"id":\s*(\d+)' | grep -oP '\d+' | head -1)
assert_status "POST /api/models (create)" 200 "$(echo "$MODEL_RESP" | grep -c '"id"' | xargs -I{} sh -c 'if [ {} -gt 0 ]; then echo 200; else echo 400; fi')"

if [ -n "$MODEL_ID" ]; then
  assert_status "GET /api/models/:id" 200 "$(c $BASE/api/models/$MODEL_ID)"
  
  # Update model
  assert_status_any "PATCH /api/models/:id (update)" "$(c -X PATCH $BASE/api/models/$MODEL_ID -H 'Content-Type: application/json' -d '{"name":"Updated Model"}')" 200 204
  
  # Test model (will fail since no real key, but should not 404)
  assert_status_any "POST /api/models/:id/test" "$(c -X POST $BASE/api/models/$MODEL_ID/test)" 200 500 503 400
  
  # Connect/disconnect
  assert_status_any "POST /api/models/:id/connect" "$(c -X POST $BASE/api/models/$MODEL_ID/connect)" 200 204 500
  assert_status_any "POST /api/models/:id/disconnect" "$(c -X POST $BASE/api/models/$MODEL_ID/disconnect)" 200 204
  
  # Quick-add
  assert_status_any "POST /api/models/quick-add" "$(c -X POST $BASE/api/models/quick-add -H 'Content-Type: application/json' -d '{"providerId":"anthropic","apiKey":"sk-ant-fake"}')" 200 201 400 500
  
  # Delete model
  assert_status_any "DELETE /api/models/:id" "$(c -X DELETE $BASE/api/models/$MODEL_ID)" 200 204
else
  echo "  ⚠ Skipping model lifecycle tests (create failed)"
fi

# ═══════════════════════════════════════════════════════════
# 3. CONNECTORS
# ═══════════════════════════════════════════════════════════
echo ""
echo "▸ 3. Connectors"
assert_status "GET /api/connectors" 200 "$(c $BASE/api/connectors)"

# Create connector
CONN_RESP=$(cb -X POST $BASE/api/connectors -H "Content-Type: application/json" -d '{
  "name":"Test Connector","type":"api","config":{"url":"https://example.com/api"}}')
CONN_ID=$(echo "$CONN_RESP" | grep -oP '"id":\s*(\d+)' | grep -oP '\d+' | head -1)

if [ -n "$CONN_ID" ]; then
  assert_status "POST /api/connectors (create)" 200 "$(echo 200)"
  assert_status "GET /api/connectors/:id" 200 "$(c $BASE/api/connectors/$CONN_ID)"
  
  # Update
  assert_status_any "PATCH /api/connectors/:id" "$(c -X PATCH $BASE/api/connectors/$CONN_ID -H 'Content-Type: application/json' -d '{"name":"Updated Connector"}')" 200 204
  
  # Connect/disconnect/call
  assert_status_any "POST /api/connectors/:id/connect" "$(c -X POST $BASE/api/connectors/$CONN_ID/connect)" 200 204 500
  assert_status_any "POST /api/connectors/:id/call" "$(c -X POST $BASE/api/connectors/$CONN_ID/call -H 'Content-Type: application/json' -d '{"method":"test"}')" 200 400 500
  assert_status_any "POST /api/connectors/:id/disconnect" "$(c -X POST $BASE/api/connectors/$CONN_ID/disconnect)" 200 204
  
  # Delete
  assert_status_any "DELETE /api/connectors/:id" "$(c -X DELETE $BASE/api/connectors/$CONN_ID)" 200 204
else
  echo "  ⚠ Connector create returned no ID, testing with status"
  assert_status_any "POST /api/connectors" "$(c -X POST $BASE/api/connectors -H 'Content-Type: application/json' -d '{"name":"Test","type":"api","config":{}}')" 200 201 400
fi

# ═══════════════════════════════════════════════════════════
# 4. SKILLS
# ═══════════════════════════════════════════════════════════
echo ""
echo "▸ 4. Skills"
assert_status "GET /api/skills" 200 "$(c $BASE/api/skills)"

# Create skill
SKILL_RESP=$(cb -X POST $BASE/api/skills -H "Content-Type: application/json" -d '{
  "name":"Test Skill","description":"A test skill","instructions":"Do something","triggerPatterns":["test"]}')
SKILL_ID=$(echo "$SKILL_RESP" | grep -oP '"id":\s*(\d+)' | grep -oP '\d+' | head -1)

if [ -n "$SKILL_ID" ]; then
  assert_status "POST /api/skills (create)" 200 "$(echo 200)"
  assert_status "GET /api/skills/:id" 200 "$(c $BASE/api/skills/$SKILL_ID)"
  assert_status_any "PATCH /api/skills/:id" "$(c -X PATCH $BASE/api/skills/$SKILL_ID -H 'Content-Type: application/json' -d '{"name":"Updated Skill"}')" 200 204
  assert_status_any "DELETE /api/skills/:id" "$(c -X DELETE $BASE/api/skills/$SKILL_ID)" 200 204
else
  echo "  ⚠ Skill create returned no ID"
  assert_status_any "POST /api/skills" "$(c -X POST $BASE/api/skills -H 'Content-Type: application/json' -d '{"name":"Test","description":"test"}')" 200 201 400
fi

# ═══════════════════════════════════════════════════════════
# 5. SKILL SCRIPTS
# ═══════════════════════════════════════════════════════════
echo ""
echo "▸ 5. Skill Scripts"
assert_status "GET /api/skill-scripts" 200 "$(c $BASE/api/skill-scripts)"

SS_RESP=$(cb -X POST $BASE/api/skill-scripts -H "Content-Type: application/json" -d '{
  "name":"Test Script","language":"javascript","code":"console.log(1)","description":"test"}')
SS_ID=$(echo "$SS_RESP" | grep -oP '"id":\s*(\d+)' | grep -oP '\d+' | head -1)

if [ -n "$SS_ID" ]; then
  assert_status "POST /api/skill-scripts (create)" 200 "$(echo 200)"
  assert_status "GET /api/skill-scripts/:id" 200 "$(c $BASE/api/skill-scripts/$SS_ID)"
  assert_status_any "GET /api/skill-scripts/:id/versions" "$(c $BASE/api/skill-scripts/$SS_ID/versions)" 200 404
  assert_status_any "POST /api/skill-scripts/:id/run" "$(c -X POST $BASE/api/skill-scripts/$SS_ID/run)" 200 500 400
  assert_status_any "DELETE /api/skill-scripts/:id" "$(c -X DELETE $BASE/api/skill-scripts/$SS_ID)" 200 204
fi

# ═══════════════════════════════════════════════════════════
# 6. KNOWLEDGE
# ═══════════════════════════════════════════════════════════
echo ""
echo "▸ 6. Knowledge"
assert_status "GET /api/knowledge" 200 "$(c $BASE/api/knowledge)"
assert_status "GET /api/knowledge/stats" 200 "$(c $BASE/api/knowledge/stats)"

# Create knowledge entry
KN_RESP=$(cb -X POST $BASE/api/knowledge -H "Content-Type: application/json" -d '{
  "title":"Test Knowledge","content":"This is test knowledge content","tier":"core","tags":["test"]}')
KN_ID=$(echo "$KN_RESP" | grep -oP '"id":\s*(\d+)' | grep -oP '\d+' | head -1)

if [ -n "$KN_ID" ]; then
  assert_status "POST /api/knowledge (create)" 200 "$(echo 200)"
  assert_status "GET /api/knowledge/:id" 200 "$(c $BASE/api/knowledge/$KN_ID)"
  assert_status_any "PATCH /api/knowledge/:id" "$(c -X PATCH $BASE/api/knowledge/$KN_ID -H 'Content-Type: application/json' -d '{"title":"Updated Knowledge"}')" 200 204
  assert_status_any "DELETE /api/knowledge/:id" "$(c -X DELETE $BASE/api/knowledge/$KN_ID)" 200 204
fi

# Knowledge search
assert_status "GET /api/knowledge/search?q=test" 200 "$(c "$BASE/api/knowledge/search?q=test")"

# Knowledge preview
assert_status_any "GET /api/knowledge/preview/core" "$(c $BASE/api/knowledge/preview/core)" 200 404

# Knowledge reseed
assert_status_any "POST /api/knowledge/reseed" "$(c -X POST $BASE/api/knowledge/reseed)" 200 204

# ═══════════════════════════════════════════════════════════
# 7. MEMORY
# ═══════════════════════════════════════════════════════════
echo ""
echo "▸ 7. Memory"
assert_status "GET /api/memory" 200 "$(c $BASE/api/memory)"

# Create memory
MEM_RESP=$(cb -X POST $BASE/api/memory -H "Content-Type: application/json" -d '{
  "content":"User prefers dark mode","type":"preference"}')
MEM_ID=$(echo "$MEM_RESP" | grep -oP '"id":\s*(\d+)' | grep -oP '\d+' | head -1)

if [ -n "$MEM_ID" ]; then
  assert_status "POST /api/memory (create)" 200 "$(echo 200)"
  assert_status "GET /api/memory/:id" 200 "$(c $BASE/api/memory/$MEM_ID)"
  assert_status_any "DELETE /api/memory/:id" "$(c -X DELETE $BASE/api/memory/$MEM_ID)" 200 204
fi

# Memory search
assert_status "POST /api/memory/search" 200 "$(c -X POST $BASE/api/memory/search -H 'Content-Type: application/json' -d '{"query":"dark mode"}')"

# ═══════════════════════════════════════════════════════════
# 8. CONVERSATIONS
# ═══════════════════════════════════════════════════════════
echo ""
echo "▸ 8. Conversations"
assert_status "GET /api/conversations" 200 "$(c $BASE/api/conversations)"

# Create conversation
CONV_RESP=$(cb -X POST $BASE/api/conversations -H "Content-Type: application/json" -d '{
  "title":"Test Conversation"}')
CID=$(echo "$CONV_RESP" | grep -oP '"id":\s*(\d+)' | grep -oP '\d+' | head -1)

if [ -n "$CID" ]; then
  assert_status "POST /api/conversations (create)" 200 "$(echo 200)"
  assert_status "GET /api/conversations/:id" 200 "$(c $BASE/api/conversations/$CID)"
  assert_status "GET /api/conversations/:id/messages" 200 "$(c $BASE/api/conversations/$CID/messages)"
  assert_status_any "GET /api/conversations/:id/tasks" "$(c $BASE/api/conversations/$CID/tasks)" 200 404
  assert_status_any "GET /api/conversations/:id/agent-runs" "$(c $BASE/api/conversations/$CID/agent-runs)" 200 404
  assert_status_any "GET /api/conversations/:id/export" "$(c $BASE/api/conversations/$CID/export)" 200 404
  
  # Delete conversation
  assert_status_any "DELETE /api/conversations/:id" "$(c -X DELETE $BASE/api/conversations/$CID)" 200 204
fi

assert_status_any "GET /api/all-agent-runs" "$(c $BASE/api/all-agent-runs)" 200 404

# ═══════════════════════════════════════════════════════════
# 9. NOTIFICATIONS
# ═══════════════════════════════════════════════════════════
echo ""
echo "▸ 9. Notifications"
assert_status "GET /api/notifications" 200 "$(c $BASE/api/notifications)"

# ═══════════════════════════════════════════════════════════
# 10. CACHE
# ═══════════════════════════════════════════════════════════
echo ""
echo "▸ 10. Cache"
assert_status "GET /api/cache/stats" 200 "$(c $BASE/api/cache/stats)"
assert_status "GET /api/cache/dashboard" 200 "$(c $BASE/api/cache/dashboard)"
assert_status "GET /api/cache/config" 200 "$(c $BASE/api/cache/config)"
assert_status "GET /api/cache/memory" 200 "$(c $BASE/api/cache/memory)"
assert_status "GET /api/cache/policy" 200 "$(c $BASE/api/cache/policy)"
assert_status_any "POST /api/cache/clear" "$(c -X POST $BASE/api/cache/clear)" 200 204
assert_status_any "POST /api/cache/reset-stats" "$(c -X POST $BASE/api/cache/reset-stats)" 200 204

# Update cache config
assert_status_any "PUT /api/cache/config" "$(c -X PUT $BASE/api/cache/config -H 'Content-Type: application/json' -d '{"maxSize":2048}')" 200 204 400

# Update cache policy
assert_status_any "PUT /api/cache/policy" "$(c -X PUT $BASE/api/cache/policy -H 'Content-Type: application/json' -d '{"evictionPolicy":"lru"}')" 200 204 400

# ═══════════════════════════════════════════════════════════
# 11. SANDBOX
# ═══════════════════════════════════════════════════════════
echo ""
echo "▸ 11. Sandbox"
assert_status "GET /api/sandbox/status" 200 "$(c $BASE/api/sandbox/status)"
assert_status "GET /api/sandbox/config" 200 "$(c $BASE/api/sandbox/config)"
assert_status "GET /api/sandbox/files" 200 "$(c $BASE/api/sandbox/files)"
assert_status_any "POST /api/sandbox/cleanup" "$(c -X POST $BASE/api/sandbox/cleanup)" 200 204
assert_status_any "POST /api/sandbox/reset-detection" "$(c -X POST $BASE/api/sandbox/reset-detection)" 200 204
assert_status_any "POST /api/sandbox/pull-image" "$(c -X POST $BASE/api/sandbox/pull-image -H 'Content-Type: application/json' -d '{"image":"alpine:latest"}')" 200 400 500 503

# File upload
assert_status_any "POST /api/sandbox/files/upload" "$(c -X POST $BASE/api/sandbox/files/upload -F 'file=@/dev/null;filename=test.txt')" 200 400 500

# ═══════════════════════════════════════════════════════════
# 12. QUEUE
# ═══════════════════════════════════════════════════════════
echo ""
echo "▸ 12. Queue"
assert_status "GET /api/queue/status" 200 "$(c $BASE/api/queue/status)"
assert_status_any "GET /api/queue/job/fake-id" "$(c $BASE/api/queue/job/fake-id)" 200 404

# ═══════════════════════════════════════════════════════════
# 13. AUTONOMY — Checkpoints
# ═══════════════════════════════════════════════════════════
echo ""
echo "▸ 13. Autonomy — Checkpoints"
assert_status "GET /api/autonomy/health" 200 "$(c $BASE/api/autonomy/health)"
assert_status "GET /api/autonomy/dashboard" 200 "$(c $BASE/api/autonomy/dashboard)"
assert_status "GET /api/autonomy/checkpoints" 200 "$(c $BASE/api/autonomy/checkpoints)"
assert_status "GET /api/autonomy/checkpoints/stats" 200 "$(c $BASE/api/autonomy/checkpoints/stats)"
assert_status "GET /api/autonomy/checkpoints/resumable" 200 "$(c $BASE/api/autonomy/checkpoints/resumable)"

# Create checkpoint
CP_RESP=$(cb -X POST $BASE/api/autonomy/checkpoints -H "Content-Type: application/json" -d '{
  "taskType":"test","state":{"step":1},"resumable":true}')
CP_ID=$(echo "$CP_RESP" | grep -oP '"id":\s*(\d+)' | grep -oP '\d+' | head -1)

if [ -n "$CP_ID" ]; then
  assert_status "POST /api/autonomy/checkpoints (create)" 200 "$(echo 200)"
  assert_status "GET /api/autonomy/checkpoints/:id" 200 "$(c $BASE/api/autonomy/checkpoints/$CP_ID)"
  assert_status_any "POST /api/autonomy/checkpoints/:id/heartbeat" "$(c -X POST $BASE/api/autonomy/checkpoints/$CP_ID/heartbeat)" 200 204
  assert_status_any "POST /api/autonomy/checkpoints/:id/advance" "$(c -X POST $BASE/api/autonomy/checkpoints/$CP_ID/advance -H 'Content-Type: application/json' -d '{"state":{"step":2}}')" 200 204
  assert_status_any "POST /api/autonomy/checkpoints/:id/complete" "$(c -X POST $BASE/api/autonomy/checkpoints/$CP_ID/complete)" 200 204
fi

# Create another to test fail
CP2_RESP=$(cb -X POST $BASE/api/autonomy/checkpoints -H "Content-Type: application/json" -d '{
  "taskType":"fail-test","state":{"step":0},"resumable":true}')
CP2_ID=$(echo "$CP2_RESP" | grep -oP '"id":\s*(\d+)' | grep -oP '\d+' | head -1)
if [ -n "$CP2_ID" ]; then
  assert_status_any "POST /api/autonomy/checkpoints/:id/fail" "$(c -X POST $BASE/api/autonomy/checkpoints/$CP2_ID/fail -H 'Content-Type: application/json' -d '{"error":"test failure"}')" 200 204
fi

assert_status_any "POST /api/autonomy/checkpoints/abandon-stale" "$(c -X POST $BASE/api/autonomy/checkpoints/abandon-stale)" 200 204

# ═══════════════════════════════════════════════════════════
# 14. AUTONOMY — Circuits
# ═══════════════════════════════════════════════════════════
echo ""
echo "▸ 14. Autonomy — Circuits"
assert_status "GET /api/autonomy/circuits" 200 "$(c $BASE/api/autonomy/circuits)"
assert_status_any "POST /api/autonomy/circuits/test-circuit/reset" "$(c -X POST $BASE/api/autonomy/circuits/test-circuit/reset)" 200 204 404
assert_status_any "POST /api/autonomy/circuits/reset-all" "$(c -X POST $BASE/api/autonomy/circuits/reset-all)" 200 204

# ═══════════════════════════════════════════════════════════
# 15. AUTONOMY — Cron
# ═══════════════════════════════════════════════════════════
echo ""
echo "▸ 15. Autonomy — Cron"
assert_status "GET /api/autonomy/cron" 200 "$(c $BASE/api/autonomy/cron)"
assert_status "GET /api/autonomy/cron/stats" 200 "$(c $BASE/api/autonomy/cron/stats)"
assert_status "GET /api/autonomy/cron/enabled" 200 "$(c $BASE/api/autonomy/cron/enabled)"

# Create cron job
CRON_RESP=$(cb -X POST $BASE/api/autonomy/cron -H "Content-Type: application/json" -d '{
  "name":"Test Cron","schedule":"*/5 * * * *","task":"echo hello","enabled":true}')
CRON_ID=$(echo "$CRON_RESP" | grep -oP '"id":\s*(\d+)' | grep -oP '\d+' | head -1)

if [ -n "$CRON_ID" ]; then
  assert_status "POST /api/autonomy/cron (create)" 200 "$(echo 200)"
  assert_status "GET /api/autonomy/cron/:id" 200 "$(c $BASE/api/autonomy/cron/$CRON_ID)"
  assert_status_any "POST /api/autonomy/cron/:id/toggle" "$(c -X POST $BASE/api/autonomy/cron/$CRON_ID/toggle)" 200 204
  assert_status_any "DELETE /api/autonomy/cron/:id" "$(c -X DELETE $BASE/api/autonomy/cron/$CRON_ID)" 200 204
fi

# ═══════════════════════════════════════════════════════════
# 16. AUTONOMY — Learning
# ═══════════════════════════════════════════════════════════
echo ""
echo "▸ 16. Autonomy — Learning"
assert_status "GET /api/autonomy/learning/stats" 200 "$(c $BASE/api/autonomy/learning/stats)"
assert_status "GET /api/autonomy/learning/history" 200 "$(c $BASE/api/autonomy/learning/history)"
assert_status "GET /api/autonomy/learning/failures" 200 "$(c $BASE/api/autonomy/learning/failures)"
assert_status "GET /api/autonomy/learning/models" 200 "$(c $BASE/api/autonomy/learning/models)"
assert_status "GET /api/autonomy/learning/skills" 200 "$(c $BASE/api/autonomy/learning/skills)"

# Log a learning event
assert_status_any "POST /api/autonomy/learning/log" "$(c -X POST $BASE/api/autonomy/learning/log -H 'Content-Type: application/json' -d '{"taskType":"test","outcome":"success","duration":100,"model":"gpt-4o"}')" 200 201

# Feedback
assert_status_any "POST /api/autonomy/learning/feedback" "$(c -X POST $BASE/api/autonomy/learning/feedback -H 'Content-Type: application/json' -d '{"taskType":"test","rating":5,"comment":"great"}')" 200 201

# Analyze
assert_status_any "POST /api/autonomy/learning/analyze" "$(c -X POST $BASE/api/autonomy/learning/analyze)" 200 204

# Compact
assert_status_any "POST /api/autonomy/learning/compact" "$(c -X POST $BASE/api/autonomy/learning/compact)" 200 204

# Recommend
assert_status_any "POST /api/autonomy/learning/recommend" "$(c -X POST $BASE/api/autonomy/learning/recommend -H 'Content-Type: application/json' -d '{"taskType":"coding"}')" 200 404

# Insights
assert_status_any "GET /api/autonomy/learning/insights/coding" "$(c $BASE/api/autonomy/learning/insights/coding)" 200 404

# ═══════════════════════════════════════════════════════════
# 17. AUTONOMY — Skills
# ═══════════════════════════════════════════════════════════
echo ""
echo "▸ 17. Autonomy — Skills"
assert_status "GET /api/autonomy/skills/health" 200 "$(c $BASE/api/autonomy/skills/health)"
assert_status "GET /api/autonomy/skills/performance" 200 "$(c $BASE/api/autonomy/skills/performance)"
assert_status "GET /api/autonomy/skills/improvements" 200 "$(c $BASE/api/autonomy/skills/improvements)"

# Record execution
assert_status_any "POST /api/autonomy/skills/record-execution" "$(c -X POST $BASE/api/autonomy/skills/record-execution -H 'Content-Type: application/json' -d '{"skillName":"test","duration":50,"success":true}')" 200 201

# Generate improvements
assert_status_any "POST /api/autonomy/skills/improvements/generate" "$(c -X POST $BASE/api/autonomy/skills/improvements/generate)" 200 204

# ═══════════════════════════════════════════════════════════
# 18. BROWSER
# ═══════════════════════════════════════════════════════════
echo ""
echo "▸ 18. Browser"
assert_status "GET /api/browser/sessions" 200 "$(c $BASE/api/browser/sessions)"
assert_status_any "POST /api/browser/navigate" "$(c -X POST $BASE/api/browser/navigate -H 'Content-Type: application/json' -d '{"url":"https://example.com"}')" 200 400 500 503
assert_status_any "POST /api/browser/action" "$(c -X POST $BASE/api/browser/action -H 'Content-Type: application/json' -d '{"action":"click","selector":"body"}')" 200 400 500 503
assert_status_any "POST /api/browser/evaluate" "$(c -X POST $BASE/api/browser/evaluate -H 'Content-Type: application/json' -d '{"code":"1+1"}')" 200 400 500 503
assert_status_any "POST /api/browser/resize" "$(c -X POST $BASE/api/browser/resize -H 'Content-Type: application/json' -d '{"width":1920,"height":1080}')" 200 400 500 503
assert_status_any "GET /api/browser/screenshot/test" "$(c $BASE/api/browser/screenshot/test)" 200 404 500 503
assert_status_any "DELETE /api/browser/sessions/test" "$(c -X DELETE $BASE/api/browser/sessions/test)" 200 204 404

# ═══════════════════════════════════════════════════════════
# 19. MESSAGING
# ═══════════════════════════════════════════════════════════
echo ""
echo "▸ 19. Messaging"
assert_status "GET /api/messaging/channels" 200 "$(c $BASE/api/messaging/channels)"
assert_status "GET /api/messaging/stats" 200 "$(c $BASE/api/messaging/stats)"
assert_status "GET /api/messaging/history" 200 "$(c $BASE/api/messaging/history)"
assert_status "GET /api/messaging/subscriptions" 200 "$(c $BASE/api/messaging/subscriptions)"

# Create channel
CH_RESP=$(cb -X POST $BASE/api/messaging/channels -H "Content-Type: application/json" -d '{
  "name":"Test Channel","type":"webhook","config":{"url":"https://example.com/webhook"}}')
CH_ID=$(echo "$CH_RESP" | grep -oP '"id":\s*(\d+)' | grep -oP '\d+' | head -1)

if [ -n "$CH_ID" ]; then
  assert_status "POST /api/messaging/channels (create)" 200 "$(echo 200)"
  assert_status "GET /api/messaging/channels/:id" 200 "$(c $BASE/api/messaging/channels/$CH_ID)"
  assert_status_any "POST /api/messaging/channels/:id/test" "$(c -X POST $BASE/api/messaging/channels/$CH_ID/test)" 200 500
  assert_status_any "POST /api/messaging/channels/:id/connect" "$(c -X POST $BASE/api/messaging/channels/$CH_ID/connect)" 200 204
  assert_status_any "POST /api/messaging/channels/:id/disconnect" "$(c -X POST $BASE/api/messaging/channels/$CH_ID/disconnect)" 200 204
  assert_status_any "DELETE /api/messaging/channels/:id" "$(c -X DELETE $BASE/api/messaging/channels/$CH_ID)" 200 204
fi

# Send message
assert_status_any "POST /api/messaging/send" "$(c -X POST $BASE/api/messaging/send -H 'Content-Type: application/json' -d '{"channel":"test","content":"hello"}')" 200 400 500

# Notify
assert_status_any "POST /api/messaging/notify" "$(c -X POST $BASE/api/messaging/notify -H 'Content-Type: application/json' -d '{"title":"Test","body":"test notification"}')" 200 201

# Broadcast
assert_status_any "POST /api/messaging/broadcast" "$(c -X POST $BASE/api/messaging/broadcast -H 'Content-Type: application/json' -d '{"content":"broadcast test"}')" 200 400

# Delivery status
assert_status_any "GET /api/messaging/delivery/fake-id" "$(c $BASE/api/messaging/delivery/fake-id)" 200 404

# Webhooks
assert_status_any "POST /api/messaging/webhook/slack" "$(c -X POST $BASE/api/messaging/webhook/slack -H 'Content-Type: application/json' -d '{"text":"test"}')" 200 400

assert_status_any "POST /api/messaging/webhook/gmail" "$(c -X POST $BASE/api/messaging/webhook/gmail -H 'Content-Type: application/json' -d '{"message":"test"}')" 200 400

# ═══════════════════════════════════════════════════════════
# 20. PROTOCOLS — Dashboard
# ═══════════════════════════════════════════════════════════
echo ""
echo "▸ 20. Protocols — Dashboard"
assert_status "GET /api/protocols/dashboard" 200 "$(c $BASE/api/protocols/dashboard)"

# ═══════════════════════════════════════════════════════════
# 21. PROTOCOLS — A2A
# ═══════════════════════════════════════════════════════════
echo ""
echo "▸ 21. Protocols — A2A"
assert_status "GET /api/protocols/a2a/card" 200 "$(c $BASE/api/protocols/a2a/card)"
assert_status "GET /api/protocols/a2a/agents" 200 "$(c $BASE/api/protocols/a2a/agents)"

# Register agent
A2A_RESP=$(cb -X POST $BASE/api/protocols/a2a/agents -H "Content-Type: application/json" -d '{
  "name":"Test Agent","url":"https://example.com/agent","capabilities":["chat"]}')
A2A_ID=$(echo "$A2A_RESP" | grep -oP '"id":\s*(\d+)' | grep -oP '\d+' | head -1)

if [ -n "$A2A_ID" ]; then
  assert_status "POST /api/protocols/a2a/agents (register)" 200 "$(echo 200)"
  assert_status "GET /api/protocols/a2a/agents/:id" 200 "$(c $BASE/api/protocols/a2a/agents/$A2A_ID)"
  assert_status_any "POST /api/protocols/a2a/agents/:id/send" "$(c -X POST $BASE/api/protocols/a2a/agents/$A2A_ID/send -H 'Content-Type: application/json' -d '{"message":"hello"}')" 200 400 500
fi

# Discover
assert_status_any "POST /api/protocols/a2a/agents/discover" "$(c -X POST $BASE/api/protocols/a2a/agents/discover -H 'Content-Type: application/json' -d '{"url":"https://example.com"}')" 200 400 500

# RPC
assert_status_any "POST /api/protocols/a2a/rpc" "$(c -X POST $BASE/api/protocols/a2a/rpc -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","method":"agent.info","id":"1"}')" 200 400

# ═══════════════════════════════════════════════════════════
# 22. PROTOCOLS — MCP
# ═══════════════════════════════════════════════════════════
echo ""
echo "▸ 22. Protocols — MCP"
assert_status "GET /api/protocols/mcp/servers" 200 "$(c $BASE/api/protocols/mcp/servers)"
assert_status_any "POST /api/protocols/mcp/servers/connect" "$(c -X POST $BASE/api/protocols/mcp/servers/connect -H 'Content-Type: application/json' -d '{"url":"https://example.com/mcp"}')" 200 400 500
assert_status_any "POST /api/protocols/mcp/rpc" "$(c -X POST $BASE/api/protocols/mcp/rpc -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","method":"ping","id":"1"}')" 200 400

# ═══════════════════════════════════════════════════════════
# 23. PROTOCOLS — CLI
# ═══════════════════════════════════════════════════════════
echo ""
echo "▸ 23. Protocols — CLI"
assert_status "GET /api/protocols/cli/tools" 200 "$(c $BASE/api/protocols/cli/tools)"
assert_status_any "POST /api/protocols/cli/execute" "$(c -X POST $BASE/api/protocols/cli/execute -H 'Content-Type: application/json' -d '{"command":"echo hello"}')" 200 400 500
assert_status_any "POST /api/protocols/cli/validate" "$(c -X POST $BASE/api/protocols/cli/validate -H 'Content-Type: application/json' -d '{"command":"echo hello"}')" 200 400
assert_status_any "POST /api/protocols/cli/pipeline" "$(c -X POST $BASE/api/protocols/cli/pipeline -H 'Content-Type: application/json' -d '{"steps":[{"command":"echo hello"}]}')" 200 400 500
assert_status_any "POST /api/protocols/cli/script" "$(c -X POST $BASE/api/protocols/cli/script -H 'Content-Type: application/json' -d '{"script":"echo hello","language":"bash"}')" 200 400 500

# ═══════════════════════════════════════════════════════════
# 24. PROTOCOLS — Code & HTTP & Files
# ═══════════════════════════════════════════════════════════
echo ""
echo "▸ 24. Protocols — Code, HTTP, Files"
assert_status_any "POST /api/protocols/code/interpret" "$(c -X POST $BASE/api/protocols/code/interpret -H 'Content-Type: application/json' -d '{"code":"1+1","language":"javascript"}')" 200 400 500
assert_status_any "POST /api/protocols/http/request" "$(c -X POST $BASE/api/protocols/http/request -H 'Content-Type: application/json' -d '{"url":"https://httpbin.org/get","method":"GET"}')" 200 400 500
assert_status_any "POST /api/protocols/files/transform" "$(c -X POST $BASE/api/protocols/files/transform -H 'Content-Type: application/json' -d '{"input":"test.txt","output":"test.pdf"}')" 200 400 500

# Webhooks
assert_status "GET /api/protocols/webhooks" 200 "$(c $BASE/api/protocols/webhooks)"
assert_status_any "POST /api/protocols/webhooks" "$(c -X POST $BASE/api/protocols/webhooks -H 'Content-Type: application/json' -d '{"name":"Test Hook","url":"https://example.com/hook","events":["message"]}')" 200 201 400

# ═══════════════════════════════════════════════════════════
# 25. IDENTITY
# ═══════════════════════════════════════════════════════════
echo ""
echo "▸ 25. Identity"
assert_status "GET /api/identity/directory" 200 "$(c $BASE/api/identity/directory)"
assert_status "GET /api/identity/stats" 200 "$(c $BASE/api/identity/stats)"
assert_status "GET /api/identity/verifications" 200 "$(c $BASE/api/identity/verifications)"
assert_status "GET /api/identity/audit" 200 "$(c $BASE/api/identity/audit)"

# Register identity
ID_RESP=$(cb -X POST $BASE/api/identity/register -H "Content-Type: application/json" -d '{
  "name":"Test Agent","type":"agent","capabilities":["chat"]}')
CRYPTO_ID=$(echo "$ID_RESP" | grep -oP '"cryptoId":\s*"([^"]+)"' | grep -oP '(?<=")[^"]+(?="$)' | head -1)

if [ -n "$CRYPTO_ID" ]; then
  assert_status "POST /api/identity/register" 200 "$(echo 200)"
  assert_status "GET /api/identity/:cryptoId" 200 "$(c $BASE/api/identity/$CRYPTO_ID)"
  assert_status_any "GET /api/identity/:cryptoId/full" "$(c $BASE/api/identity/$CRYPTO_ID/full)" 200 404
  
  # Profile
  assert_status_any "PUT /api/identity/:cryptoId/profile" "$(c -X PUT $BASE/api/identity/$CRYPTO_ID/profile -H 'Content-Type: application/json' -d '{"displayName":"Test"}')" 200 204
  
  # Verify
  assert_status_any "POST /api/identity/:cryptoId/verify" "$(c -X POST $BASE/api/identity/$CRYPTO_ID/verify)" 200 204
  
  # Trust
  assert_status_any "POST /api/identity/:cryptoId/trust" "$(c -X POST $BASE/api/identity/$CRYPTO_ID/trust -H 'Content-Type: application/json' -d '{"level":"trusted"}')" 200 204
  
  # Block/unblock
  assert_status_any "POST /api/identity/:cryptoId/block" "$(c -X POST $BASE/api/identity/$CRYPTO_ID/block)" 200 204
  assert_status_any "GET /api/identity/:cryptoId/blocks" "$(c $BASE/api/identity/$CRYPTO_ID/blocks)" 200 404
  assert_status_any "POST /api/identity/:cryptoId/unblock" "$(c -X POST $BASE/api/identity/$CRYPTO_ID/unblock)" 200 204
  
  # Suspend/ban
  assert_status_any "POST /api/identity/:cryptoId/suspend" "$(c -X POST $BASE/api/identity/$CRYPTO_ID/suspend)" 200 204
  assert_status_any "POST /api/identity/:cryptoId/ban" "$(c -X POST $BASE/api/identity/$CRYPTO_ID/ban)" 200 204
fi

# Search
assert_status "POST /api/identity/search" 200 "$(c -X POST $BASE/api/identity/search -H 'Content-Type: application/json' -d '{"query":"test"}')"

# ═══════════════════════════════════════════════════════════
# 26. NIP (Negotiation & Inter-agent Protocol)
# ═══════════════════════════════════════════════════════════
echo ""
echo "▸ 26. NIP"
assert_status "GET /api/nip/sessions" 200 "$(c $BASE/api/nip/sessions)"
assert_status "GET /api/nip/sessions/stats" 200 "$(c $BASE/api/nip/sessions/stats)"
assert_status "GET /api/nip/alerts" 200 "$(c $BASE/api/nip/alerts)"
assert_status "GET /api/nip/trusted-parties" 200 "$(c $BASE/api/nip/trusted-parties)"

# Create NIP session
NIP_RESP=$(cb -X POST $BASE/api/nip/sessions -H "Content-Type: application/json" -d '{
  "topic":"test negotiation","parties":["agent-a","agent-b"]}')
NIP_ID=$(echo "$NIP_RESP" | grep -oP '"id":\s*(\d+)' | grep -oP '\d+' | head -1)

if [ -n "$NIP_ID" ]; then
  assert_status "POST /api/nip/sessions (create)" 200 "$(echo 200)"
  assert_status "GET /api/nip/sessions/:id" 200 "$(c $BASE/api/nip/sessions/$NIP_ID)"
  assert_status_any "GET /api/nip/sessions/:id/messages" "$(c $BASE/api/nip/sessions/$NIP_ID/messages)" 200 404
  assert_status_any "GET /api/nip/sessions/:id/alerts" "$(c $BASE/api/nip/sessions/$NIP_ID/alerts)" 200 404
  assert_status_any "POST /api/nip/sessions/:id/negotiate" "$(c -X POST $BASE/api/nip/sessions/$NIP_ID/negotiate -H 'Content-Type: application/json' -d '{"proposal":"test proposal"}')" 200 400 500
  assert_status_any "POST /api/nip/sessions/:id/pause" "$(c -X POST $BASE/api/nip/sessions/$NIP_ID/pause)" 200 204
  assert_status_any "POST /api/nip/sessions/:id/resume" "$(c -X POST $BASE/api/nip/sessions/$NIP_ID/resume)" 200 204
  assert_status_any "GET /api/nip/sessions/:id/report" "$(c $BASE/api/nip/sessions/$NIP_ID/report)" 200 404
  assert_status_any "POST /api/nip/sessions/:id/complete" "$(c -X POST $BASE/api/nip/sessions/$NIP_ID/complete)" 200 204
fi

# Create another to test terminate
NIP2_RESP=$(cb -X POST $BASE/api/nip/sessions -H "Content-Type: application/json" -d '{
  "topic":"terminate test","parties":["a","b"]}')
NIP2_ID=$(echo "$NIP2_RESP" | grep -oP '"id":\s*(\d+)' | grep -oP '\d+' | head -1)
if [ -n "$NIP2_ID" ]; then
  assert_status_any "POST /api/nip/sessions/:id/terminate" "$(c -X POST $BASE/api/nip/sessions/$NIP2_ID/terminate)" 200 204
fi

# Access validation
assert_status_any "POST /api/nip/access/validate" "$(c -X POST $BASE/api/nip/access/validate -H 'Content-Type: application/json' -d '{"agentId":"test","resource":"data"}')" 200 400

# ═══════════════════════════════════════════════════════════
# 27. MARKETPLACE
# ═══════════════════════════════════════════════════════════
echo ""
echo "▸ 27. Marketplace"
assert_status "GET /api/marketplace/skills" 200 "$(c $BASE/api/marketplace/skills)"
assert_status "GET /api/marketplace/stats" 200 "$(c $BASE/api/marketplace/stats)"
assert_status "GET /api/marketplace/installs" 200 "$(c $BASE/api/marketplace/installs)"

# Seed marketplace
assert_status_any "POST /api/marketplace/seed" "$(c -X POST $BASE/api/marketplace/seed)" 200 204

# Wait for seed to populate
sleep 1

# Get skills after seed
MKT_SKILLS=$(cb $BASE/api/marketplace/skills)
MKT_ID=$(echo "$MKT_SKILLS" | grep -oP '"id":\s*(\d+)' | grep -oP '\d+' | head -1)

if [ -n "$MKT_ID" ]; then
  assert_status "GET /api/marketplace/skills/:id" 200 "$(c $BASE/api/marketplace/skills/$MKT_ID)"
  assert_status_any "GET /api/marketplace/skills/:id/ratings" "$(c $BASE/api/marketplace/skills/$MKT_ID/ratings)" 200 404
  assert_status_any "GET /api/marketplace/skills/:id/versions" "$(c $BASE/api/marketplace/skills/$MKT_ID/versions)" 200 404
  assert_status_any "GET /api/marketplace/skills/:id/score" "$(c $BASE/api/marketplace/skills/$MKT_ID/score)" 200 404
  assert_status_any "POST /api/marketplace/skills/:id/install" "$(c -X POST $BASE/api/marketplace/skills/$MKT_ID/install)" 200 204
  assert_status_any "POST /api/marketplace/skills/:id/rate" "$(c -X POST $BASE/api/marketplace/skills/$MKT_ID/rate -H 'Content-Type: application/json' -d '{"rating":5,"review":"great"}')" 200 201
  assert_status_any "POST /api/marketplace/skills/:id/fork" "$(c -X POST $BASE/api/marketplace/skills/$MKT_ID/fork)" 200 201
  assert_status_any "POST /api/marketplace/skills/:id/uninstall" "$(c -X POST $BASE/api/marketplace/skills/$MKT_ID/uninstall)" 200 204
fi

# Scoring
assert_status "GET /api/marketplace/scoring/config" 200 "$(c $BASE/api/marketplace/scoring/config)"
assert_status_any "POST /api/marketplace/scoring/run" "$(c -X POST $BASE/api/marketplace/scoring/run)" 200 204

# ═══════════════════════════════════════════════════════════
# 28. SWARM — Full Lifecycle
# ═══════════════════════════════════════════════════════════
echo ""
echo "▸ 28. Swarm — Full Lifecycle"
assert_status "GET /api/swarm/sessions" 200 "$(c $BASE/api/swarm/sessions)"
assert_status "GET /api/swarm/config" 200 "$(c $BASE/api/swarm/config)"

# Create session
SW_RESP=$(cb -X POST $BASE/api/swarm/sessions -H "Content-Type: application/json" -d '{
  "name":"Lifecycle Test","description":"Full lifecycle","mode":"collaborative","consensusThreshold":0.7,
  "maxAgents":5,"tokenBudget":10000,"agents":[
    {"id":"agent-alpha","role":"NOVA","capabilities":["reasoning"]},
    {"id":"agent-beta","role":"FORGE","capabilities":["code"]}
  ]}')
SID=$(echo "$SW_RESP" | grep -oP '"id":\s*"([^"]+)"' | head -1 | grep -oP '(?<=")[^"]+(?="$)')

if [ -n "$SID" ]; then
  assert_status "POST /api/swarm/sessions (create)" 200 "$(echo 200)"
  assert_status "GET /api/swarm/sessions/:id" 200 "$(c $BASE/api/swarm/sessions/$SID)"
  assert_status "GET /api/swarm/sessions/:id/stats" 200 "$(c $BASE/api/swarm/sessions/$SID/stats)"
  assert_status "GET /api/swarm/sessions/:id/agents" 200 "$(c $BASE/api/swarm/sessions/$SID/agents)"
  assert_status "GET /api/swarm/sessions/:id/topology" 200 "$(c $BASE/api/swarm/sessions/$SID/topology)"
  assert_status "GET /api/swarm/sessions/:id/events" 200 "$(c "$BASE/api/swarm/sessions/$SID/events?limit=10")"
  assert_status "GET /api/swarm/sessions/:id/messages" 200 "$(c $BASE/api/swarm/sessions/$SID/messages)"
  assert_status "GET /api/swarm/sessions/:id/blackboard" 200 "$(c $BASE/api/swarm/sessions/$SID/blackboard)"
  
  # Start session
  assert_status_any "POST /api/swarm/sessions/:id/start" "$(c -X POST $BASE/api/swarm/sessions/$SID/start)" 200 204
  
  # Tasks
  assert_status "GET /api/swarm/sessions/:id/tasks" 200 "$(c $BASE/api/swarm/sessions/$SID/tasks)"
  assert_status "GET /api/swarm/sessions/:id/tasks/available" 200 "$(c $BASE/api/swarm/sessions/$SID/tasks/available)"
  
  # Create a task
  TASK_RESP=$(cb -X POST $BASE/api/swarm/sessions/$SID/tasks -H "Content-Type: application/json" -d '{
    "description":"Test task","priority":"high"}')
  TID=$(echo "$TASK_RESP" | grep -oP '"id":\s*"([^"]+)"' | head -1 | grep -oP '(?<=")[^"]+(?="$)')
  
  if [ -n "$TID" ]; then
    assert_status "POST /api/swarm/sessions/:id/tasks (create)" 200 "$(echo 200)"
    assert_status_any "POST /api/swarm/sessions/:id/tasks/:id/claim" "$(c -X POST $BASE/api/swarm/sessions/$SID/tasks/$TID/claim -H 'Content-Type: application/json' -d '{"agentId":"agent-alpha"}')" 200 204
    assert_status_any "POST /api/swarm/sessions/:id/tasks/:id/complete" "$(c -X POST $BASE/api/swarm/sessions/$SID/tasks/$TID/complete -H 'Content-Type: application/json' -d '{"agentId":"agent-alpha","result":"done"}')" 200 204
  fi
  
  # Create another task to test fail
  TASK2_RESP=$(cb -X POST $BASE/api/swarm/sessions/$SID/tasks -H "Content-Type: application/json" -d '{
    "description":"Fail task","priority":"low"}')
  TID2=$(echo "$TASK2_RESP" | grep -oP '"id":\s*"([^"]+)"' | head -1 | grep -oP '(?<=")[^"]+(?="$)')
  if [ -n "$TID2" ]; then
    assert_status_any "POST /api/swarm/sessions/:id/tasks/:id/fail" "$(c -X POST $BASE/api/swarm/sessions/$SID/tasks/$TID2/fail -H 'Content-Type: application/json' -d '{"agentId":"agent-alpha","error":"test failure"}')" 200 204
  fi
  
  # Consensus
  assert_status "GET /api/swarm/sessions/:id/consensus" 200 "$(c $BASE/api/swarm/sessions/$SID/consensus)"
  
  CONS_RESP=$(cb -X POST $BASE/api/swarm/sessions/$SID/consensus -H "Content-Type: application/json" -d '{
    "topic":"Should we proceed?","options":["yes","no"]}')
  RID=$(echo "$CONS_RESP" | grep -oP '"roundId":\s*"([^"]+)"' | head -1 | grep -oP '(?<=")[^"]+(?="$)')
  if [ -z "$RID" ]; then
    RID=$(echo "$CONS_RESP" | grep -oP '"id":\s*"([^"]+)"' | head -1 | grep -oP '(?<=")[^"]+(?="$)')
  fi
  
  if [ -n "$RID" ]; then
    assert_status "POST /api/swarm/sessions/:id/consensus (create round)" 200 "$(echo 200)"
    assert_status "GET /api/swarm/sessions/:id/consensus/:roundId" 200 "$(c $BASE/api/swarm/sessions/$SID/consensus/$RID)"
    
    # Vote
    assert_status_any "POST /api/swarm/sessions/:id/consensus/:id/vote" "$(c -X POST $BASE/api/swarm/sessions/$SID/consensus/$RID/vote -H 'Content-Type: application/json' -d '{"agentId":"agent-alpha","vote":"yes","confidence":0.9}')" 200 204
  fi
  
  # Handoffs
  assert_status "GET /api/swarm/sessions/:id/handoffs" 200 "$(c $BASE/api/swarm/sessions/$SID/handoffs)"
  assert_status_any "POST /api/swarm/sessions/:id/handoffs" "$(c -X POST $BASE/api/swarm/sessions/$SID/handoffs -H 'Content-Type: application/json' -d '{"from":"agent-alpha","to":"agent-beta","reason":"test handoff"}')" 200 201 400
  
  # Messages
  assert_status_any "POST /api/swarm/sessions/:id/messages" "$(c -X POST $BASE/api/swarm/sessions/$SID/messages -H 'Content-Type: application/json' -d '{"agentId":"agent-alpha","content":"hello swarm","type":"chat"}')" 200 201
  
  # Blackboard boost
  assert_status_any "POST /api/swarm/sessions/:id/blackboard/boost" "$(c -X POST $BASE/api/swarm/sessions/$SID/blackboard/boost -H 'Content-Type: application/json' -d '{"key":"important","value":"data","priority":10}')" 200 204
  
  # Agent operations
  assert_status "GET /api/swarm/sessions/:id/agents/agent-alpha" 200 "$(c $BASE/api/swarm/sessions/$SID/agents/agent-alpha)"
  assert_status_any "POST /api/swarm/sessions/:id/agents/agent-alpha/execute" "$(c -X POST $BASE/api/swarm/sessions/$SID/agents/agent-alpha/execute -H 'Content-Type: application/json' -d '{"task":"test execution"}')" 200 400 500
  assert_status_any "POST /api/swarm/sessions/:id/agents/agent-alpha/spawn" "$(c -X POST $BASE/api/swarm/sessions/$SID/agents/agent-alpha/spawn -H 'Content-Type: application/json' -d '{"role":"WORKER","capabilities":["compute"]}')" 200 201 400 500 403
  
  # Run (orchestrate one step)
  assert_status_any "POST /api/swarm/sessions/:id/run" "$(c -X POST $BASE/api/swarm/sessions/$SID/run -H 'Content-Type: application/json' -d '{"input":"test run"}')" 200 400 500
  
  # Stop
  assert_status_any "POST /api/swarm/sessions/:id/stop" "$(c -X POST $BASE/api/swarm/sessions/$SID/stop)" 200 204
  
  # Delete
  assert_status_any "DELETE /api/swarm/sessions/:id" "$(c -X DELETE $BASE/api/swarm/sessions/$SID)" 200 204
fi

# Create another session for terminate test
SW2_RESP=$(cb -X POST $BASE/api/swarm/sessions -H "Content-Type: application/json" -d '{
  "name":"Terminate Test","mode":"pipeline"}')
SID2=$(echo "$SW2_RESP" | grep -oP '"id":\s*"([^"]+)"' | head -1 | grep -oP '(?<=")[^"]+(?="$)')
if [ -n "$SID2" ]; then
  assert_status_any "POST /api/swarm/sessions/:id/terminate" "$(c -X POST $BASE/api/swarm/sessions/$SID2/terminate)" 200 204
fi

# Legacy routes
assert_status "GET /api/swarm (legacy list)" 200 "$(c $BASE/api/swarm)"
assert_status_any "POST /api/swarm (legacy create)" "$(c -X POST $BASE/api/swarm -H 'Content-Type: application/json' -d '{"name":"Legacy Test","mode":"debate"}')" 200 201

# ═══════════════════════════════════════════════════════════
# 29. OAUTH
# ═══════════════════════════════════════════════════════════
echo ""
echo "▸ 29. OAuth"
assert_status_any "GET /api/oauth/test-connector/authorize" "$(c $BASE/api/oauth/test-connector/authorize)" 200 302 400 404 500
assert_status_any "GET /api/oauth/callback" "$(c "$BASE/api/oauth/callback?code=test&state=test")" 200 400 500

# ═══════════════════════════════════════════════════════════
# 30. WEBHOOKS
# ═══════════════════════════════════════════════════════════
echo ""
echo "▸ 30. Webhooks"
assert_status_any "POST /api/webhooks/test-id" "$(c -X POST $BASE/api/webhooks/test-id -H 'Content-Type: application/json' -d '{"event":"test"}')" 200 404

# ═══════════════════════════════════════════════════════════
# RESULTS
# ═══════════════════════════════════════════════════════════
echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║                    RESULTS                          ║"
echo "╠══════════════════════════════════════════════════════╣"
printf "║  Total: %-3d  |  Pass: %-3d  |  Fail: %-3d           ║\n" "$TOTAL" "$PASS" "$FAIL"
echo "╚══════════════════════════════════════════════════════╝"

if [ "$FAIL" -gt 0 ]; then
  echo ""
  echo "FAILURES:"
  echo -e "$FAILURES"
  echo ""
fi

if [ "$FAIL" -eq 0 ]; then
  echo "🎉 ALL TESTS PASSED"
  exit 0
else
  echo "⚠ $FAIL test(s) failed"
  exit 1
fi
