#!/bin/bash
# End-to-end test: ask Ultra Computer to generate an image of a dog

BASE="http://localhost:5000"

echo "=== Creating conversation ==="
CONV_ID=$(curl -s -X POST -H "Content-Type: application/json" \
  -d '{"title":"Dog Image E2E Test"}' \
  "$BASE/api/conversations" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "Conversation ID: $CONV_ID"

echo ""
echo "=== Sending message: generate image of a dog ==="
curl -s -X POST -H "Content-Type: application/json" \
  -d "{\"conversationId\":\"$CONV_ID\",\"content\":\"generate image of a dog only the dog and nothing more\",\"role\":\"user\"}" \
  "$BASE/api/conversations/$CONV_ID/messages" > /dev/null

echo "Message sent. Waiting for orchestrator to process..."
echo ""

# Poll for response (up to 120 seconds)
for i in $(seq 1 24); do
  sleep 5
  MSG_COUNT=$(curl -s "$BASE/api/conversations/$CONV_ID/messages" | python3 -c "import sys,json; msgs=json.load(sys.stdin); print(len(msgs))")
  echo "  [${i}x5s] Messages: $MSG_COUNT"
  
  if [ "$MSG_COUNT" -ge 2 ]; then
    echo ""
    echo "=== Response received! ==="
    curl -s "$BASE/api/conversations/$CONV_ID/messages" | python3 -c "
import sys, json
msgs = json.load(sys.stdin)
for m in msgs:
    role = m.get('role','?')
    content = m.get('content','')
    tool_calls = m.get('toolCalls','')
    print(f'--- [{role}] ---')
    print(content[:500])
    if tool_calls:
        print(f'  TOOL CALLS: {str(tool_calls)[:300]}')
    print()
"
    break
  fi
done

echo ""
echo "=== Checking for generated images ==="
ls -la sandbox/images/ 2>/dev/null || echo "No images directory"

echo ""
echo "=== Server logs (image-related) ==="
grep -i "imageGenTool\|generate_image\|pollinations\|Trying provider" /tmp/ultra-server.log 2>/dev/null | tail -20
