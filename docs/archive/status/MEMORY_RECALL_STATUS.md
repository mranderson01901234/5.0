# Memory Recall System Status Report

**Date**: 2025-11-01  
**Question**: Can the LLM recall previous conversation knowledge or memory?

---

## Executive Summary

**ANSWER: PARTIALLY FUNCTIONAL** ⚠️

The memory recall infrastructure is **built and connected**, but has **critical operational gaps** that prevent it from working as designed:

- ✅ **Architecture exists**: Recall system is implemented and connected
- ✅ **Code is present**: Memory service, recall endpoints, context injection
- ⚠️ **Empty databases**: Current DB files have no data
- ⚠️ **Mock data in audits**: Memories aren't being captured from real messages
- ⚠️ **No retention job**: Memories never expire or decay

**Net Result**: The system *attempts* to recall memories, but returns empty arrays because no memories are being saved.

---

## How Memory Recall Should Work

### The Flow

```
User Message → LLM Gateway → ContextTrimmer
                    ↓
            [Saves message to gateway.db]
                    ↓
    [Event emitted to memory-service]
                    ↓
        Memory Service Audits & Saves
                    ↓
Next Request → ContextTrimmer recalls memories
                    ↓
    [Injects memories into prompt context]
                    ↓
         LLM responds with context
```

### Current Implementation Status

#### ✅ Tier 1: Memory Recall (IMPLEMENTED)

**Location**: `apps/llm-gateway/src/ContextTrimmer.ts:33-71`

```typescript
// Fetch and add memories from memory service (Tier-1 recall)
if (userId) {
  const recallPromise = fetch(`${MEMORY_SERVICE_URL}/v1/recall?userId=${userId}&threadId=${threadId}&maxItems=5&deadlineMs=30`);
  
  // Race with timeout to ensure we don't block
  const memories = await Promise.race([
    recallPromise,
    new Promise<any[]>((resolve) => setTimeout(() => resolve([]), 30))
  ]);

  if (memories.length > 0) {
    const memoryText = memories.map(m => `[Memory] ${m.content}`).join('\n');
    trimmed.push({ 
      role: 'system', 
      content: `Relevant memories:\n${memoryText}` 
    });
  }
}
```

**Status**: ✅ Code exists, works correctly  
**Problem**: Returns empty array because no memories are saved

#### ✅ Tier 2: Conversation History Recall (IMPLEMENTED)

**Location**: `apps/llm-gateway/src/ContextTrimmer.ts:73-118`

```typescript
// Fetch and add last 2 conversation histories with summaries
const conversations = await fetch(`${MEMORY_SERVICE_URL}/v1/conversations?userId=${userId}&excludeThreadId=${threadId}&limit=2`);

if (conversations.length > 0) {
  // Get summaries from gateway DB
  const summaries = conversations.map(conv => {
    const threadSummary = db.prepare('SELECT summary FROM thread_summaries WHERE thread_id = ?').get(conv.threadId);
    return threadSummary;
  });

  trimmed.push({ 
    role: 'system', 
    content: `Recent conversation history:\n${conversationHistoryText}` 
  });
}
```

**Status**: ✅ Code exists, works correctly  
**Problem**: No thread_summaries in current database

#### ✅ Memory Service Recall Endpoint (IMPLEMENTED)

**Location**: `apps/memory-service/src/routes.ts:261-347`

```typescript
app.get('/v1/recall', async (req, reply) => {
  const memories = db.prepare(`
    SELECT * FROM memories
    WHERE userId = ? AND deletedAt IS NULL
    ORDER BY CASE tier WHEN 'TIER2' THEN 1 ... END,
             priority DESC, updatedAt DESC
    LIMIT ?
  `).all(userId, limit);

  return reply.send({ memories, count: memories.length });
});
```

**Status**: ✅ Code exists, works correctly  
**Problem**: Queries return empty because no memories exist

---

## Why It's Not Working

### Issue #1: Empty Gateway Database

**Current State**: `apps/llm-gateway/gateway.db` is **0 bytes**

**Impact**: 
- No message history stored
- No thread_summaries available
- Conversation recall returns nothing

**Backup Data**: `gateway.db.backup` has 414 messages from previous sessions

### Issue #2: Memory Audit Uses Mock Data

**From Memory Audit Report** (GAP-001):

```javascript
// Location: apps/memory-service/src/routes.ts:277-290

// Simulate: In real implementation, fetch recent messages from gateway DB
// For now, we'll just create a stub audit record
const mockMessages = [...]
```

**Impact**: 
- Audits don't process real message content
- Creates fake audit records
- **No actual memories saved**

**Root Cause**: Memory service tries to connect to gateway DB but it's empty or path is wrong

### Issue #3: No Retention Job Scheduled

**From Memory Audit Report** (GAP-002):

```javascript
// Location: apps/memory-service/src/server.ts (missing call)

// Should run daily to:
// - Expire old memories
// - Decay priority scores
// - Promote/demote tiers
```

**Impact**:
- Even if memories existed, they'd never be cleaned up
- Priority decay not enforced
- Storage growth unbounded

### Issue #4: No Thread Summaries Created

**Observation**: The gateway database has no `thread_summaries` records

**Expected**: Summaries should be created either:
1. By Gateway after conversations
2. By Memory Service during audits
3. By a background job

**Reality**: Neither service is creating them

---

## What Actually Happens Right Now

### Example Request Flow

```
User: "What did we talk about last time?"

1. ContextTrimmer tries to recall memories
   → GET /v1/recall?userId=user_123&threadId=thread_456
   → Returns: { memories: [], count: 0 } ✅ Works, no data

2. ContextTrimmer tries to get conversation history
   → GET /v1/conversations?userId=user_123&limit=2
   → Returns: { conversations: [] } ✅ Works, no data
   
3. ContextTrimmer queries gateway.db for thread summaries
   → SELECT summary FROM thread_summaries WHERE thread_id = ?
   → Returns: undefined ✅ Works, no data

4. LLM receives ONLY current conversation context
   → Responds: "I don't have access to previous conversations"
```

**Result**: The recall system is working correctly, but there's nothing to recall.

---

## Data Flow Analysis

### Current Message Storage

```
User sends message
    ↓
LLM Gateway receives
    ↓
Saves to gateway.db.messages ✅
    ↓
Emits event to memory-service
    ↓
Memory service receives event
    ↓
Cadence tracker accumulates
    ↓
Triggers audit job when threshold met
    ↓
Audit job processes... MOCK DATA ❌
    ↓
Saves memories to memory.db
```

### Current Recall Flow

```
User sends new message
    ↓
ContextTrimmer called
    ↓
Queries gateway.db for messages ✅
    ↓
Fetches memories from /v1/recall ✅
    ↓
Gets empty array (no memories exist)
    ↓
Queries gateway.db for summaries ✅
    ↓
Gets undefined (no summaries exist)
    ↓
Returns only current conversation context
```

---

## Comparison: Expected vs Actual

| Component | Expected Behavior | Actual State |
|-----------|------------------|--------------|
| **Memory Capture** | Messages → Cadence → Audit → Save | ✅ Flow exists<br>❌ Uses mock data<br>❌ No real saves |
| **Memory Storage** | Saved to memory.db with priority/tier | ✅ Schema ready<br>❌ No data |
| **Memory Recall** | Query by userId/threadId, filter by priority | ✅ Endpoint works<br>❌ Returns empty |
| **Conversation Context** | Last K messages + summaries | ✅ Retrieves messages<br>❌ No summaries |
| **Cross-Thread Recall** | Recent conversations + their summaries | ✅ Code exists<br>❌ No history |

---

## The Bottom Line

### Is There a Connection? ✅ YES

The database connection exists and is configured correctly:
- Gateway connects to `gateway.db`
- Memory service connects to `memory.db` and `gateway.db`
- Recall endpoints are implemented
- Context injection code is present

### Is There Data? ❌ NO

Neither database has meaningful content:
- Gateway DB is empty (0 bytes)
- Backup has old data (414 messages, no summaries)
- Memory service has no memories (audits use mock data)

### Can the LLM Recall? ⚠️ PARTIALLY

The LLM CAN recall from:
- ✅ **Current conversation messages** (stored in gateway.db)
- ✅ **Last K turns** within the same thread

The LLM CANNOT recall:
- ❌ **Memories from previous conversations**
- ❌ **Conversation summaries**
- ❌ **Cross-thread context**
- ❌ **Persistent knowledge**

---

## Fixing the System

### P0 - Make It Work

1. **Restore Gateway Database**
   ```bash
   cp apps/llm-gateway/gateway.db.backup apps/llm-gateway/gateway.db
   ```

2. **Fix Audit Mock Data**
   - Update `apps/memory-service/src/routes.ts:277-290`
   - Fetch real messages from gateway DB
   - Process through scoring pipeline

3. **Create Thread Summaries**
   - Add job to generate summaries after conversations
   - Or update audits to create summaries

4. **Schedule Retention Job**
   - Add to `apps/memory-service/src/server.ts`
   - Run daily cleanup

### P1 - Make It Reliable

5. **Add Migration System**
   - Track schema versions
   - Enable safe updates

6. **Implement Automated Backups**
   - Daily snapshots
   - Recovery procedures

7. **Add Monitoring**
   - Memory count metrics
   - Recall success rates
   - Query performance

---

## Testing the System

### Current Test Command

```bash
# Start both services
pnpm dev:gateway
pnpm dev:memory

# Send a message
curl -X POST http://localhost:8787/v1/chat/stream \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"messages":[{"role":"user","content":"hello"}],"thread_id":"test"}'

# Check if memory was saved
curl http://localhost:3001/v1/memories?userId=test_user
# Returns: { memories: [], total: 0 } ❌

# Check recall
curl http://localhost:3001/v1/recall?userId=test_user
# Returns: { memories: [], count: 0 } ❌
```

### Expected Test Result

After fixes, you should see:
```bash
curl http://localhost:3001/v1/recall?userId=test_user
# Returns: { memories: [...], count: 3 } ✅
```

---

## Conclusion

**The memory recall infrastructure is built and connected correctly.** The problem is **operational**, not architectural:

- ✅ Code exists and is well-designed
- ✅ Database connections are configured
- ✅ Recall endpoints are implemented
- ❌ **No data is being saved** due to empty databases and mock audit data

**Recommendation**: Restore the backup database and fix the audit mock data issue. The system should then begin working as designed.

---

**Status**: READY BUT EMPTY  
**Priority**: Fix P0 issues to enable functionality  
**Time to Fix**: ~2 hours (restore DB, fix audit, verify)

