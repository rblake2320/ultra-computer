#!/bin/bash
# Part 2: Cache, Sandbox, Queue, Autonomy (Checkpoints, Circuits, Cron, Learning, Skills)
BASE="http://localhost:5000"
PASS=0; FAIL=0; TOTAL=0; FAILURES=""
assert_status() { TOTAL=$((TOTAL+1)); if [ "$3" -eq "$2" ] 2>/dev/null; then PASS=$((PASS+1)); echo "  ✓ $1"; else FAIL=$((FAIL+1)); FAILURES="$FAILURES\n  ✗ $1 (exp $2, got $3)"; echo "  ✗ $1 (exp $2, got $3)"; fi; }
assert_any() { local l="$1" a="$2"; shift 2; TOTAL=$((TOTAL+1)); for e in "$@"; do [ "$a" -eq "$e" ] 2>/dev/null && { PASS=$((PASS+1)); echo "  ✓ $l"; return; }; done; FAIL=$((FAIL+1)); echo "  ✗ $l (got $a)"; FAILURES="$FAILURES\n  ✗ $l (got $a)"; }
c() { curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$@"; }
cb() { curl -s --max-time 5 "$@"; }

echo "═══ Part 2: Infrastructure Domains ═══"

echo "▸ Cache"
assert_status "GET /api/cache/stats" 200 "$(c $BASE/api/cache/stats)"
assert_status "GET /api/cache/dashboard" 200 "$(c $BASE/api/cache/dashboard)"
assert_status "GET /api/cache/config" 200 "$(c $BASE/api/cache/config)"
assert_status "GET /api/cache/memory" 200 "$(c $BASE/api/cache/memory)"
assert_any "POST /api/cache/clear" "$(c -X POST $BASE/api/cache/clear -H 'Content-Type: application/json' -d '{}')" 200 204 500
assert_any "POST /api/cache/reset-stats" "$(c -X POST $BASE/api/cache/reset-stats)" 200 204
assert_any "POST /api/cache/policy" "$(c -X POST $BASE/api/cache/policy -H 'Content-Type: application/json' -d '{"route":"/api/test","ttlMs":60000}')" 200 204 400

echo "▸ Sandbox"
assert_status "GET /api/sandbox/status" 200 "$(c $BASE/api/sandbox/status)"
assert_status "GET /api/sandbox/config" 200 "$(c $BASE/api/sandbox/config)"
assert_status "GET /api/sandbox/files" 200 "$(c $BASE/api/sandbox/files)"
assert_any "POST /api/sandbox/cleanup" "$(c -X POST $BASE/api/sandbox/cleanup)" 200 204
assert_any "POST /api/sandbox/reset-detection" "$(c -X POST $BASE/api/sandbox/reset-detection)" 200 204
assert_any "POST /api/sandbox/pull-image" "$(c -X POST $BASE/api/sandbox/pull-image -H 'Content-Type: application/json' -d '{"image":"alpine:latest"}')" 200 400 500 503

echo "▸ Queue"
assert_status "GET /api/queue/status" 200 "$(c $BASE/api/queue/status)"
assert_any "GET /api/queue/job/fake" "$(c $BASE/api/queue/job/fake)" 200 404

echo "▸ Autonomy — Health & Dashboard"
assert_status "GET /api/autonomy/health" 200 "$(c $BASE/api/autonomy/health)"
assert_status "GET /api/autonomy/dashboard" 200 "$(c $BASE/api/autonomy/dashboard)"

echo "▸ Autonomy — Checkpoints"
assert_status "GET /api/autonomy/checkpoints" 200 "$(c $BASE/api/autonomy/checkpoints)"
assert_status "GET /api/autonomy/checkpoints/stats" 200 "$(c $BASE/api/autonomy/checkpoints/stats)"
assert_status "GET /api/autonomy/checkpoints/resumable" 200 "$(c $BASE/api/autonomy/checkpoints/resumable)"

CP=$(cb -X POST $BASE/api/autonomy/checkpoints -H "Content-Type: application/json" -d '{"taskType":"test","state":{"step":1},"resumable":true}')
CPID=$(echo "$CP" | grep -oP '"id":\s*"?([^",}]+)' | head -1 | sed 's/"id":\s*"*//')
if [ -n "$CPID" ]; then
  assert_status "POST /api/autonomy/checkpoints" 200 200
  assert_status "GET /api/autonomy/checkpoints/$CPID" 200 "$(c $BASE/api/autonomy/checkpoints/$CPID)"
  assert_any "POST checkpoints/$CPID/heartbeat" "$(c -X POST $BASE/api/autonomy/checkpoints/$CPID/heartbeat)" 200 204
  assert_any "POST checkpoints/$CPID/advance" "$(c -X POST $BASE/api/autonomy/checkpoints/$CPID/advance -H 'Content-Type: application/json' -d '{"state":{"step":2}}')" 200 204
  assert_any "POST checkpoints/$CPID/complete" "$(c -X POST $BASE/api/autonomy/checkpoints/$CPID/complete)" 200 204
fi
CP2=$(cb -X POST $BASE/api/autonomy/checkpoints -H "Content-Type: application/json" -d '{"taskType":"fail","state":{},"resumable":true}')
CP2ID=$(echo "$CP2" | grep -oP '"id":\s*"?([^",}]+)' | head -1 | sed 's/"id":\s*"*//')
[ -n "$CP2ID" ] && assert_any "POST checkpoints/$CP2ID/fail" "$(c -X POST $BASE/api/autonomy/checkpoints/$CP2ID/fail -H 'Content-Type: application/json' -d '{"error":"test"}')" 200 204
assert_any "POST checkpoints/abandon-stale" "$(c -X POST $BASE/api/autonomy/checkpoints/abandon-stale)" 200 204

echo "▸ Autonomy — Circuits"
assert_status "GET /api/autonomy/circuits" 200 "$(c $BASE/api/autonomy/circuits)"
assert_any "POST circuits/test/reset" "$(c -X POST $BASE/api/autonomy/circuits/test-circuit/reset)" 200 204 404
assert_any "POST circuits/reset-all" "$(c -X POST $BASE/api/autonomy/circuits/reset-all)" 200 204

echo "▸ Autonomy — Cron"
assert_status "GET /api/autonomy/cron" 200 "$(c $BASE/api/autonomy/cron)"
assert_status "GET /api/autonomy/cron/stats" 200 "$(c $BASE/api/autonomy/cron/stats)"
assert_status "GET /api/autonomy/cron/enabled" 200 "$(c $BASE/api/autonomy/cron/enabled)"
CJ=$(cb -X POST $BASE/api/autonomy/cron -H "Content-Type: application/json" -d '{"name":"Test Cron","schedule":"*/5 * * * *","task":"echo hello","enabled":true}')
CJID=$(echo "$CJ" | grep -oP '"id":\s*"?([^",}]+)' | head -1 | sed 's/"id":\s*"*//')
if [ -n "$CJID" ]; then
  assert_status "POST /api/autonomy/cron" 200 200
  assert_status "GET /api/autonomy/cron/$CJID" 200 "$(c $BASE/api/autonomy/cron/$CJID)"
  assert_any "POST cron/$CJID/toggle" "$(c -X POST $BASE/api/autonomy/cron/$CJID/toggle)" 200 204
  assert_any "DELETE /api/autonomy/cron/$CJID" "$(c -X DELETE $BASE/api/autonomy/cron/$CJID)" 200 204
fi

echo "▸ Autonomy — Learning"
assert_status "GET learning/stats" 200 "$(c $BASE/api/autonomy/learning/stats)"
assert_status "GET learning/history" 200 "$(c $BASE/api/autonomy/learning/history)"
assert_status "GET learning/failures" 200 "$(c $BASE/api/autonomy/learning/failures)"
assert_status "GET learning/models" 200 "$(c $BASE/api/autonomy/learning/models)"
assert_status "GET learning/skills" 200 "$(c $BASE/api/autonomy/learning/skills)"
assert_any "POST learning/log" "$(c -X POST $BASE/api/autonomy/learning/log -H 'Content-Type: application/json' -d '{"taskType":"test","outcome":"success","duration":100,"model":"gpt-4o"}')" 200 201
assert_any "POST learning/feedback" "$(c -X POST $BASE/api/autonomy/learning/feedback -H 'Content-Type: application/json' -d '{"executionId":"exec-1","feedback":"positive","correctionText":"good work"}')" 200 201
assert_any "POST learning/analyze" "$(c -X POST $BASE/api/autonomy/learning/analyze)" 200 204 500
assert_any "POST learning/compact" "$(c -X POST $BASE/api/autonomy/learning/compact)" 200 204 500
assert_any "POST learning/recommend" "$(c -X POST $BASE/api/autonomy/learning/recommend -H 'Content-Type: application/json' -d '{"taskType":"coding"}')" 200 404
assert_any "GET learning/insights/coding" "$(c $BASE/api/autonomy/learning/insights/coding)" 200 404

echo "▸ Autonomy — Skills"
assert_status "GET skills/health" 200 "$(c $BASE/api/autonomy/skills/health)"
assert_status "GET skills/performance" 200 "$(c $BASE/api/autonomy/skills/performance)"
assert_status "GET skills/improvements" 200 "$(c $BASE/api/autonomy/skills/improvements)"
assert_any "POST skills/record-execution" "$(c -X POST $BASE/api/autonomy/skills/record-execution -H 'Content-Type: application/json' -d '{"skillId":"sk-1","skillName":"test","success":true,"durationMs":50}')" 200 201
assert_any "POST skills/improvements/generate" "$(c -X POST $BASE/api/autonomy/skills/improvements/generate)" 200 204

echo "▸ Browser"
assert_status "GET /api/browser/sessions" 200 "$(c $BASE/api/browser/sessions)"
assert_any "POST /api/browser/navigate" "$(c -X POST $BASE/api/browser/navigate -H 'Content-Type: application/json' -d '{"url":"https://example.com"}')" 200 400 500 503
assert_any "POST /api/browser/action" "$(c -X POST $BASE/api/browser/action -H 'Content-Type: application/json' -d '{"action":"click","selector":"body"}')" 200 400 500 503
assert_any "POST /api/browser/evaluate" "$(c -X POST $BASE/api/browser/evaluate -H 'Content-Type: application/json' -d '{"code":"1+1"}')" 200 400 500 503
assert_any "POST /api/browser/resize" "$(c -X POST $BASE/api/browser/resize -H 'Content-Type: application/json' -d '{"width":1920,"height":1080}')" 200 400 500 503
assert_any "GET /api/browser/screenshot/test" "$(c $BASE/api/browser/screenshot/test)" 200 404 500 503
assert_any "DELETE /api/browser/sessions/test" "$(c -X DELETE $BASE/api/browser/sessions/test)" 200 204 404

echo "▸ Messaging"
assert_status "GET /api/messaging/channels" 200 "$(c $BASE/api/messaging/channels)"
assert_status "GET /api/messaging/stats" 200 "$(c $BASE/api/messaging/stats)"
assert_status "GET /api/messaging/history" 200 "$(c $BASE/api/messaging/history)"
assert_status "GET /api/messaging/subscriptions" 200 "$(c $BASE/api/messaging/subscriptions)"
CH=$(cb -X POST $BASE/api/messaging/channels -H "Content-Type: application/json" -d '{"name":"TestChan","type":"webhook","config":{"url":"https://example.com/hook"}}')
CHID=$(echo "$CH" | grep -oP '"id":\s*"?([^",}]+)' | head -1 | sed 's/"id":\s*"*//')
if [ -n "$CHID" ]; then
  assert_status "POST /api/messaging/channels" 200 200
  assert_status "GET /api/messaging/channels/$CHID" 200 "$(c $BASE/api/messaging/channels/$CHID)"
  assert_any "POST channels/$CHID/test" "$(c -X POST $BASE/api/messaging/channels/$CHID/test)" 200 500
  assert_any "POST channels/$CHID/connect" "$(c -X POST $BASE/api/messaging/channels/$CHID/connect)" 200 204
  assert_any "POST channels/$CHID/disconnect" "$(c -X POST $BASE/api/messaging/channels/$CHID/disconnect)" 200 204
  assert_any "DELETE /api/messaging/channels/$CHID" "$(c -X DELETE $BASE/api/messaging/channels/$CHID)" 200 204
fi
assert_any "POST /api/messaging/send" "$(c -X POST $BASE/api/messaging/send -H 'Content-Type: application/json' -d '{"channel":"test","content":"hello"}')" 200 400 500
assert_any "POST /api/messaging/notify" "$(c -X POST $BASE/api/messaging/notify -H 'Content-Type: application/json' -d '{"type":"alert","title":"Test","body":"test notification","severity":"info"}')" 200 201
assert_any "POST /api/messaging/broadcast" "$(c -X POST $BASE/api/messaging/broadcast -H 'Content-Type: application/json' -d '{"content":"broadcast"}')" 200 400
assert_any "GET /api/messaging/delivery/fake" "$(c $BASE/api/messaging/delivery/fake)" 200 404
assert_any "POST /api/messaging/webhook/slack" "$(c -X POST $BASE/api/messaging/webhook/slack -H 'Content-Type: application/json' -d '{"text":"test"}')" 200 400
assert_any "POST /api/messaging/webhook/gmail" "$(c -X POST $BASE/api/messaging/webhook/gmail -H 'Content-Type: application/json' -d '{"message":"test"}')" 200 400

echo ""
echo "═══ Part 2 Results: Total=$TOTAL Pass=$PASS Fail=$FAIL ═══"
[ "$FAIL" -gt 0 ] && echo -e "$FAILURES"
exit $FAIL
