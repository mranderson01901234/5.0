# Verification Guide: Context Preprocessing & Modular Prompts

This guide helps verify that the context preprocessing and modular prompt architecture works correctly without breaking any existing functionality.

## Quick Start

### 1. Run Unit Tests

```bash
cd apps/llm-gateway
pnpm test
```

This will run tests for:
- `ContextPreprocessor.test.ts` - Tests context transformation
- `PromptBuilder.test.ts` - Tests modular prompt building
- `routes.test.ts` - Existing route tests (should still pass)

### 2. Manual Verification Checklist

Run through these scenarios in order:

#### ✅ Test 1: Basic Chat (No Context)
**Goal:** Verify basic chat still works

```bash
# Start services
cd apps/llm-gateway && pnpm dev &
cd apps/memory-service && pnpm dev &

# Test basic chat
curl -N http://localhost:8787/v1/chat/stream \
  -H "Content-Type: application/json" \
  -d '{
    "thread_id": "test-thread-basic",
    "messages": [{"role": "user", "content": "Hello, how are you?"}]
  }'
```

**Expected:**
- ✅ Response streams normally
- ✅ No errors in logs
- ✅ Response is conversational

---

#### ✅ Test 2: Memory Context
**Goal:** Verify memory context is preprocessed correctly

1. First, create some memory:
```bash
# Send messages to create memory
curl -X POST http://localhost:3001/v1/events/message \
  -H "Content-Type: application/json" \
  -H "x-user-id: test-user" \
  -d '{
    "userId": "test-user",
    "threadId": "test-thread-memory",
    "msgId": "msg-1",
    "role": "user",
    "content": "I am studying React hooks",
    "tokens": {"input": 10, "output": 20}
  }'

# Trigger memory review (or wait for auto-trigger)
curl -X POST http://localhost:3001/v1/audit/review \
  -H "Content-Type: application/json" \
  -H "x-user-id: test-user" \
  -d '{
    "userId": "test-user",
    "threadId": "test-thread-memory"
  }'
```

2. Then chat in the same thread:
```bash
curl -N http://localhost:8787/v1/chat/stream \
  -H "Content-Type: application/json" \
  -d '{
    "thread_id": "test-thread-memory",
    "messages": [
      {"role": "user", "content": "What was I studying?"}
    ]
  }'
```

**Expected:**
- ✅ Response references "you mentioned" or similar natural phrasing
- ✅ NO `[Memory]` markers in the response
- ✅ Memory context is naturally integrated
- ✅ Check logs: should see "preprocessed" in context messages

**Check logs for:**
```
[llm-gateway] Hybrid RAG results added to context (preprocessed)
OR
[llm-gateway] Memory recall successful (check response quality)
```

---

#### ✅ Test 3: Ingestion Context
**Goal:** Verify ingestion context is preprocessed

1. Trigger ingestion (if you have ingestion setup):
   - Ingest some content via your ingestion pipeline
   - Make sure it gets stored

2. Chat about something related:
```bash
curl -N http://localhost:8787/v1/chat/stream \
  -H "Content-Type: application/json" \
  -d '{
    "thread_id": "test-thread-ingestion",
    "messages": [{"role": "user", "content": "Tell me about React hooks"}]
  }'
```

**Expected:**
- ✅ If ingestion context is available, it should be naturally integrated
- ✅ NO "Relevant recent information:" headers in LLM prompts
- ✅ Information flows naturally in response

**Check logs:**
```
[llm-gateway] ingestion_context event received
[llm-gateway] Ingested context retrieved - will be added to LLM context
```

---

#### ✅ Test 4: Conversation History
**Goal:** Verify conversation history preprocessing

1. Chat in multiple threads with same user
2. Then chat in original thread:
```bash
curl -N http://localhost:8787/v1/chat/stream \
  -H "Content-Type: application/json" \
  -d '{
    "thread_id": "test-thread-history",
    "messages": [{"role": "user", "content": "What did we discuss earlier?"}]
  }'
```

**Expected:**
- ✅ Response references previous conversations naturally
- ✅ NO `[Conversation N]:` markers
- ✅ Natural phrasing like "In a previous conversation..."

---

#### ✅ Test 5: Hybrid RAG
**Goal:** Verify Hybrid RAG context preprocessing

**Prerequisites:** Hybrid RAG must be enabled in config

```bash
curl -N http://localhost:8787/v1/chat/stream \
  -H "Content-Type: application/json" \
  -d '{
    "thread_id": "test-thread-rag",
    "messages": [{"role": "user", "content": "What do you know about me?"}]
  }'
```

**Expected:**
- ✅ Hybrid RAG results are preprocessed
- ✅ NO `[memory]`, `[web]`, `[vector]` markers in context
- ✅ Natural narrative format

**Check logs:**
```
[llm-gateway] Hybrid RAG results added to context (preprocessed)
```

---

#### ✅ Test 6: Web Search (Should be Unchanged)
**Goal:** Verify web search still works independently

```bash
curl -N http://localhost:8787/v1/chat/stream \
  -H "Content-Type: application/json" \
  -d '{
    "thread_id": "test-thread-search",
    "messages": [{"role": "user", "content": "What are the latest developments in AI?"}]
  }'
```

**Expected:**
- ✅ Web search triggers (if enabled)
- ✅ `research_summary` event streams
- ✅ Search results are handled by composeSearchResponse (separate system, unchanged)
- ✅ Main LLM response follows naturally

---

### 3. Integration Test Script

Create a simple integration test:

```bash
# Save as: scripts/test_context_preprocessing.mjs

import { fetch } from 'undici';

const BASE_URL = process.env.GATEWAY_URL || 'http://localhost:8787';
const USER_ID = 'test-user-context';

async function testContextPreprocessing() {
  console.log('🧪 Testing Context Preprocessing...\n');

  // Test 1: Basic chat
  console.log('Test 1: Basic chat (no context)');
  try {
    const response = await fetch(`${BASE_URL}/v1/chat/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        thread_id: 'test-basic',
        messages: [{ role: 'user', content: 'Hello' }],
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    // Read SSE stream
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let gotDelta = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.includes('event: delta') || line.includes('event: token')) {
          gotDelta = true;
          break;
        }
      }
      if (gotDelta) break;
    }

    console.log(gotDelta ? '✅ Basic chat works' : '❌ No response received');
  } catch (error) {
    console.error('❌ Basic chat failed:', error.message);
  }

  // Test 2: Check logs for preprocessing
  console.log('\nTest 2: Check logs for preprocessing markers');
  console.log('⚠️  Manually check logs for:');
  console.log('   - "preprocessed" in context messages');
  console.log('   - No "[Memory]", "[Conversation]", "Relevant context:" in system messages');
  console.log('   - Natural narrative format in context');

  console.log('\n✅ Verification complete!');
}

testContextPreprocessing().catch(console.error);
```

Run it:
```bash
node scripts/test_context_preprocessing.mjs
```

---

## What to Look For

### ✅ Success Indicators

1. **Natural Responses**
   - Responses should reference context naturally ("you mentioned", "earlier", "in a previous conversation")
   - No structured markers like `[Memory]` or headers like "Relevant context:"

2. **Logs Show Preprocessing**
   - Look for "preprocessed" in log messages
   - Context messages should be natural narrative, not structured blocks

3. **No Breaking Changes**
   - All existing functionality works
   - No errors in logs
   - Response quality is maintained or improved

### ❌ Red Flags

1. **Errors in Logs**
   - Import errors for `ContextPreprocessor` or `PromptBuilder`
   - Preprocessing failures
   - Missing context

2. **Structured Markers in Responses**
   - If you see `[Memory]`, `[Conversation N]:`, or "Relevant context:" in responses, preprocessing isn't working

3. **Missing Context**
   - If memory/context that should be there isn't, check preprocessing isn't filtering it out incorrectly

---

## Debugging

### Check System Messages

Add temporary logging to see what system messages look like:

```typescript
// In routes.ts, after buildMerged():
console.log('[DEBUG] System messages:', JSON.stringify(systemMessages, null, 2));
```

Look for:
- ✅ Natural narrative format
- ✅ No `[Memory]`, `[Conversation]` markers
- ✅ Base prompt present
- ✅ Context integrated naturally

### Check ContextTrimmer Output

Temporarily log what ContextTrimmer produces:

```typescript
// In ContextTrimmer.ts, before push:
logger.debug({ content: preprocessedMemoryText.substring(0, 100) }, 'Preprocessed context');
```

---

## Performance Check

The preprocessing should be fast. Check:

```bash
# Time a request
time curl -N http://localhost:8787/v1/chat/stream \
  -H "Content-Type: application/json" \
  -d '{"thread_id": "test", "messages": [{"role": "user", "content": "test"}]}'
```

**Expected:** No noticeable latency increase (< 50ms overhead)

---

## Summary

| Test | What It Checks | Pass Criteria |
|------|---------------|---------------|
| Unit Tests | Code logic | All tests pass |
| Basic Chat | No regressions | Works normally |
| Memory Context | Memory preprocessing | Natural phrasing, no markers |
| Ingestion | Ingestion preprocessing | Natural integration |
| Conversation History | History preprocessing | Natural references |
| Hybrid RAG | RAG preprocessing | Natural narrative |
| Web Search | Independence | Unchanged behavior |

If all tests pass, the implementation is verified! ✅

