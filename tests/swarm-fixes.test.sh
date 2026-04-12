#!/usr/bin/env bash
# Swarm Layer 3 — Full 14-test suite covering 3 fixes + baseline
# Fix 1: Handoff field aliases (fromAgent/toAgent, from/to)
# Fix 2: Spawn diagnostics (reasons array, required field hints)
# Fix 3: Agent messaging (SwarmMessage type, field aliases, filters, broadcast)

BASE="http://localhost:5000/api/swarm"
PASS=0 FAIL=0 TOTAL=0

check() {
  TOTAL=$((TOTAL+1))
  local desc="$1" expected="$2" actual="$3"
  if echo "$actual" | grep -q "$expected"; then
    PASS=$((PASS+1)); echo "  ✅ $desc"
  else
    FAIL=$((FAIL+1)); echo "  ❌ $desc — expected '$expected' got '$actual'"
  fi
}

echo "━━━ Swarm Fixes Test Suite ━━━"

# Setup: create session with 2 agents
echo -e "\n── Setup ──"
SESSION=$(curl -s -X POST "$BASE/sessions" \
  -H 'Content-Type: application/json' \
  -d '{"name":"fix-test","objective":"Test 3 fixes","agents":[
    {"id":"agent-a","name":"Alpha","role":"researcher","capabilities":["research"],"canSpawn":false},
    {"id":"agent-b","name":"Beta","role":"coder","capabilities":["code"],"canSpawn":false}
  ]}')
SID=$(echo "$SESSION" | jq -r '.id')
echo "  Session: $SID"

# ── Fix 1: Handoff Field Aliases ──
echo -e "\n── Fix 1: Handoff Field Aliases ──"

# Test 1: Canonical fields (fromAgentId / toAgentId)
R1=$(curl -s -X POST "$BASE/sessions/$SID/handoffs" \
  -H 'Content-Type: application/json' \
  -d '{"fromAgentId":"agent-a","toAgentId":"agent-b","reason":"canonical handoff"}')
check "Handoff with fromAgentId/toAgentId" "agent-a" "$R1"

# Test 2: Alias fromAgent / toAgent
R2=$(curl -s -X POST "$BASE/sessions/$SID/handoffs" \
  -H 'Content-Type: application/json' \
  -d '{"fromAgent":"agent-b","toAgent":"agent-a","reason":"alias handoff"}')
check "Handoff with fromAgent/toAgent" "agent-b" "$R2"

# Test 3: Short alias from / to
R3=$(curl -s -X POST "$BASE/sessions/$SID/handoffs" \
  -H 'Content-Type: application/json' \
  -d '{"from":"agent-a","to":"agent-b","reason":"short alias handoff"}')
check "Handoff with from/to" "agent-a" "$R3"

# Test 4: GET handoffs returns all 3
R4=$(curl -s "$BASE/sessions/$SID/handoffs")
HCOUNT=$(echo "$R4" | jq 'length')
check "GET handoffs returns 3 records" "3" "$HCOUNT"

# ── Fix 2: Spawn Diagnostics ──
echo -e "\n── Fix 2: Spawn Diagnostics ──"

# Test 5: Spawn blocked agent should fail with diagnostics
R5=$(curl -s -X POST "$BASE/sessions/$SID/agents/agent-a/spawn" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Child","role":"helper","capabilities":["research"]}')
check "Spawn blocked returns error" "error" "$R5"
# Check reasons array present
check "Spawn diagnostics has reasons" "reasons" "$R5"
# Check hint field present
check "Spawn diagnostics has hint" "hint" "$R5"

# ── Fix 3: Agent Messaging ──
echo -e "\n── Fix 3: Agent Messaging ──"

# Test 8: Send message with canonical fields
R8=$(curl -s -X POST "$BASE/sessions/$SID/messages" \
  -H 'Content-Type: application/json' \
  -d '{"fromAgentId":"agent-a","toAgentId":"agent-b","messageType":"info","content":"hello from A"}')
check "POST message with canonical fields" "ok" "$R8"

# Test 9: Send message with alias (fromAgent/toAgent)
R9=$(curl -s -X POST "$BASE/sessions/$SID/messages" \
  -H 'Content-Type: application/json' \
  -d '{"fromAgent":"agent-b","toAgent":"agent-a","messageType":"info","content":"hello from B"}')
check "POST message with alias fields" "ok" "$R9"

# Test 10: Send broadcast (no toAgentId)
R10=$(curl -s -X POST "$BASE/sessions/$SID/messages" \
  -H 'Content-Type: application/json' \
  -d '{"from":"agent-a","content":"broadcast to all"}')
check "POST broadcast message" "ok" "$R10"

# Test 11: GET all messages
sleep 0.2
R11=$(curl -s "$BASE/sessions/$SID/messages")
MCOUNT=$(echo "$R11" | jq 'length')
check "GET messages returns 3+" "true" "$([ "$MCOUNT" -ge 3 ] && echo true || echo false)"

# Test 12: GET messages filtered by agentId
R12=$(curl -s "$BASE/sessions/$SID/messages?agentId=agent-a")
MACOUNT=$(echo "$R12" | jq 'length')
check "GET messages?agentId=agent-a filters correctly" "true" "$([ "$MACOUNT" -ge 1 ] && echo true || echo false)"

# Test 13: GET messages filtered by type
R13=$(curl -s "$BASE/sessions/$SID/messages?type=info")
MTCOUNT=$(echo "$R13" | jq 'length')
check "GET messages?type=info filters correctly" "true" "$([ "$MTCOUNT" -ge 2 ] && echo true || echo false)"

# Test 14: Message includes broadcast type
R14=$(curl -s "$BASE/sessions/$SID/messages?type=broadcast")
MBCOUNT=$(echo "$R14" | jq 'length')
check "GET messages?type=broadcast returns broadcast msg" "true" "$([ "$MBCOUNT" -ge 1 ] && echo true || echo false)"

# ── Cleanup ──
echo -e "\n── Cleanup ──"
curl -s -X DELETE "$BASE/sessions/$SID" > /dev/null

echo -e "\n━━━ Results: $PASS/$TOTAL passed, $FAIL failed ━━━"
[ $FAIL -eq 0 ] && echo "🎉 ALL GREEN" || echo "⚠️  $FAIL FAILURES"
exit $FAIL
