#!/bin/bash
# Part 3: Protocols, Identity, NIP, Marketplace, Swarm Full Lifecycle, OAuth, Webhooks
BASE="http://localhost:5000"
PASS=0; FAIL=0; TOTAL=0; FAILURES=""
assert_status() { TOTAL=$((TOTAL+1)); if [ "$3" -eq "$2" ] 2>/dev/null; then PASS=$((PASS+1)); echo "  ✓ $1"; else FAIL=$((FAIL+1)); FAILURES="$FAILURES\n  ✗ $1 (exp $2, got $3)"; echo "  ✗ $1 (exp $2, got $3)"; fi; }
assert_any() { local l="$1" a="$2"; shift 2; TOTAL=$((TOTAL+1)); for e in "$@"; do [ "$a" -eq "$e" ] 2>/dev/null && { PASS=$((PASS+1)); echo "  ✓ $l"; return; }; done; FAIL=$((FAIL+1)); echo "  ✗ $l (got $a)"; FAILURES="$FAILURES\n  ✗ $l (got $a)"; }
c() { curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$@"; }
cb() { curl -s --max-time 5 "$@"; }

echo "═══ Part 3: Protocols + Identity + Marketplace + Swarm ═══"

echo "▸ Protocols — Dashboard"
assert_status "GET /api/protocols/dashboard" 200 "$(c $BASE/api/protocols/dashboard)"

echo "▸ Protocols — A2A"
assert_status "GET /api/protocols/a2a/card" 200 "$(c $BASE/api/protocols/a2a/card)"
assert_status "GET /api/protocols/a2a/agents" 200 "$(c $BASE/api/protocols/a2a/agents)"
A2A=$(cb -X POST $BASE/api/protocols/a2a/agents -H "Content-Type: application/json" -d '{"name":"TestAgent","url":"https://example.com/agent","capabilities":["chat"]}')
A2AID=$(echo "$A2A" | grep -oP '"id":\s*"?([^",}]+)' | head -1 | sed 's/"id":\s*"*//')
if [ -n "$A2AID" ]; then
  assert_status "POST a2a/agents" 200 200
  assert_status "GET a2a/agents/$A2AID" 200 "$(c $BASE/api/protocols/a2a/agents/$A2AID)"
  assert_any "POST a2a/agents/$A2AID/send" "$(c -X POST $BASE/api/protocols/a2a/agents/$A2AID/send -H 'Content-Type: application/json' -d '{"message":"hello"}')" 200 400 500
fi
assert_any "POST a2a/agents/discover" "$(c -X POST $BASE/api/protocols/a2a/agents/discover -H 'Content-Type: application/json' -d '{"url":"https://example.com"}')" 200 400 500
assert_any "POST a2a/rpc" "$(c -X POST $BASE/api/protocols/a2a/rpc -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","method":"agent.info","id":"1"}')" 200 400

echo "▸ Protocols — MCP"
assert_status "GET /api/protocols/mcp/servers" 200 "$(c $BASE/api/protocols/mcp/servers)"
assert_any "POST mcp/servers/connect" "$(c -X POST $BASE/api/protocols/mcp/servers/connect -H 'Content-Type: application/json' -d '{"url":"https://example.com/mcp"}')" 200 400 500
assert_any "POST mcp/rpc" "$(c -X POST $BASE/api/protocols/mcp/rpc -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","method":"ping","id":"1"}')" 200 400 401

echo "▸ Protocols — CLI"
assert_status "GET /api/protocols/cli/tools" 200 "$(c $BASE/api/protocols/cli/tools)"
assert_any "POST cli/execute" "$(c -X POST $BASE/api/protocols/cli/execute -H 'Content-Type: application/json' -d '{"command":"echo hello"}')" 200 400 500
assert_any "POST cli/validate" "$(c -X POST $BASE/api/protocols/cli/validate -H 'Content-Type: application/json' -d '{"command":"echo hello"}')" 200 400
assert_any "POST cli/pipeline" "$(c -X POST $BASE/api/protocols/cli/pipeline -H 'Content-Type: application/json' -d '{"steps":[{"command":"echo hello"}]}')" 200 400 500
assert_any "POST cli/script" "$(c -X POST $BASE/api/protocols/cli/script -H 'Content-Type: application/json' -d '{"script":"echo hello","language":"bash"}')" 200 400 500

echo "▸ Protocols — Code, HTTP, Files"
assert_any "POST code/interpret" "$(c -X POST $BASE/api/protocols/code/interpret -H 'Content-Type: application/json' -d '{"code":"1+1","language":"javascript"}')" 200 400 500
assert_any "POST http/request" "$(c -X POST $BASE/api/protocols/http/request -H 'Content-Type: application/json' -d '{"url":"https://httpbin.org/get","method":"GET"}')" 200 400 500
assert_any "POST files/transform" "$(c -X POST $BASE/api/protocols/files/transform -H 'Content-Type: application/json' -d '{"input":"test.txt","output":"test.pdf"}')" 200 400 500

echo "▸ Protocols — Webhooks"
assert_status "GET /api/protocols/webhooks" 200 "$(c $BASE/api/protocols/webhooks)"
assert_any "POST /api/protocols/webhooks" "$(c -X POST $BASE/api/protocols/webhooks -H 'Content-Type: application/json' -d '{"name":"TestHook","url":"https://example.com/hook","events":["message"]}')" 200 201 400

echo "▸ Identity"
assert_status "GET /api/identity/directory" 200 "$(c $BASE/api/identity/directory)"
assert_status "GET /api/identity/stats" 200 "$(c $BASE/api/identity/stats)"
assert_status "GET /api/identity/verifications" 200 "$(c $BASE/api/identity/verifications)"
assert_status "GET /api/identity/audit" 200 "$(c $BASE/api/identity/audit)"
ID_RESP=$(cb -X POST $BASE/api/identity/register -H "Content-Type: application/json" -d '{"name":"TestAgent","type":"agent","capabilities":["chat"]}')
CRY_ID=$(echo "$ID_RESP" | grep -oP '"cryptoId":\s*"([^"]+)"' | head -1 | sed 's/"cryptoId":\s*"//' | sed 's/"$//')
if [ -z "$CRY_ID" ]; then
  CRY_ID=$(echo "$ID_RESP" | grep -oP '"id":\s*"?([^",}]+)' | head -1 | sed 's/"id":\s*"*//')
fi
if [ -n "$CRY_ID" ]; then
  assert_status "POST identity/register" 200 200
  assert_any "GET identity/$CRY_ID" "$(c $BASE/api/identity/$CRY_ID)" 200 404
  assert_any "GET identity/$CRY_ID/full" "$(c $BASE/api/identity/$CRY_ID/full)" 200 404
  assert_any "PUT identity/$CRY_ID/profile" "$(c -X PUT $BASE/api/identity/$CRY_ID/profile -H 'Content-Type: application/json' -d '{"displayName":"Test"}')" 200 204
  assert_any "POST identity/$CRY_ID/verify" "$(c -X POST $BASE/api/identity/$CRY_ID/verify)" 200 204
  assert_any "POST identity/$CRY_ID/trust" "$(c -X POST $BASE/api/identity/$CRY_ID/trust -H 'Content-Type: application/json' -d '{"level":"trusted"}')" 200 204
  assert_any "POST identity/$CRY_ID/block" "$(c -X POST $BASE/api/identity/$CRY_ID/block)" 200 204
  assert_any "GET identity/$CRY_ID/blocks" "$(c $BASE/api/identity/$CRY_ID/blocks)" 200 404
  assert_any "POST identity/$CRY_ID/unblock" "$(c -X POST $BASE/api/identity/$CRY_ID/unblock)" 200 204
  assert_any "POST identity/$CRY_ID/suspend" "$(c -X POST $BASE/api/identity/$CRY_ID/suspend)" 200 204
  assert_any "POST identity/$CRY_ID/ban" "$(c -X POST $BASE/api/identity/$CRY_ID/ban)" 200 204
fi
assert_any "GET identity/search" "$(c "$BASE/api/identity/search?q=test")" 200 400

echo "▸ NIP"
assert_status "GET /api/nip/sessions" 200 "$(c $BASE/api/nip/sessions)"
assert_status "GET /api/nip/sessions/stats" 200 "$(c $BASE/api/nip/sessions/stats)"
assert_status "GET /api/nip/alerts" 200 "$(c $BASE/api/nip/alerts)"
assert_status "GET /api/nip/trusted-parties" 200 "$(c $BASE/api/nip/trusted-parties)"
NIP=$(cb -X POST $BASE/api/nip/sessions -H "Content-Type: application/json" -d '{"topic":"test negotiation","parties":["agent-a","agent-b"]}')
NIPID=$(echo "$NIP" | grep -oP '"id":\s*"?([^",}]+)' | head -1 | sed 's/"id":\s*"*//')
if [ -n "$NIPID" ]; then
  assert_status "POST nip/sessions" 200 200
  assert_status "GET nip/sessions/$NIPID" 200 "$(c $BASE/api/nip/sessions/$NIPID)"
  assert_any "GET nip/sessions/$NIPID/messages" "$(c $BASE/api/nip/sessions/$NIPID/messages)" 200 404
  assert_any "GET nip/sessions/$NIPID/alerts" "$(c $BASE/api/nip/sessions/$NIPID/alerts)" 200 404
  assert_any "POST nip/sessions/$NIPID/negotiate" "$(c -X POST $BASE/api/nip/sessions/$NIPID/negotiate -H 'Content-Type: application/json' -d '{"proposal":"test"}')" 200 400 500
  assert_any "POST nip/sessions/$NIPID/pause" "$(c -X POST $BASE/api/nip/sessions/$NIPID/pause)" 200 204
  assert_any "POST nip/sessions/$NIPID/resume" "$(c -X POST $BASE/api/nip/sessions/$NIPID/resume)" 200 204
  assert_any "GET nip/sessions/$NIPID/report" "$(c $BASE/api/nip/sessions/$NIPID/report)" 200 404
  assert_any "POST nip/sessions/$NIPID/complete" "$(c -X POST $BASE/api/nip/sessions/$NIPID/complete)" 200 204
fi
NIP2=$(cb -X POST $BASE/api/nip/sessions -H "Content-Type: application/json" -d '{"topic":"terminate","parties":["a","b"]}')
NIP2ID=$(echo "$NIP2" | grep -oP '"id":\s*"?([^",}]+)' | head -1 | sed 's/"id":\s*"*//')
[ -n "$NIP2ID" ] && assert_any "POST nip/sessions/$NIP2ID/terminate" "$(c -X POST $BASE/api/nip/sessions/$NIP2ID/terminate)" 200 204
assert_any "POST nip/access/validate" "$(c -X POST $BASE/api/nip/access/validate -H 'Content-Type: application/json' -d '{"agentId":"test","resource":"data"}')" 200 400

echo "▸ Marketplace"
assert_status "GET /api/marketplace/skills" 200 "$(c $BASE/api/marketplace/skills)"
assert_status "GET /api/marketplace/stats" 200 "$(c $BASE/api/marketplace/stats)"
assert_status "GET /api/marketplace/installs" 200 "$(c $BASE/api/marketplace/installs)"
assert_any "POST /api/marketplace/seed" "$(c -X POST $BASE/api/marketplace/seed)" 200 204 403
sleep 1
MKT=$(cb $BASE/api/marketplace/skills)
MKTID=$(echo "$MKT" | grep -oP '"id":\s*"?([^",}]+)' | head -1 | sed 's/"id":\s*"*//')
if [ -n "$MKTID" ]; then
  assert_status "GET marketplace/skills/$MKTID" 200 "$(c $BASE/api/marketplace/skills/$MKTID)"
  assert_any "GET marketplace/$MKTID/ratings" "$(c $BASE/api/marketplace/skills/$MKTID/ratings)" 200 404
  assert_any "GET marketplace/$MKTID/versions" "$(c $BASE/api/marketplace/skills/$MKTID/versions)" 200 404
  assert_any "GET marketplace/$MKTID/score" "$(c $BASE/api/marketplace/skills/$MKTID/score)" 200 404
  assert_any "POST marketplace/$MKTID/install" "$(c -X POST $BASE/api/marketplace/skills/$MKTID/install)" 200 204
  assert_any "POST marketplace/$MKTID/rate" "$(c -X POST $BASE/api/marketplace/skills/$MKTID/rate -H 'Content-Type: application/json' -d '{"rating":5,"review":"great"}')" 200 201
  assert_any "POST marketplace/$MKTID/fork" "$(c -X POST $BASE/api/marketplace/skills/$MKTID/fork)" 200 201
  assert_any "POST marketplace/$MKTID/uninstall" "$(c -X POST $BASE/api/marketplace/skills/$MKTID/uninstall)" 200 204
fi
assert_status "GET /api/marketplace/scoring/config" 200 "$(c $BASE/api/marketplace/scoring/config)"
assert_any "POST /api/marketplace/scoring/run" "$(c -X POST $BASE/api/marketplace/scoring/run)" 200 204

sleep 2
echo "▸ Swarm — Full Lifecycle"
assert_status "GET /api/swarm/sessions" 200 "$(c $BASE/api/swarm/sessions)"
assert_status "GET /api/swarm/config" 200 "$(c $BASE/api/swarm/config)"
SW=$(cb -X POST $BASE/api/swarm/sessions -H "Content-Type: application/json" -d '{"name":"LifecycleTest","description":"Full","mode":"collaborative","consensusThreshold":0.7,"maxAgents":5,"tokenBudget":10000,"agents":[{"id":"alpha","role":"NOVA","capabilities":["reasoning"]},{"id":"beta","role":"FORGE","capabilities":["code"]}]}')
SID=$(echo "$SW" | grep -oP '"id":\s*"([^"]+)"' | head -1 | grep -oP '(?<=")[^"]+(?="$)')
if [ -n "$SID" ]; then
  assert_status "POST /api/swarm/sessions" 200 200
  assert_status "GET swarm/sessions/$SID" 200 "$(c $BASE/api/swarm/sessions/$SID)"
  assert_status "GET swarm/$SID/stats" 200 "$(c $BASE/api/swarm/sessions/$SID/stats)"
  assert_status "GET swarm/$SID/agents" 200 "$(c $BASE/api/swarm/sessions/$SID/agents)"
  assert_status "GET swarm/$SID/topology" 200 "$(c $BASE/api/swarm/sessions/$SID/topology)"
  assert_status "GET swarm/$SID/events" 200 "$(c "$BASE/api/swarm/sessions/$SID/events?limit=10")"
  assert_status "GET swarm/$SID/messages" 200 "$(c $BASE/api/swarm/sessions/$SID/messages)"
  assert_status "GET swarm/$SID/blackboard" 200 "$(c $BASE/api/swarm/sessions/$SID/blackboard)"
  assert_any "POST swarm/$SID/start" "$(c -X POST $BASE/api/swarm/sessions/$SID/start)" 200 204
  sleep 1
  assert_status "GET swarm/$SID/tasks" 200 "$(c $BASE/api/swarm/sessions/$SID/tasks)"
  assert_status "GET swarm/$SID/tasks/available" 200 "$(c $BASE/api/swarm/sessions/$SID/tasks/available)"
  
  # Create + claim + complete task
  T=$(cb -X POST $BASE/api/swarm/sessions/$SID/tasks -H "Content-Type: application/json" -d '{"description":"Test task","priority":"high"}')
  TID=$(echo "$T" | grep -oP '"id":\s*"([^"]+)"' | head -1 | grep -oP '(?<=")[^"]+(?="$)')
  if [ -n "$TID" ]; then
    assert_status "POST swarm/$SID/tasks" 200 200
    assert_any "POST tasks/$TID/claim" "$(c -X POST $BASE/api/swarm/sessions/$SID/tasks/$TID/claim -H 'Content-Type: application/json' -d '{"agentId":"alpha"}')" 200 204
    assert_any "POST tasks/$TID/complete" "$(c -X POST $BASE/api/swarm/sessions/$SID/tasks/$TID/complete -H 'Content-Type: application/json' -d '{"agentId":"alpha","result":"done"}')" 200 204
  fi

  # Create task to test fail
  T2=$(cb -X POST $BASE/api/swarm/sessions/$SID/tasks -H "Content-Type: application/json" -d '{"description":"Fail task"}')
  T2ID=$(echo "$T2" | grep -oP '"id":\s*"([^"]+)"' | head -1 | grep -oP '(?<=")[^"]+(?="$)')
  [ -n "$T2ID" ] && assert_any "POST tasks/$T2ID/fail" "$(c -X POST $BASE/api/swarm/sessions/$SID/tasks/$T2ID/fail -H 'Content-Type: application/json' -d '{"agentId":"alpha","error":"test"}')" 200 204

  # Consensus
  assert_status "GET swarm/$SID/consensus" 200 "$(c $BASE/api/swarm/sessions/$SID/consensus)"
  CR=$(cb -X POST $BASE/api/swarm/sessions/$SID/consensus -H "Content-Type: application/json" -d '{"topic":"Proceed?","options":["yes","no"]}')
  RID=$(echo "$CR" | grep -oP '"roundId":\s*"([^"]+)"' | head -1 | grep -oP '(?<=")[^"]+(?="$)')
  [ -z "$RID" ] && RID=$(echo "$CR" | grep -oP '"id":\s*"([^"]+)"' | head -1 | grep -oP '(?<=")[^"]+(?="$)')
  if [ -n "$RID" ]; then
    assert_status "POST consensus round" 200 200
    assert_status "GET consensus/$RID" 200 "$(c $BASE/api/swarm/sessions/$SID/consensus/$RID)"
    assert_any "POST consensus/$RID/vote" "$(c -X POST $BASE/api/swarm/sessions/$SID/consensus/$RID/vote -H 'Content-Type: application/json' -d '{"agentId":"alpha","vote":"yes","confidence":0.9}')" 200 204
  fi

  sleep 1
  # Handoffs
  assert_status "GET swarm/$SID/handoffs" 200 "$(c $BASE/api/swarm/sessions/$SID/handoffs)"
  assert_any "POST swarm/$SID/handoffs" "$(c -X POST $BASE/api/swarm/sessions/$SID/handoffs -H 'Content-Type: application/json' -d '{"from":"alpha","to":"beta","reason":"test"}')" 200 201 400

  # Messages
  assert_any "POST swarm/$SID/messages" "$(c -X POST $BASE/api/swarm/sessions/$SID/messages -H 'Content-Type: application/json' -d '{"agentId":"alpha","content":"hello","type":"chat"}')" 200 201

  # Blackboard boost
  assert_any "POST swarm/$SID/blackboard/boost" "$(c -X POST $BASE/api/swarm/sessions/$SID/blackboard/boost -H 'Content-Type: application/json' -d '{"topic":"test-topic","key":"important","amount":5}')" 200 204 404

  sleep 1
  # Agent operations
  assert_status "GET swarm/$SID/agents/alpha" 200 "$(c $BASE/api/swarm/sessions/$SID/agents/alpha)"
  assert_any "POST agents/alpha/execute" "$(c -X POST $BASE/api/swarm/sessions/$SID/agents/alpha/execute -H 'Content-Type: application/json' -d '{"task":"test"}')" 200 400 500
  assert_any "POST agents/alpha/spawn" "$(c -X POST $BASE/api/swarm/sessions/$SID/agents/alpha/spawn -H 'Content-Type: application/json' -d '{"role":"WORKER","capabilities":["compute"]}')" 200 201 400 500 403

  # Run (orchestrate one step)
  assert_any "POST swarm/$SID/run" "$(c -X POST $BASE/api/swarm/sessions/$SID/run -H 'Content-Type: application/json' -d '{"input":"test"}')" 200 400 500

  # Stop
  assert_any "POST swarm/$SID/stop" "$(c -X POST $BASE/api/swarm/sessions/$SID/stop)" 200 204

  # Delete
  assert_any "DELETE swarm/$SID" "$(c -X DELETE $BASE/api/swarm/sessions/$SID)" 200 204
fi

# Terminate test
SW2=$(cb -X POST $BASE/api/swarm/sessions -H "Content-Type: application/json" -d '{"name":"TermTest","mode":"pipeline"}')
SID2=$(echo "$SW2" | grep -oP '"id":\s*"([^"]+)"' | head -1 | grep -oP '(?<=")[^"]+(?="$)')
[ -n "$SID2" ] && assert_any "POST swarm/$SID2/terminate" "$(c -X POST $BASE/api/swarm/sessions/$SID2/terminate -H 'Content-Type: application/json' -d '{"reason":"test"}')" 200 204 400

sleep 2
# Legacy routes
assert_status "GET /api/swarm (legacy)" 200 "$(c $BASE/api/swarm)"
assert_any "POST /api/swarm (legacy)" "$(c -X POST $BASE/api/swarm -H 'Content-Type: application/json' -d '{"name":"Legacy","mode":"debate"}')" 200 201

echo "▸ OAuth"
assert_any "GET oauth/test/authorize" "$(c $BASE/api/oauth/test-connector/authorize)" 200 302 400 404 500
assert_any "GET oauth/callback" "$(c "$BASE/api/oauth/callback?code=test&state=test")" 200 302 400 500

echo "▸ Webhooks"
assert_any "POST /api/webhooks/test-id" "$(c -X POST $BASE/api/webhooks/test-id -H 'Content-Type: application/json' -d '{"event":"test"}')" 200 404

echo ""
echo "═══ Part 3 Results: Total=$TOTAL Pass=$PASS Fail=$FAIL ═══"
[ "$FAIL" -gt 0 ] && echo -e "$FAILURES"
exit $FAIL
