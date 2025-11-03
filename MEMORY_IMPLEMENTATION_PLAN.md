# Memory Implementation Plan

**Goal**: Enable REAL memory capture and conversation history recall  
**Estimated Time**: 4-6 hours  
**Priority**: P0 - Core Feature

---

## Executive Summary

Currently, the memory system infrastructure exists but **no real data is being captured**. This plan will enable:
1. ✅ Real message audit and memory saving
2. ✅ Real conversation summary generation
3. ✅ Real recall of memories and history
4. ✅ Proper data persistence and cleanup

---

## Phase 1: Fix Critical Database Issues (30 min)

### Task 1.1: Restore Database from Backup

**Problem**: `gateway.db` is empty (0 bytes)

**Action**:
```bash
# Stop all services first
./stop.sh

# Restore from backup
cd apps/llm-gateway
cp gateway.db.backup gateway.db

# Verify it has data
ls -lh gateway.db
# Should show ~652K with data

# Restart services
cd ../..
pnpm dev
```

**Verification**:
- Check gateway.db has messages
- Check thread_summaries exist
- Services start without errors

**Important Note**: The backup database has 414 messages but **ALL have NULL user_id**. This means:
- Old conversations are "orphaned" (no user_id)
- They won't show up in user-specific conversation lists
- They won't be recalled in memory system
- This is expected - old data before user tracking was implemented
- New conversations will have proper user_ids

---

### Task 1.2: Fix Memory Service Database Path

**Problem**: Memory service has wrong gateway DB path

**Location**: `apps/memory-service/src/server.ts:28`

**Current**:
```typescript
const GATEWAY_DB_PATH = process.env.GATEWAY_DB_PATH || './gateway.db';
```

**Fix**:
```typescript
const GATEWAY_DB_PATH = process.env.GATEWAY_DB_PATH || '../../llm-gateway/gateway.db';
```

**Why**: Memory service is in `apps/memory-service/`, gateway is in `apps/llm-gateway/`

**Verification**:
```bash
# Check logs on startup
# Should see: "Gateway database connected" not "Failed to connect"
```

---

## Phase 2: Fix Audit Mock Data (2 hours)

### Task 2.1: Implement Real Message Fetching

**Problem**: Audits use mock data instead of real messages

**Location**: `apps/memory-service/src/routes.ts:277-290`

**Current Code** (MOCK):
```typescript
// Simulate: In real implementation, fetch recent messages from gateway DB
const mockMessages = [
  { role: 'user', content: 'User message about memory' },
  { role: 'assistant', content: 'Assistant response' }
];
```

**Replace With** (REAL):
```typescript
// Fetch recent messages from gateway DB
if (!gatewayDb) {
  app.log.warn('Gateway DB not available, skipping audit');
  return reply.code(202).send({ status: 'no_gateway_db' });
}

const recentMessages = gatewayDb.prepare(`
  SELECT id, role, content, created_at
  FROM messages
  WHERE thread_id = ? 
    AND (deleted_at IS NULL OR deleted_at = 0)
  ORDER BY created_at DESC
  LIMIT 20
`).all(threadId) as Array<{
  id: number;
  role: string;
  content: string;
  created_at: number;
}>;

if (recentMessages.length === 0) {
  app.log.debug({ threadId }, 'No messages to audit');
  return reply.code(202).send({ status: 'no_messages' });
}
```

**Location**: Find the audit handler in `apps/memory-service/src/routes.ts`

**Search for**: `// Simulate: In real implementation`

---

### Task 2.2: Update Audit Processing Logic

**Current**: Process mock messages → score → save

**Fix**: Process real messages → score → save

**Changes Needed**:

1. **Replace mock message array** with real data from Task 2.1

2. **Add message windowing**:
```typescript
// Get message window for this audit
const windowMessages = recentMessages.slice(0, 20).reverse(); // Oldest first
const startMsgId = windowMessages[0]?.id?.toString();
const endMsgId = windowMessages[windowMessages.length - 1]?.id?.toString();
```

3. **Process through existing pipeline**:
```typescript
// Score candidates
const candidates = windowMessages
  .filter(msg => msg.role === 'user' || msg.role === 'assistant')
  .map(msg => {
    const score = scorer.score(msg.content);
    return { ...msg, score };
  });

// Filter and redact
const eligible = candidates.filter(c => c.score >= QUALITY_THRESHOLD);
const redacted = eligible.map(c => {
  const { content, redactionMap } = redaction.redact(c.content);
  return { ...c, content, redactionMap };
});

// Save top memories
const topMemories = redacted.slice(0, 5);
for (const mem of topMemories) {
  memoryModel.create({
    userId: userId,
    threadId: threadId,
    content: mem.content,
    entities: JSON.stringify(extractEntities(mem.content)),
    priority: mem.score,
    confidence: mem.score,
    redactionMap: JSON.stringify(mem.redactionMap),
    tier: detectTier(redacted, mem),
  });
}
```

4. **Create audit record**:
```typescript
auditModel.create({
  userId: userId,
  threadId: threadId,
  startMsgId: startMsgId,
  endMsgId: endMsgId,
  tokenCount: windowMessages.reduce((sum, m) => sum + estimateTokens(m.content), 0),
  score: candidates.reduce((sum, c) => sum + c.score, 0) / candidates.length,
  saved: topMemories.length,
});
```

**Verification**:
- Send conversation messages
- Check audit is triggered
- Verify memories saved in database
- Check audit record created

---

### Task 2.3: Add Missing Helper Functions

**Problem**: Functions referenced but may not exist

**Location**: Create `apps/memory-service/src/auditHelpers.ts`

```typescript
import { MemoryModel } from './models.js';

/**
 * Extract keywords and entities from text
 */
export function extractEntities(text: string): string[] {
  const entities: string[] = [];
  
  // Simple extraction: nouns, capitalized words, quoted phrases
  const words = text.split(/\s+/);
  
  for (const word of words) {
    // Capitalized words (potential proper nouns)
    if (/^[A-Z][a-z]+$/.test(word)) {
      entities.push(word);
    }
  }
  
  // Quoted phrases
  const quoted = text.match(/"([^"]+)"/g) || [];
  for (const q of quoted) {
    entities.push(q.slice(1, -1));
  }
  
  return [...new Set(entities)].slice(0, 10); // Max 10 unique
}

/**
 * Detect tier based on cross-thread repetition
 */
export function detectTier(
  allCandidates: Array<{ content: string; score: number }>,
  current: { content: string }
): 'TIER1' | 'TIER2' | 'TIER3' {
  // Check if memory appears in multiple threads
  const repeats = allCandidates.filter(c => 
    c.content === current.content || 
    similarity(c.content, current.content) > 0.8
  ).length;
  
  if (repeats >= 2) return 'TIER1';
  if (repeats === 1) return 'TIER2';
  return 'TIER3';
}

/**
 * Simple similarity measure (Jaccard)
 */
function similarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/));
  const wordsB = new Set(b.toLowerCase().split(/\s+/));
  
  const intersection = [...wordsA].filter(w => wordsB.has(w));
  const union = new Set([...wordsA, ...wordsB]);
  
  return intersection.length / union.size;
}

/**
 * Estimate tokens (simple approximation)
 */
export function estimateTokens(text: string): number {
  // Rough: 1 token ≈ 4 characters for English
  return Math.ceil(text.length / 4);
}
```

**Import in routes.ts**:
```typescript
import { extractEntities, detectTier, estimateTokens } from './auditHelpers.js';
```

---

## Phase 3: Implement Conversation Summaries (1.5 hours)

### Task 3.1: Create Summary Generation Job

**Problem**: No thread_summaries being created

**Location**: Create `apps/llm-gateway/src/summarizer.ts`

```typescript
import { getDatabase } from './database.js';
import { loadConfig } from './config.js';

export class ThreadSummarizer {
  private config = loadConfig();

  /**
   * Generate or update summary for a thread
   */
  async summarizeThread(threadId: string, userId: string): Promise<string | null> {
    const db = getDatabase();
    
    // Get all messages for thread
    const messages = db.prepare(`
      SELECT role, content, created_at
      FROM messages
      WHERE thread_id = ? 
        AND (deleted_at IS NULL OR deleted_at = 0)
      ORDER BY created_at ASC
    `).all(threadId) as Array<{
      role: string;
      content: string;
      created_at: number;
    }>;

    if (messages.length === 0) {
      return null;
    }

    // Get existing summary
    const existing = db.prepare(`
      SELECT summary FROM thread_summaries 
      WHERE thread_id = ?
    `).get(threadId) as { summary: string } | undefined;

    // If we have a summary and few new messages, skip
    if (existing && messages.length <= 10) {
      return existing.summary;
    }

    // Generate summary
    const summary = await this.generateSummary(messages, threadId);

    // Save to database
    const now = Math.floor(Date.now() / 1000);
    db.prepare(`
      INSERT INTO thread_summaries (thread_id, user_id, summary, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(thread_id) DO UPDATE SET summary = ?, updated_at = ?
    `).run(threadId, userId, summary, now, summary, now);

    return summary;
  }

  /**
   * Generate summary using LLM or heuristic
   */
  private async generateSummary(
    messages: Array<{ role: string; content: string }>,
    threadId: string
  ): Promise<string> {
    // For now, use first user message
    const firstUserMessage = messages.find(m => m.role === 'user');
    
    if (!firstUserMessage) {
      return 'Conversation started';
    }

    // Simple heuristic: use first 50 chars of first message
    const preview = firstUserMessage.content.slice(0, 50);
    
    if (preview.length < firstUserMessage.content.length) {
      return preview + '...';
    }
    
    return preview;
  }

  /**
   * Generate comprehensive summary using LLM (future enhancement)
   */
  async generateLLMSummary(
    messages: Array<{ role: string; content: string }>
  ): Promise<string> {
    // TODO: Call LLM to generate summary
    // For now, return heuristic summary
    const firstUserMessage = messages.find(m => m.role === 'user');
    return firstUserMessage?.content.slice(0, 100) || 'Conversation started';
  }
}

export const threadSummarizer = new ThreadSummarizer();
```

---

### Task 3.2: Trigger Summary Generation

**Location**: `apps/llm-gateway/src/routes.ts`

**Add after message insertion** (around line 197):

```typescript
// Save incoming messages
const now = Math.floor(Date.now() / 1000);
const stmt = db.prepare(
  'INSERT INTO messages (thread_id, user_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)'
);
for (const msg of body.messages) {
  stmt.run(threadId, userId, msg.role, msg.content, now);
}

// Generate or update summary if needed (async, non-blocking)
threadSummarizer.summarizeThread(threadId, userId).catch(err => {
  logger.error({ err, threadId }, 'Summary generation failed');
});
```

**Add import at top**:
```typescript
import { threadSummarizer } from './summarizer.js';
```

---

### Task 3.3: Enable LLM-Based Summaries (Optional)

**Future Enhancement**: Use actual LLM for better summaries

**Add to `apps/llm-gateway/src/summarizer.ts`**:

```typescript
async generateLLMSummary(messages: Array<{ role: string; content: string }>): Promise<string> {
  const config = loadConfig();
  const providerName = 'openai'; // Default provider
  const model = config.models[providerName];
  const provider = providerPool.getProvider(providerName);
  
  if (!provider) {
    return this.generateHeuristicSummary(messages);
  }

  // Build summary prompt
  const conversationText = messages
    .map(m => `${m.role}: ${m.content}`)
    .join('\n');
  
  const summaryPrompt = `Summarize this conversation in 2-3 sentences:\n\n${conversationText}`;

  try {
    const response = await provider.chat({
      model: model,
      messages: [{ role: 'user', content: summaryPrompt }],
      temperature: 0.3,
      max_tokens: 100,
    });

    return response.content || this.generateHeuristicSummary(messages);
  } catch (error) {
    logger.error({ error }, 'LLM summary failed');
    return this.generateHeuristicSummary(messages);
  }
}
```

---

## Phase 4: Enable Recall & Testing (1 hour)

### Task 4.1: Verify Recall Flow

**Test Script**: Create `scripts/test_memory_recall.sh`

```bash
#!/bin/bash

echo "=== Testing Memory Recall System ==="

# Start services (if not already running)
echo "Starting services..."
pnpm dev > /dev/null 2>&1 &
SERVICES_PID=$!
sleep 5

# Test 1: Send conversation
echo "Test 1: Sending conversation"
curl -X POST http://localhost:8787/v1/chat/stream \
  -H "Authorization: Bearer test_token" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "My name is John and I love Python programming"}
    ],
    "thread_id": "test_thread_1"
  }' > /dev/null

sleep 2

# Test 2: Check if memory was saved
echo "Test 2: Checking memories"
MEMORIES=$(curl -s http://localhost:3001/v1/memories?userId=test_user)
echo "Memories: $MEMORIES"

# Test 3: Send another message in same thread
echo "Test 3: Sending follow-up message"
curl -X POST http://localhost:8787/v1/chat/stream \
  -H "Authorization: Bearer test_token" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "What programming language do I like?"}
    ],
    "thread_id": "test_thread_1"
  }' > /dev/null

# Test 4: Check recall
echo "Test 4: Testing recall"
RECALL=$(curl -s "http://localhost:3001/v1/recall?userId=test_user&threadId=test_thread_1")
echo "Recall: $RECALL"

# Cleanup
kill $SERVICES_PID
echo "Tests complete"
```

**Run**: `chmod +x scripts/test_memory_recall.sh && ./scripts/test_memory_recall.sh`

---

### Task 4.2: Integration Test

**Create**: `apps/memory-service/test/integration.spec.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { createDatabase } from '../src/db.js';
import { MemoryModel } from '../src/models.js';

describe('Memory Integration', () => {
  let db: Database.Database;
  let memoryModel: MemoryModel;

  beforeAll(() => {
    db = createDatabase(':memory:');
    memoryModel = new MemoryModel(db);
  });

  afterAll(() => {
    db.close();
  });

  it('should save and recall memories', async () => {
    const userId = 'test_user';
    const threadId = 'test_thread';

    // Save memory
    const memory = memoryModel.create({
      userId,
      threadId,
      content: 'User likes Python programming',
      priority: 0.8,
    });

    expect(memory.id).toBeDefined();
    expect(memory.content).toBe('User likes Python programming');

    // Recall memories
    const result = memoryModel.list({
      userId,
      threadId,
      limit: 10,
      offset: 0,
    });

    expect(result.memories.length).toBe(1);
    expect(result.memories[0].content).toContain('Python');
  });
});
```

---

## Phase 5: Schedule Retention Job (30 min)

### Task 5.1: Add Retention to Server

**Location**: `apps/memory-service/src/server.ts`

**Add after queue initialization** (around line 61):

```typescript
// Schedule retention job
import { runRetentionJob } from './retention.js';

// Run retention every 24 hours
setInterval(async () => {
  try {
    const stats = await runRetentionJob(db, {
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      priorityDecay: 0.95, // Decay 5% per day
      minPriority: 0.3, // Delete below this
    });
    logger.info({ stats }, 'Retention job completed');
  } catch (error) {
    logger.error({ error }, 'Retention job failed');
  }
}, 24 * 60 * 60 * 1000);

// Run immediately on startup
runRetentionJob(db, {
  maxAge: 30 * 24 * 60 * 60 * 1000,
  priorityDecay: 0.95,
  minPriority: 0.3,
}).catch(err => logger.error({ err }, 'Initial retention failed'));
```

---

### Task 5.2: Verify Retention Works

**Test**: After 24 hours, check that:
- Old memories are deleted
- Priority scores have decayed
- Low-quality memories removed

---

## Verification Checklist

After completing all phases, verify:

### Database State
- [ ] Gateway DB has messages
- [ ] Gateway DB has thread_summaries
- [ ] Memory DB has saved memories
- [ ] Memory DB has audit records

### Functionality
- [ ] New messages trigger audits
- [ ] Real memories are saved (not mock)
- [ ] Summaries are generated
- [ ] Recall returns memories
- [ ] Conversation history works

### Testing
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Manual end-to-end test works
- [ ] No errors in logs

---

## File Changes Summary

### New Files
- `apps/llm-gateway/src/summarizer.ts` - Summary generation
- `apps/memory-service/src/auditHelpers.ts` - Helper functions
- `scripts/test_memory_recall.sh` - Test script
- `apps/memory-service/test/integration.spec.ts` - Integration tests

### Modified Files
- `apps/memory-service/src/server.ts` - Fix gateway DB path, add retention
- `apps/memory-service/src/routes.ts` - Fix audit mock data
- `apps/llm-gateway/src/routes.ts` - Add summary generation
- `apps/llm-gateway/src/server.ts` - Add database cleanup

---

## Rollback Plan

If issues occur:

1. **Restore databases from backup**:
   ```bash
   cp apps/llm-gateway/gateway.db.backup apps/llm-gateway/gateway.db
   ```

2. **Revert code changes**:
   ```bash
   git checkout apps/memory-service/src/routes.ts
   git checkout apps/llm-gateway/src/routes.ts
   ```

3. **Remove new files**:
   ```bash
   rm apps/llm-gateway/src/summarizer.ts
   rm apps/memory-service/src/auditHelpers.ts
   ```

---

## Success Criteria

**The system is working when**:
1. ✅ Sending a conversation creates memory entries
2. ✅ Recalling memories returns saved content
3. ✅ Conversation summaries are generated
4. ✅ Cross-thread recall works
5. ✅ No errors in logs
6. ✅ Tests pass

---

**Estimated Total Time**: 4-6 hours  
**Priority**: P0  
**Risk**: Medium (requires database changes)  
**Dependencies**: None (uses existing infrastructure)

