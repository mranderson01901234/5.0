# Testing Guide: Hidden Research System

## Prerequisites

1. **Redis Setup**
   ```bash
   # Install Redis (if not already installed)
   # macOS: brew install redis
   # Linux: sudo apt-get install redis-server
   # Docker: docker run -d -p 6379:6379 redis:alpine
   
   # Start Redis
   redis-server
   # Or with Docker: docker start <redis-container>
   ```

2. **Environment Variables**
   ```bash
   # Copy .env.example or create .env with:
   RESEARCH_SIDECAR_ENABLED=true
   FEATURE_MEMORY_REVIEW_TRIGGER=true
   FEATURE_RESEARCH_INJECTION=true
   FEATURE_NEWSDATA_FALLBACK=true
   BRAVE_API_KEY="your-brave-api-key"
   NEWSDATA_API_KEY="your-newsdata-api-key"  # Optional
   REDIS_URL="redis://localhost:6379"
   ```

3. **Install Dependencies**
   ```bash
   pnpm install
   ```

## Quick Smoke Test

Before full testing, run the smoke test to verify components:

```bash
node scripts/smoke_test_research.mjs
```

This checks:
- Config module loading
- Topic extraction
- Topic tracker
- Cache key generation
- Redis connection (if available)
- Job queue extension
- Type definitions

## Quick Manual Test

### 1. Start Services

Terminal 1 - Memory Service:
```bash
cd apps/memory-service
pnpm dev
# Should see: "Research sidecar enabled and configured"
# Should see: "Redis connected"
```

Terminal 2 - LLM Gateway:
```bash
cd apps/llm-gateway
pnpm dev
```

Terminal 3 - Web App (optional, for full E2E):
```bash
cd apps/web
pnpm dev
```

### 2. Trigger Memory Review (which triggers research)

Memory review triggers when:
- Message count ≥ 6
- Token count ≥ 1500
- OR 3 minutes elapsed

**Test via API:**
```bash
# Send 6+ messages to trigger audit (and potentially research)
curl -X POST http://localhost:3001/v1/events/message \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "userId": "test-user",
    "threadId": "test-thread-1",
    "msgId": "msg-1",
    "role": "user",
    "content": "What are the latest developments in TypeScript?",
    "tokens": {"input": 10, "output": 0},
    "timestamp": '$(date +%s000)'
  }'

# Repeat 6 times (change msgId and content each time)
```

### 3. Check Logs

**Memory Service logs should show:**
```
Processing audit
Topic extracted
Research job enqueued
Processing research job
Starting research pipeline
Brave fetch complete
Capsule built
Research capsule injected (if within window)
```

**Check Redis for capsules:**
```bash
redis-cli
> KEYS factPack:*
> GET factPack:test-thread-1:<batch-id>
```

### 4. Test Early-Window Injection

Start a chat stream and check for `research_capsule` events:
```bash
curl -N http://localhost:8787/v1/chat/stream \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "thread_id": "test-thread-1",
    "messages": [{"role": "user", "content": "Tell me about TypeScript"}]
  }'

# Look for: event: research_capsule
```

## Unit Tests

Run existing tests:
```bash
cd apps/memory-service
pnpm test
```

Create test files as needed (see test examples below).

## Integration Test Script

See `scripts/test_research_integration.mjs` (create below).

## Test Scenarios

### Scenario 1: Basic Research Flow
1. Send 6+ messages to same thread
2. Verify audit triggers
3. Verify research job enqueued
4. Verify capsule created in Redis
5. Verify topic marked as verified

### Scenario 2: Cache Hit
1. Trigger research (creates cache)
2. Trigger research again with same topic
3. Verify cache hit (no API calls)

### Scenario 3: Early-Window Injection
1. Trigger research before chat request
2. Start chat stream immediately
3. Verify capsule injected within 2-3s window

### Scenario 4: Graceful Degradation
1. Stop Redis
2. Verify system logs warning but continues
3. Verify research disabled gracefully

### Scenario 5: Low-Value Fallback
1. Use topic that returns <3 hosts from Brave
2. Verify NewsData fallback triggers (if enabled)
3. Verify negative cache stored

## Monitoring

### Check Queue Metrics
```bash
curl http://localhost:3001/metrics
# Look for queue depth, job counts
```

### Check Redis Keys
```bash
redis-cli
> KEYS CAPS:v2:*
> KEYS factPack:*
> TTL <key>  # Check TTL
```

### Check Topic Tracker
Add temporary endpoint to inspect topic tracker state:
```typescript
app.get('/v1/debug/topics', async (req, reply) => {
  return topicTracker.getMetrics();
});
```

