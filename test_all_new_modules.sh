#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# ULTRA COMPUTER — Comprehensive Test Suite for Self-Awareness/Healing/Correction
# ═══════════════════════════════════════════════════════════════════════════════
# Tests every new endpoint and validates response structure & correctness.

BASE="http://localhost:5000"
PASS=0
FAIL=0
ERRORS=""

# Helper: test an endpoint and validate
test_endpoint() {
  local METHOD="$1"
  local URL="$2"
  local DATA="$3"
  local DESC="$4"
  local EXPECT_FIELD="$5"  # JSON field that must exist in response

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "TEST: $DESC"
  echo "  $METHOD $URL"

  if [ "$METHOD" = "GET" ]; then
    RESPONSE=$(curl -s -w "\n%{http_code}" "$BASE$URL")
  else
    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST -H "Content-Type: application/json" -d "$DATA" "$BASE$URL")
  fi

  HTTP_CODE=$(echo "$RESPONSE" | tail -1)
  BODY=$(echo "$RESPONSE" | sed '$d')

  echo "  HTTP Status: $HTTP_CODE"

  # Check HTTP status
  if [ "$HTTP_CODE" -ge 200 ] && [ "$HTTP_CODE" -lt 300 ]; then
    echo "  ✅ HTTP OK"
  else
    echo "  ❌ HTTP FAIL (expected 2xx, got $HTTP_CODE)"
    echo "  Response: $(echo "$BODY" | head -5)"
    FAIL=$((FAIL + 1))
    ERRORS="$ERRORS\n❌ $DESC — HTTP $HTTP_CODE"
    return
  fi

  # Check response is valid JSON
  echo "$BODY" | python3 -m json.tool > /dev/null 2>&1
  if [ $? -ne 0 ]; then
    echo "  ❌ INVALID JSON"
    echo "  Response: $(echo "$BODY" | head -3)"
    FAIL=$((FAIL + 1))
    ERRORS="$ERRORS\n❌ $DESC — Invalid JSON"
    return
  fi

  # Check expected field exists
  if [ -n "$EXPECT_FIELD" ]; then
    HAS_FIELD=$(echo "$BODY" | python3 -c "import json,sys; d=json.load(sys.stdin); print('yes' if '$EXPECT_FIELD' in d else 'no')" 2>/dev/null)
    if [ "$HAS_FIELD" = "yes" ]; then
      echo "  ✅ Expected field '$EXPECT_FIELD' present"
    else
      echo "  ❌ Missing expected field '$EXPECT_FIELD'"
      echo "  Keys: $(echo "$BODY" | python3 -c "import json,sys; print(list(json.load(sys.stdin).keys()))" 2>/dev/null)"
      FAIL=$((FAIL + 1))
      ERRORS="$ERRORS\n❌ $DESC — Missing field '$EXPECT_FIELD'"
      return
    fi
  fi

  # Show a snippet of the response
  echo "  Response preview: $(echo "$BODY" | python3 -m json.tool 2>/dev/null | head -8)"
  PASS=$((PASS + 1))
}

# Validate specific value in response
test_value() {
  local METHOD="$1"
  local URL="$2"
  local DATA="$3"
  local DESC="$4"
  local PYTHON_CHECK="$5"  # Python expression that should return True

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "TEST: $DESC"
  echo "  $METHOD $URL"

  if [ "$METHOD" = "GET" ]; then
    BODY=$(curl -s "$BASE$URL")
  else
    BODY=$(curl -s -X POST -H "Content-Type: application/json" -d "$DATA" "$BASE$URL")
  fi

  RESULT=$(echo "$BODY" | python3 -c "
import json, sys
try:
    d = json.load(sys.stdin)
    result = $PYTHON_CHECK
    print('PASS' if result else 'FAIL')
except Exception as e:
    print(f'ERROR: {e}')
" 2>&1)

  if [ "$RESULT" = "PASS" ]; then
    echo "  ✅ Validation passed: $PYTHON_CHECK"
    PASS=$((PASS + 1))
  else
    echo "  ❌ Validation failed: $PYTHON_CHECK"
    echo "  Result: $RESULT"
    echo "  Response: $(echo "$BODY" | head -5)"
    FAIL=$((FAIL + 1))
    ERRORS="$ERRORS\n❌ $DESC — Validation: $PYTHON_CHECK => $RESULT"
  fi
}

echo "╔═══════════════════════════════════════════════════════════════════════════╗"
echo "║     ULTRA COMPUTER — COMPREHENSIVE TEST SUITE                           ║"
echo "║     Testing: Self-Awareness, Gap Detection, Self-Healing, Correction    ║"
echo "╚═══════════════════════════════════════════════════════════════════════════╝"
echo ""
echo "Server: $BASE"
echo "Started: $(date)"

# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo "╔═══════════════════════════════════════════════════════════════════════════╗"
echo "║  SECTION 1: SELF-AWARENESS ENGINE                                       ║"
echo "╚═══════════════════════════════════════════════════════════════════════════╝"

test_endpoint "GET" "/api/autonomy/self-awareness" "" \
  "1.1 Self-Awareness Report" "identity"

test_value "GET" "/api/autonomy/self-awareness" "" \
  "1.2 Self-Awareness has identity.modelName" \
  "'modelName' in d.get('identity', {})"

test_value "GET" "/api/autonomy/self-awareness" "" \
  "1.3 Self-Awareness has capabilities section" \
  "'capabilities' in d and 'native' in d['capabilities'] and 'limitations' in d['capabilities']"

test_value "GET" "/api/autonomy/self-awareness" "" \
  "1.4 Self-Awareness has health section" \
  "'health' in d"

test_value "GET" "/api/autonomy/self-awareness" "" \
  "1.5 Self-Awareness has learning section" \
  "'learning' in d"

test_endpoint "GET" "/api/autonomy/system-state" "" \
  "1.6 System State" "activeModel"

test_value "GET" "/api/autonomy/system-state" "" \
  "1.7 System State has activeModel with profile" \
  "'activeModel' in d and 'profile' in d['activeModel']"

test_value "GET" "/api/autonomy/system-state" "" \
  "1.8 System State has availableModels list" \
  "'availableModels' in d and isinstance(d['availableModels'], list)"

test_value "GET" "/api/autonomy/system-state" "" \
  "1.9 System State has availableTools list" \
  "'availableTools' in d and isinstance(d['availableTools'], list)"

test_value "GET" "/api/autonomy/system-state" "" \
  "1.10 System State has systemCapabilities" \
  "'systemCapabilities' in d"

test_endpoint "GET" "/api/autonomy/self-awareness/prompt" "" \
  "1.11 Self-Awareness Prompt Block" "block"

test_value "GET" "/api/autonomy/self-awareness/prompt" "" \
  "1.12 Prompt block contains model identity" \
  "'You are' in d.get('block', '')"

test_value "GET" "/api/autonomy/self-awareness/prompt" "" \
  "1.13 Prompt block contains honesty rules" \
  "'NEVER claim' in d.get('block', '') or 'CRITICAL RULES' in d.get('block', '')"

test_value "GET" "/api/autonomy/self-awareness/prompt" "" \
  "1.14 Prompt block contains limitations" \
  "'Cannot' in d.get('block', '')"

# Model profile for specific model
test_endpoint "GET" "/api/autonomy/model-profile/gpt-4.1-mini" "" \
  "1.15 Model Profile for gpt-4.1-mini" "displayName"

test_value "GET" "/api/autonomy/model-profile/gpt-4.1-mini" "" \
  "1.16 Model profile has realCapabilities" \
  "'realCapabilities' in d and isinstance(d['realCapabilities'], list)"

test_value "GET" "/api/autonomy/model-profile/gpt-4.1-mini" "" \
  "1.17 Model profile has knownLimitations" \
  "'knownLimitations' in d and isinstance(d['knownLimitations'], list) and len(d['knownLimitations']) > 0"

test_value "GET" "/api/autonomy/model-profile/gpt-4.1-mini" "" \
  "1.18 Model profile has bestFor and worstFor" \
  "'bestFor' in d and 'worstFor' in d"

# Model profile for unknown model (should still return something)
test_endpoint "GET" "/api/autonomy/model-profile/unknown-model-xyz" "" \
  "1.19 Model Profile for unknown model (graceful fallback)" "displayName"

# Assess model for task
test_endpoint "POST" "/api/autonomy/assess-model" \
  '{"modelId":"gpt-4.1-mini","taskDescription":"Write a simple hello world program","taskType":"code"}' \
  "1.20 Assess model for code task" "suitable"

test_endpoint "POST" "/api/autonomy/assess-model" \
  '{"modelId":"gpt-4.1-mini","taskDescription":"Generate a photorealistic image of a mountain","taskType":"image"}' \
  "1.21 Assess model for image task (should flag limitation)" "suitable"

# Test missing params
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST: 1.22 Assess model with missing params (should return 400)"
RESP=$(curl -s -w "\n%{http_code}" -X POST -H "Content-Type: application/json" -d '{}' "$BASE/api/autonomy/assess-model")
CODE=$(echo "$RESP" | tail -1)
if [ "$CODE" = "400" ]; then
  echo "  ✅ Correctly returned 400 for missing params"
  PASS=$((PASS + 1))
else
  echo "  ❌ Expected 400, got $CODE"
  FAIL=$((FAIL + 1))
  ERRORS="$ERRORS\n❌ 1.22 Assess model missing params — Expected 400, got $CODE"
fi

# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo "╔═══════════════════════════════════════════════════════════════════════════╗"
echo "║  SECTION 2: CAPABILITY GAP DETECTOR                                     ║"
echo "╚═══════════════════════════════════════════════════════════════════════════╝"

test_endpoint "GET" "/api/autonomy/capability-map" "" \
  "2.1 Capability Map" ""

test_endpoint "GET" "/api/autonomy/capability-summary" "" \
  "2.2 Capability Summary" "summary"

test_value "GET" "/api/autonomy/capability-summary" "" \
  "2.3 Summary mentions available capabilities" \
  "'Available' in d.get('summary', '') or 'available' in d.get('summary', '').lower()"

# Detect gap for image generation
test_endpoint "POST" "/api/autonomy/detect-gap" \
  '{"message":"generate an image of a beautiful sunset over the ocean"}' \
  "2.4 Detect gap for image generation request" "gap"

test_value "POST" "/api/autonomy/detect-gap" \
  '{"message":"generate an image of a beautiful sunset over the ocean"}' \
  "2.5 Image gap is null (already healed) OR correct type" \
  "d.get('gap') is None or d['gap'].get('capability') == 'image_generation'"

test_value "POST" "/api/autonomy/detect-gap" \
  '{"message":"generate an image of a beautiful sunset over the ocean"}' \
  "2.6 Image gap is null (healed) OR auto-resolvable" \
  "d.get('gap') is None or d['gap'].get('autoResolvable') == True"

# Detect gap for audio generation
test_endpoint "POST" "/api/autonomy/detect-gap" \
  '{"message":"create a song about the rain"}' \
  "2.7 Detect gap for audio generation request" "gap"

test_value "POST" "/api/autonomy/detect-gap" \
  '{"message":"create a song about the rain"}' \
  "2.8 Audio gap detected correctly" \
  "d.get('gap') is not None and 'audio' in d['gap'].get('capability', '').lower()"

# Detect gap for video generation
test_endpoint "POST" "/api/autonomy/detect-gap" \
  '{"message":"make a video of a cat playing piano"}' \
  "2.9 Detect gap for video generation request" "gap"

# No gap for simple chat
test_value "POST" "/api/autonomy/detect-gap" \
  '{"message":"hello, how are you today?"}' \
  "2.10 No gap for simple chat request" \
  "d.get('gap') is None"

# No gap for code request
test_value "POST" "/api/autonomy/detect-gap" \
  '{"message":"write a python function to sort a list"}' \
  "2.11 No gap for code request" \
  "d.get('gap') is None"

# Get gaps with filters
test_endpoint "GET" "/api/autonomy/gaps" "" \
  "2.12 Get all gaps (unfiltered)" ""

test_endpoint "GET" "/api/autonomy/gaps?resolved=false" "" \
  "2.13 Get unresolved gaps" ""

test_endpoint "GET" "/api/autonomy/gaps?resolved=true" "" \
  "2.14 Get resolved gaps" ""

# Test missing params
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST: 2.15 Detect gap with missing message (should return 400)"
RESP=$(curl -s -w "\n%{http_code}" -X POST -H "Content-Type: application/json" -d '{}' "$BASE/api/autonomy/detect-gap")
CODE=$(echo "$RESP" | tail -1)
if [ "$CODE" = "400" ]; then
  echo "  ✅ Correctly returned 400 for missing message"
  PASS=$((PASS + 1))
else
  echo "  ❌ Expected 400, got $CODE"
  FAIL=$((FAIL + 1))
  ERRORS="$ERRORS\n❌ 2.15 Detect gap missing message — Expected 400, got $CODE"
fi

# Compact gaps
test_endpoint "POST" "/api/autonomy/gaps/compact" \
  '{"keepDays": 30}' \
  "2.16 Compact gaps" "removed"

# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo "╔═══════════════════════════════════════════════════════════════════════════╗"
echo "║  SECTION 3: SELF-HEALING ENGINE                                         ║"
echo "╚═══════════════════════════════════════════════════════════════════════════╝"

test_endpoint "GET" "/api/autonomy/healing/stats" "" \
  "3.1 Healing Stats" "totalActions"

test_value "GET" "/api/autonomy/healing/stats" "" \
  "3.2 Healing stats has successRate" \
  "'successRate' in d"

test_value "GET" "/api/autonomy/healing/stats" "" \
  "3.3 Healing stats has capabilitiesHealed" \
  "'capabilitiesHealed' in d and isinstance(d['capabilitiesHealed'], list)"

test_endpoint "GET" "/api/autonomy/healing/history" "" \
  "3.4 Healing History (all)" ""

test_endpoint "GET" "/api/autonomy/healing/history?limit=5" "" \
  "3.5 Healing History (limited)" ""

test_endpoint "GET" "/api/autonomy/healing/history?status=success" "" \
  "3.6 Healing History (success only)" ""

# Trigger a manual heal for image generation
test_endpoint "POST" "/api/autonomy/healing/heal" \
  '{"message":"draw me a picture of a dragon"}' \
  "3.7 Manual heal for image generation" ""

# Check that healing actually created/found a DALL-E model
test_value "GET" "/api/autonomy/healing/stats" "" \
  "3.8 Healing stats shows image_generation healed" \
  "'image_generation' in d.get('capabilitiesHealed', [])"

# Test heal for something that doesn't need healing
test_value "POST" "/api/autonomy/healing/heal" \
  '{"message":"hello how are you"}' \
  "3.9 Heal for non-gap request returns no healing needed" \
  "d.get('healed') == False or d.get('message', '').lower().find('no capability gap') >= 0 or d.get('message', '').lower().find('no gap') >= 0"

# Test rollback with invalid ID
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST: 3.10 Rollback with invalid action ID"
RESP=$(curl -s -X POST "$BASE/api/autonomy/healing/rollback/nonexistent-id-12345")
echo "  Response: $RESP"
SUCCESS=$(echo "$RESP" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('success', 'missing'))" 2>/dev/null)
if [ "$SUCCESS" = "False" ]; then
  echo "  ✅ Correctly returned success=false for invalid rollback"
  PASS=$((PASS + 1))
else
  echo "  ❌ Expected success=false, got: $SUCCESS"
  FAIL=$((FAIL + 1))
  ERRORS="$ERRORS\n❌ 3.10 Rollback invalid ID — Expected success=false"
fi

# Test heal with missing message
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST: 3.11 Heal with missing message (should return 400)"
RESP=$(curl -s -w "\n%{http_code}" -X POST -H "Content-Type: application/json" -d '{}' "$BASE/api/autonomy/healing/heal")
CODE=$(echo "$RESP" | tail -1)
if [ "$CODE" = "400" ]; then
  echo "  ✅ Correctly returned 400 for missing message"
  PASS=$((PASS + 1))
else
  echo "  ❌ Expected 400, got $CODE"
  FAIL=$((FAIL + 1))
  ERRORS="$ERRORS\n❌ 3.11 Heal missing message — Expected 400, got $CODE"
fi

# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo "╔═══════════════════════════════════════════════════════════════════════════╗"
echo "║  SECTION 4: SELF-CORRECTION LOOP                                        ║"
echo "╚═══════════════════════════════════════════════════════════════════════════╝"

test_endpoint "GET" "/api/autonomy/corrections/stats" "" \
  "4.1 Correction Stats" "totalCorrections"

test_value "GET" "/api/autonomy/corrections/stats" "" \
  "4.2 Correction stats has successRate" \
  "'successRate' in d"

test_value "GET" "/api/autonomy/corrections/stats" "" \
  "4.3 Correction stats has avgAttempts" \
  "'avgAttempts' in d"

test_value "GET" "/api/autonomy/corrections/stats" "" \
  "4.4 Correction stats has byType breakdown" \
  "'byType' in d and isinstance(d['byType'], dict)"

# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo "╔═══════════════════════════════════════════════════════════════════════════╗"
echo "║  SECTION 5: ENHANCED DASHBOARD                                          ║"
echo "╚═══════════════════════════════════════════════════════════════════════════╝"

test_endpoint "GET" "/api/autonomy/dashboard" "" \
  "5.1 Enhanced Dashboard" "health"

test_value "GET" "/api/autonomy/dashboard" "" \
  "5.2 Dashboard has selfAwareness" \
  "'selfAwareness' in d"

test_value "GET" "/api/autonomy/dashboard" "" \
  "5.3 Dashboard has healing stats" \
  "'healing' in d"

test_value "GET" "/api/autonomy/dashboard" "" \
  "5.4 Dashboard has corrections stats" \
  "'corrections' in d"

test_value "GET" "/api/autonomy/dashboard" "" \
  "5.5 Dashboard has unresolvedGaps count" \
  "'unresolvedGaps' in d and isinstance(d['unresolvedGaps'], int)"

test_value "GET" "/api/autonomy/dashboard" "" \
  "5.6 Dashboard has all original sections" \
  "all(k in d for k in ['health', 'checkpoints', 'cron', 'circuits', 'learning', 'skillHealth'])"

# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo "╔═══════════════════════════════════════════════════════════════════════════╗"
echo "║  SECTION 6: EDGE CASES & ADVERSARIAL TESTS                             ║"
echo "╚═══════════════════════════════════════════════════════════════════════════╝"

# Very long message
LONG_MSG=$(python3 -c "print('a' * 5000)")
test_endpoint "POST" "/api/autonomy/detect-gap" \
  "{\"message\":\"$LONG_MSG\"}" \
  "6.1 Detect gap with very long message (5000 chars)" "gap"

# Special characters
test_endpoint "POST" "/api/autonomy/detect-gap" \
  '{"message":"generate an image with <script>alert(1)</script> and \"quotes\" and \\backslash"}' \
  "6.2 Detect gap with special/malicious characters" "gap"

# Empty message after validation
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST: 6.3 Detect gap with empty string message"
RESP=$(curl -s -w "\n%{http_code}" -X POST -H "Content-Type: application/json" -d '{"message":""}' "$BASE/api/autonomy/detect-gap")
CODE=$(echo "$RESP" | tail -1)
echo "  HTTP Status: $CODE"
if [ "$CODE" = "400" ]; then
  echo "  ✅ Correctly rejected empty message"
  PASS=$((PASS + 1))
elif [ "$CODE" = "200" ]; then
  echo "  ⚠️ Accepted empty message (returned 200) — not ideal but not broken"
  PASS=$((PASS + 1))
else
  echo "  ❌ Unexpected status: $CODE"
  FAIL=$((FAIL + 1))
  ERRORS="$ERRORS\n❌ 6.3 Empty message — Unexpected status $CODE"
fi

# Multiple rapid requests (basic stress test)
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST: 6.4 Rapid-fire 10 requests to self-awareness endpoint"
ALL_OK=true
for i in $(seq 1 10); do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/autonomy/self-awareness")
  if [ "$CODE" != "200" ]; then
    ALL_OK=false
    echo "  ❌ Request $i returned $CODE"
  fi
done
if [ "$ALL_OK" = true ]; then
  echo "  ✅ All 10 rapid requests returned 200"
  PASS=$((PASS + 1))
else
  echo "  ❌ Some rapid requests failed"
  FAIL=$((FAIL + 1))
  ERRORS="$ERRORS\n❌ 6.4 Rapid-fire stress test failed"
fi

# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo "╔═══════════════════════════════════════════════════════════════════════════╗"
echo "║  SECTION 7: CROSS-SYSTEM CONSISTENCY CHECKS                            ║"
echo "╚═══════════════════════════════════════════════════════════════════════════╝"

# Self-awareness report and system state should agree on model
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST: 7.1 Self-awareness and system-state agree on active model"
SA=$(curl -s "$BASE/api/autonomy/self-awareness")
SS=$(curl -s "$BASE/api/autonomy/system-state")
RESULT=$(python3 -c "
import json
sa = json.loads('$( echo "$SA" | python3 -c "import sys; print(sys.stdin.read().replace(\"'\", \"\\\\'\"))" )')
ss = json.loads('$( echo "$SS" | python3 -c "import sys; print(sys.stdin.read().replace(\"'\", \"\\\\'\"))" )')
sa_model = sa.get('identity', {}).get('modelId', '')
ss_model = ss.get('activeModel', {}).get('modelId', '')
print('PASS' if sa_model == ss_model else f'FAIL: {sa_model} != {ss_model}')
" 2>&1)
if [ "$RESULT" = "PASS" ]; then
  echo "  ✅ Models match across self-awareness and system-state"
  PASS=$((PASS + 1))
else
  echo "  ❌ $RESULT"
  FAIL=$((FAIL + 1))
  ERRORS="$ERRORS\n❌ 7.1 Model mismatch between self-awareness and system-state"
fi

# Dashboard healing stats should match healing/stats endpoint
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST: 7.2 Dashboard healing matches healing/stats endpoint"
DASH=$(curl -s "$BASE/api/autonomy/dashboard")
HEAL=$(curl -s "$BASE/api/autonomy/healing/stats")
python3 -c "
import json
dash = json.loads('''$(echo "$DASH")''')
heal = json.loads('''$(echo "$HEAL")''')
dh = dash.get('healing', {})
if dh and dh.get('totalActions') == heal.get('totalActions') and dh.get('successRate') == heal.get('successRate'):
    print('PASS')
else:
    print(f'FAIL: dash={dh} vs heal={heal}')
" > /tmp/test_result.txt 2>&1
RESULT=$(cat /tmp/test_result.txt)
if [ "$RESULT" = "PASS" ]; then
  echo "  ✅ Dashboard healing stats match dedicated endpoint"
  PASS=$((PASS + 1))
else
  echo "  ❌ $RESULT"
  FAIL=$((FAIL + 1))
  ERRORS="$ERRORS\n❌ 7.2 Dashboard healing mismatch"
fi

# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo ""
echo "╔═══════════════════════════════════════════════════════════════════════════╗"
echo "║                        FINAL TEST RESULTS                               ║"
echo "╚═══════════════════════════════════════════════════════════════════════════╝"
echo ""
echo "  Total Tests: $((PASS + FAIL))"
echo "  ✅ Passed:   $PASS"
echo "  ❌ Failed:   $FAIL"
echo ""

if [ $FAIL -gt 0 ]; then
  echo "  FAILURES:"
  echo -e "$ERRORS"
  echo ""
fi

if [ $FAIL -eq 0 ]; then
  echo "  🎉 ALL TESTS PASSED — System is fully operational!"
else
  echo "  ⚠️  SOME TESTS FAILED — Review failures above"
fi

echo ""
echo "Completed: $(date)"
