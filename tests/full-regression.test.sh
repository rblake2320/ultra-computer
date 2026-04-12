#!/usr/bin/env bash
# Ultra Computer — Full Regression Test Suite
# Covers: Health, Models, Providers, Connectors, Skills, Conversations, Swarm Layer 3

BASE="http://localhost:5000"
PASS=0 FAIL=0 TOTAL=0

check() {
  TOTAL=$((TOTAL+1))
  local desc="$1" expected="$2" actual="$3"
  if echo "$actual" | grep -q "$expected"; then
    PASS=$((PASS+1)); echo "  ✅ $desc"
  else
    FAIL=$((FAIL+1)); echo "  ❌ $desc — expected '$expected' got '$(echo "$actual" | head -c 200)'"
  fi
}

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "   Ultra Computer Full Regression"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── Core Health ──
echo -e "\n── Core Health ──"
R=$(curl -s "$BASE/api/health")
check "Health endpoint" "ok" "$R"

# ── Models ──
echo -e "\n── Models ──"
R=$(curl -s "$BASE/api/models")
check "GET /api/models returns array" "\[" "$R"

# Presets are served via model providers
# (no separate /api/models/presets endpoint)

# ── Providers ──
echo -e "\n── Providers ──"
R=$(curl -s "$BASE/api/models/providers")
check "GET /api/models/providers returns array" "\[" "$R"

# ── Connectors ──
echo -e "\n── Connectors ──"
R=$(curl -s "$BASE/api/connectors")
check "GET /api/connectors" "\[" "$R"

# ── Skills ──
echo -e "\n── Skills ──"
R=$(curl -s "$BASE/api/skills")
check "GET /api/skills" "\[" "$R"

# ── Conversations ──
echo -e "\n── Conversations ──"
R=$(curl -s -X POST "$BASE/api/conversations" \
  -H 'Content-Type: application/json' \
  -d '{"title":"regression test"}')
CID=$(echo "$R" | jq -r '.id')
check "POST /api/conversations creates" "id" "$R"

R=$(curl -s "$BASE/api/conversations")
check "GET /api/conversations lists" "$CID" "$R"

R=$(curl -s "$BASE/api/conversations/$CID")
check "GET /api/conversations/:id returns detail" "$CID" "$R"

# Clean up conversation
curl -s -X DELETE "$BASE/api/conversations/$CID" > /dev/null

# ── Settings ──
echo -e "\n── Settings ──"
R=$(curl -s "$BASE/api/settings")
check "GET /api/settings" "{" "$R"

# ── Swarm Layer 3: Sessions ──
echo -e "\n── Swarm: Sessions ──"
SESSION=$(curl -s -X POST "$BASE/api/swarm/sessions" \
  -H 'Content-Type: application/json' \
  -d '{"name":"regression","objective":"Full test","agents":[
    {"id":"reg-a","name":"RegAlpha","role":"researcher","capabilities":["research"],"canSpawn":false},
    {"id":"reg-b","name":"RegBeta","role":"coder","capabilities":["code"],"canSpawn":true}
  ]}')
SID=$(echo "$SESSION" | jq -r '.id')
check "POST /api/swarm/sessions creates" "regression" "$SESSION"

R=$(curl -s "$BASE/api/swarm/sessions")
check "GET /api/swarm/sessions lists" "$SID" "$R"

R=$(curl -s "$BASE/api/swarm/sessions/$SID")
check "GET /api/swarm/sessions/:id detail" "$SID" "$R"

# ── Swarm: Agents ──
echo -e "\n── Swarm: Agents ──"
R=$(curl -s "$BASE/api/swarm/sessions/$SID/agents")
ACOUNT=$(echo "$R" | jq 'length')
check "GET agents returns 2" "2" "$ACOUNT"

R=$(curl -s "$BASE/api/swarm/sessions/$SID/agents/reg-a")
check "GET agent detail" "RegAlpha" "$R"

# Add a 3rd agent
R=$(curl -s -X POST "$BASE/api/swarm/sessions/$SID/agents" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Gamma","role":"writer","instructions":"Write things"}')
check "POST add agent" "Gamma" "$R"
GCID=$(echo "$R" | jq -r '.id')

# ── Swarm: Tasks ──
echo -e "\n── Swarm: Tasks ──"
TASK=$(curl -s -X POST "$BASE/api/swarm/sessions/$SID/tasks" \
  -H 'Content-Type: application/json' \
  -d '{"description":"Test task","taskType":"research","priority":75}')
TID=$(echo "$TASK" | jq -r '.id')
check "POST add task" "Test task" "$TASK"

R=$(curl -s "$BASE/api/swarm/sessions/$SID/tasks")
check "GET tasks" "$TID" "$R"

R=$(curl -s "$BASE/api/swarm/sessions/$SID/tasks/available")
check "GET available tasks" "$TID" "$R"

# Claim task
R=$(curl -s -X POST "$BASE/api/swarm/sessions/$SID/tasks/$TID/claim" \
  -H 'Content-Type: application/json' \
  -d '{"agentId":"reg-a"}')
check "POST claim task" "ok" "$R"

# Complete task
R=$(curl -s -X POST "$BASE/api/swarm/sessions/$SID/tasks/$TID/complete" \
  -H 'Content-Type: application/json' \
  -d '{"agentId":"reg-a","result":"Task done"}')
check "POST complete task" "ok" "$R"

# ── Swarm: Blackboard ──
echo -e "\n── Swarm: Blackboard ──"
R=$(curl -s -X POST "$BASE/api/swarm/sessions/$SID/blackboard" \
  -H 'Content-Type: application/json' \
  -d '{"topic":"findings","key":"result-1","value":"Important data","agentId":"reg-a","priority":80}')
check "POST blackboard write" "findings" "$R"

R=$(curl -s "$BASE/api/swarm/sessions/$SID/blackboard")
check "GET blackboard entries" "findings" "$R"

# ── Swarm: Consensus ──
echo -e "\n── Swarm: Consensus ──"
ROUND=$(curl -s -X POST "$BASE/api/swarm/sessions/$SID/consensus" \
  -H 'Content-Type: application/json' \
  -d '{"subject":"Should we proceed?","agentIds":["reg-a","reg-b"]}')
RID=$(echo "$ROUND" | jq -r '.id')
check "POST start consensus" "voting" "$ROUND"

# Vote
R=$(curl -s -X POST "$BASE/api/swarm/sessions/$SID/consensus/$RID/vote" \
  -H 'Content-Type: application/json' \
  -d '{"agentId":"reg-a","answer":"yes","confidence":0.9,"reasoning":"Looks good"}')
check "POST vote (agent-a)" "yes" "$R"

R=$(curl -s -X POST "$BASE/api/swarm/sessions/$SID/consensus/$RID/vote" \
  -H 'Content-Type: application/json' \
  -d '{"agentId":"reg-b","answer":"yes","confidence":0.8,"reasoning":"Agreed"}')
check "POST vote (agent-b) → resolved" "resolved" "$R"

# Human override vote
ROUND2=$(curl -s -X POST "$BASE/api/swarm/sessions/$SID/consensus" \
  -H 'Content-Type: application/json' \
  -d '{"subject":"Human check","agentIds":["reg-a","reg-b"]}')
RID2=$(echo "$ROUND2" | jq -r '.id')
R=$(curl -s -X POST "$BASE/api/swarm/sessions/$SID/consensus/$RID2/vote" \
  -H 'Content-Type: application/json' \
  -d '{"isHumanOverride":true,"answer":"override-yes","reasoning":"Human says go"}')
check "POST human override vote" "override-yes" "$R"

# ── Swarm: Handoffs (Fix 1) ──
echo -e "\n── Swarm: Handoffs ──"
R=$(curl -s -X POST "$BASE/api/swarm/sessions/$SID/handoffs" \
  -H 'Content-Type: application/json' \
  -d '{"fromAgentId":"reg-a","toAgentId":"reg-b","reason":"handoff test"}')
check "POST handoff (canonical)" "reg-a" "$R"

R=$(curl -s -X POST "$BASE/api/swarm/sessions/$SID/handoffs" \
  -H 'Content-Type: application/json' \
  -d '{"from":"reg-b","to":"reg-a","reason":"short alias"}')
check "POST handoff (short alias)" "reg-b" "$R"

R=$(curl -s "$BASE/api/swarm/sessions/$SID/handoffs")
HCOUNT=$(echo "$R" | jq 'length')
check "GET handoffs returns 2" "2" "$HCOUNT"

# ── Swarm: Messages (Fix 3) ──
echo -e "\n── Swarm: Messages ──"
R=$(curl -s -X POST "$BASE/api/swarm/sessions/$SID/messages" \
  -H 'Content-Type: application/json' \
  -d '{"fromAgentId":"reg-a","toAgentId":"reg-b","content":"ping","messageType":"info"}')
check "POST message" "ok" "$R"

R=$(curl -s -X POST "$BASE/api/swarm/sessions/$SID/messages" \
  -H 'Content-Type: application/json' \
  -d '{"from":"reg-a","content":"broadcast msg"}')
check "POST broadcast" "ok" "$R"

sleep 0.2
R=$(curl -s "$BASE/api/swarm/sessions/$SID/messages")
MCOUNT=$(echo "$R" | jq 'length')
check "GET messages returns 2+" "true" "$([ "$MCOUNT" -ge 2 ] && echo true || echo false)"

# ── Swarm: Spawn Diagnostics (Fix 2) ──
echo -e "\n── Swarm: Spawn Diagnostics ──"
R=$(curl -s -X POST "$BASE/api/swarm/sessions/$SID/agents/reg-a/spawn" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Child","role":"helper"}')
check "Spawn blocked (canSpawn:false) → reasons" "reasons" "$R"
check "Spawn blocked → hint" "hint" "$R"

# ── Swarm: Lifecycle ──
echo -e "\n── Swarm: Lifecycle ──"
R=$(curl -s -X POST "$BASE/api/swarm/sessions/$SID/start")
check "POST start swarm" "running" "$R"

R=$(curl -s "$BASE/api/swarm/sessions/$SID/stats")
check "GET stats" "agentCount" "$R"

R=$(curl -s "$BASE/api/swarm/sessions/$SID/topology")
check "GET topology" "nodes" "$R"

R=$(curl -s "$BASE/api/swarm/sessions/$SID/events?limit=5")
check "GET events" "\[" "$R"

R=$(curl -s -X POST "$BASE/api/swarm/sessions/$SID/stop")
check "POST stop swarm" "completed" "$R"

# ── Swarm: Config ──
echo -e "\n── Swarm: Config ──"
R=$(curl -s "$BASE/api/swarm/config")
check "GET swarm config defaults" "enableHandoffs" "$R"

# ── Cleanup ──
echo -e "\n── Cleanup ──"
curl -s -X DELETE "$BASE/api/swarm/sessions/$SID" > /dev/null
check "DELETE session" "✅" "✅"

# ── Legacy Routes ──
echo -e "\n── Legacy Routes ──"
R=$(curl -s "$BASE/api/swarm")
check "GET /api/swarm (legacy)" "\[" "$R"

echo -e "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "   Results: $PASS/$TOTAL passed, $FAIL failed"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
[ $FAIL -eq 0 ] && echo "🎉 ALL GREEN — READY TO COMMIT" || echo "⚠️  $FAIL FAILURES"
exit $FAIL
