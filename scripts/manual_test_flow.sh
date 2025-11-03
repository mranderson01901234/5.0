#!/bin/bash

# Manual test flow for research system
# Run this after starting services

set -e

MEMORY_SERVICE="http://localhost:3001"
USER_ID="test-user-$(date +%s)"
THREAD_ID="test-thread-$(date +%s)"

echo "🧪 Manual Research System Test"
echo "User ID: $USER_ID"
echo "Thread ID: $THREAD_ID"
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}Step 1: Send messages to trigger memory review...${NC}"

for i in {1..6}; do
  role="user"
  if [ $((i % 2)) -eq 0 ]; then
    role="assistant"
  fi
  
  content="Test message $i about TypeScript and React developments"
  
  echo "  Sending message $i ($role)..."
  curl -s -X POST "$MEMORY_SERVICE/v1/events/message" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer test-token" \
    -d "{
      \"userId\": \"$USER_ID\",
      \"threadId\": \"$THREAD_ID\",
      \"msgId\": \"msg-$i\",
      \"role\": \"$role\",
      \"content\": \"$content\",
      \"tokens\": {\"input\": 10, \"output\": 5},
      \"timestamp\": $(date +%s000)
    }" > /dev/null
  
  sleep 0.2
done

echo -e "${GREEN}✓ Messages sent${NC}\n"

echo -e "${BLUE}Step 2: Wait for audit and research to process...${NC}"
sleep 3

echo -e "${BLUE}Step 3: Check Redis for capsule...${NC}"
echo "  Run: redis-cli KEYS factPack:$THREAD_ID:*"
echo ""

echo -e "${BLUE}Step 4: Check memory-service logs for:${NC}"
echo "  - 'Research job enqueued'"
echo "  - 'Processing research job'"
echo "  - 'Starting research pipeline'"
echo "  - 'Capsule built'"
echo ""

echo -e "${GREEN}Test complete! Check logs and Redis.${NC}"

