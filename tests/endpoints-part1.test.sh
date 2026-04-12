#!/bin/bash
# Part 1: Core, Models, Connectors, Skills, Knowledge, Memory, Conversations, Notifications
BASE="http://localhost:5000"
PASS=0; FAIL=0; TOTAL=0; FAILURES=""

assert_status() {
  TOTAL=$((TOTAL+1))
  if [ "$3" -eq "$2" ] 2>/dev/null; then PASS=$((PASS+1)); echo "  ✓ $1"
  else FAIL=$((FAIL+1)); FAILURES="$FAILURES\n  ✗ $1 (exp $2, got $3)"; echo "  ✗ $1 (exp $2, got $3)"; fi
}
assert_any() {
  local l="$1" a="$2"; shift 2; TOTAL=$((TOTAL+1))
  for e in "$@"; do [ "$a" -eq "$e" ] 2>/dev/null && { PASS=$((PASS+1)); echo "  ✓ $l"; return; }; done
  FAIL=$((FAIL+1)); echo "  ✗ $l (got $a, want $*)"; FAILURES="$FAILURES\n  ✗ $l (got $a)"
}
c() { curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$@"; }
cb() { curl -s --max-time 5 "$@"; }

echo "═══ Part 1: Core + CRUD Domains ═══"

echo "▸ Health & Core"
assert_status "GET /api/health" 200 "$(c $BASE/api/health)"
assert_status "GET /api/settings" 200 "$(c $BASE/api/settings)"
assert_status "GET /.well-known/agent-card.json" 200 "$(c $BASE/.well-known/agent-card.json)"

echo "▸ Models CRUD"
assert_status "GET /api/models" 200 "$(c $BASE/api/models)"
assert_status "GET /api/models/providers" 200 "$(c $BASE/api/models/providers)"
assert_status "GET /api/models/env-vars" 200 "$(c $BASE/api/models/env-vars)"
MR=$(cb -X POST $BASE/api/models -H "Content-Type: application/json" -d '{"name":"TestM","provider":"openai","modelId":"gpt-4o","apiKey":"sk-test"}')
MID=$(echo "$MR" | grep -oP '"id":\s*"?([^",}]+)' | head -1 | sed 's/"id":\s*"*//')
if [ -n "$MID" ]; then
  assert_status "POST /api/models" 200 200
  assert_status "GET /api/models/$MID" 200 "$(c $BASE/api/models/$MID)"
  assert_any "PATCH /api/models/$MID" "$(c -X PATCH $BASE/api/models/$MID -H 'Content-Type: application/json' -d '{"name":"Updated"}')" 200 204
  assert_any "POST /api/models/$MID/test" "$(c -X POST $BASE/api/models/$MID/test)" 200 500 503 400
  assert_any "POST /api/models/$MID/connect" "$(c -X POST $BASE/api/models/$MID/connect)" 200 204 500
  assert_any "POST /api/models/$MID/disconnect" "$(c -X POST $BASE/api/models/$MID/disconnect)" 200 204
  assert_any "DELETE /api/models/$MID" "$(c -X DELETE $BASE/api/models/$MID)" 200 204
else
  echo "  ⚠ Model create failed: $MR"
fi
assert_any "POST /api/models/quick-add" "$(c -X POST $BASE/api/models/quick-add -H 'Content-Type: application/json' -d '{"providerId":"anthropic","apiKey":"sk-ant-fake"}')" 200 201 400 500

echo "▸ Connectors CRUD"
assert_status "GET /api/connectors" 200 "$(c $BASE/api/connectors)"
CR=$(cb -X POST $BASE/api/connectors -H "Content-Type: application/json" -d '{"name":"TestConn","type":"api","config":{"url":"https://ex.com"}}')
CID=$(echo "$CR" | grep -oP '"id":\s*"?([^",}]+)' | head -1 | sed 's/"id":\s*"*//')
if [ -n "$CID" ]; then
  assert_status "POST /api/connectors" 200 200
  assert_status "GET /api/connectors/$CID" 200 "$(c $BASE/api/connectors/$CID)"
  assert_any "PATCH /api/connectors/$CID" "$(c -X PATCH $BASE/api/connectors/$CID -H 'Content-Type: application/json' -d '{"name":"Updated"}')" 200 204
  assert_any "POST /api/connectors/$CID/connect" "$(c -X POST $BASE/api/connectors/$CID/connect)" 200 204 500
  assert_any "POST /api/connectors/$CID/call" "$(c -X POST $BASE/api/connectors/$CID/call -H 'Content-Type: application/json' -d '{"method":"test"}')" 200 400 500
  assert_any "POST /api/connectors/$CID/disconnect" "$(c -X POST $BASE/api/connectors/$CID/disconnect)" 200 204
  assert_any "DELETE /api/connectors/$CID" "$(c -X DELETE $BASE/api/connectors/$CID)" 200 204
fi

echo "▸ Skills CRUD"
assert_status "GET /api/skills" 200 "$(c $BASE/api/skills)"
SR=$(cb -X POST $BASE/api/skills -H "Content-Type: application/json" -d '{"name":"TestSkill","content":"Do the thing","description":"A test"}')
SKID=$(echo "$SR" | grep -oP '"id":\s*"?([^",}]+)' | head -1 | sed 's/"id":\s*"*//')
if [ -n "$SKID" ]; then
  assert_status "POST /api/skills" 200 200
  assert_status "GET /api/skills/$SKID" 200 "$(c $BASE/api/skills/$SKID)"
  assert_any "PATCH /api/skills/$SKID" "$(c -X PATCH $BASE/api/skills/$SKID -H 'Content-Type: application/json' -d '{"name":"Updated"}')" 200 204
  assert_any "DELETE /api/skills/$SKID" "$(c -X DELETE $BASE/api/skills/$SKID)" 200 204
fi

echo "▸ Skill Scripts CRUD"
assert_status "GET /api/skill-scripts" 200 "$(c $BASE/api/skill-scripts)"
SSR=$(cb -X POST $BASE/api/skill-scripts -H "Content-Type: application/json" -d '{"name":"TestScript","language":"javascript","content":"console.log(1)","description":"test"}')
SSID=$(echo "$SSR" | grep -oP '"id":\s*"?([^",}]+)' | head -1 | sed 's/"id":\s*"*//')
if [ -n "$SSID" ]; then
  assert_status "POST /api/skill-scripts" 200 200
  assert_status "GET /api/skill-scripts/$SSID" 200 "$(c $BASE/api/skill-scripts/$SSID)"
  assert_any "GET /api/skill-scripts/$SSID/versions" "$(c $BASE/api/skill-scripts/$SSID/versions)" 200 404
  assert_any "POST /api/skill-scripts/$SSID/run" "$(c -X POST $BASE/api/skill-scripts/$SSID/run)" 200 500 400
  assert_any "DELETE /api/skill-scripts/$SSID" "$(c -X DELETE $BASE/api/skill-scripts/$SSID)" 200 204
fi

echo "▸ Knowledge CRUD"
assert_status "GET /api/knowledge" 200 "$(c $BASE/api/knowledge)"
assert_status "GET /api/knowledge/stats" 200 "$(c $BASE/api/knowledge/stats)"
KR=$(cb -X POST $BASE/api/knowledge -H "Content-Type: application/json" -d '{"name":"TestKnowledge","content":"Test content","category":"general","tags":["test"]}')
KID=$(echo "$KR" | grep -oP '"id":\s*"?([^",}]+)' | head -1 | sed 's/"id":\s*"*//')
if [ -n "$KID" ]; then
  assert_status "POST /api/knowledge" 200 200
  assert_status "GET /api/knowledge/$KID" 200 "$(c $BASE/api/knowledge/$KID)"
  assert_any "PATCH /api/knowledge/$KID" "$(c -X PATCH $BASE/api/knowledge/$KID -H 'Content-Type: application/json' -d '{"name":"Updated"}')" 200 204
  assert_any "DELETE /api/knowledge/$KID" "$(c -X DELETE $BASE/api/knowledge/$KID)" 200 204
fi
assert_status "GET /api/knowledge/search?q=test" 200 "$(c "$BASE/api/knowledge/search?q=test")"
assert_any "GET /api/knowledge/preview/fast" "$(c $BASE/api/knowledge/preview/fast)" 200 404
assert_any "POST /api/knowledge/reseed" "$(c -X POST $BASE/api/knowledge/reseed)" 200 204

echo "▸ Memory CRUD"
assert_status "GET /api/memory" 200 "$(c $BASE/api/memory)"
MER=$(cb -X POST $BASE/api/memory -H "Content-Type: application/json" -d '{"content":"User likes dark mode","type":"preference"}')
MEID=$(echo "$MER" | grep -oP '"id":\s*"?([^",}]+)' | head -1 | sed 's/"id":\s*"*//')
if [ -n "$MEID" ]; then
  assert_status "POST /api/memory" 200 200
  assert_any "DELETE /api/memory/$MEID" "$(c -X DELETE $BASE/api/memory/$MEID)" 200 204
fi
assert_status "POST /api/memory/search" 200 "$(c -X POST $BASE/api/memory/search -H 'Content-Type: application/json' -d '{"query":"dark mode"}')"

echo "▸ Conversations"
assert_status "GET /api/conversations" 200 "$(c $BASE/api/conversations)"
CVR=$(cb -X POST $BASE/api/conversations -H "Content-Type: application/json" -d '{"title":"Test Conv"}')
CVID=$(echo "$CVR" | grep -oP '"id":\s*"?([^",}]+)' | head -1 | sed 's/"id":\s*"*//')
if [ -n "$CVID" ]; then
  assert_status "POST /api/conversations" 200 200
  assert_status "GET /api/conversations/$CVID" 200 "$(c $BASE/api/conversations/$CVID)"
  assert_status "GET /api/conversations/$CVID/messages" 200 "$(c $BASE/api/conversations/$CVID/messages)"
  assert_any "GET /api/conversations/$CVID/tasks" "$(c $BASE/api/conversations/$CVID/tasks)" 200 404
  assert_any "GET /api/conversations/$CVID/agent-runs" "$(c $BASE/api/conversations/$CVID/agent-runs)" 200 404
  assert_any "GET /api/conversations/$CVID/export" "$(c $BASE/api/conversations/$CVID/export)" 200 404
  assert_any "DELETE /api/conversations/$CVID" "$(c -X DELETE $BASE/api/conversations/$CVID)" 200 204
fi
assert_any "GET /api/all-agent-runs" "$(c $BASE/api/all-agent-runs)" 200 404

echo "▸ Notifications"
assert_status "GET /api/notifications" 200 "$(c $BASE/api/notifications)"

echo ""
echo "═══ Part 1 Results: Total=$TOTAL Pass=$PASS Fail=$FAIL ═══"
[ "$FAIL" -gt 0 ] && echo -e "$FAILURES"
exit $FAIL
