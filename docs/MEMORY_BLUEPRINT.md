# Smart Memory System Blueprint

## Executive Summary

The Smart Memory System is a **background, non-blocking** service that intelligently captures, scores, and stores conversational context without impacting the critical chat path. It operates on a proactive audit cadence, uses quality scoring to filter valuable memories, and enforces strict privacy boundaries.

**Core Principle**: Memory is advisory, not critical. The chat experience must never wait for memory operations.

---

## Objectives

1. **Non-Blocking Architecture**: Zero impact on chat latency; all memory operations are fire-and-forget or async
2. **Intelligent Capture**: Use quality scoring (Q ≥ 0.65) to save only valuable context
3. **Privacy-First**: Automatic redaction of PII, secrets, and sensitive data
4. **Proactive Cadence**: Trigger audits based on message count, token usage, or time elapsed
5. **Future-Ready**: Designed for embeddings and semantic search (v1), but starts with keyword/FTS
6. **Observable**: Comprehensive metrics for monitoring and tuning

---

## Non-Goals (v0)

- ❌ Vector embeddings on the critical path
- ❌ Real-time semantic search during chat
- ❌ UI for memory management (endpoints only)
- ❌ Cross-thread memory synthesis
- ❌ Automatic prompt injection of memories
- ❌ Distributed storage (SQLite only for v0)

---

## Architecture Overview

```
┌─────────────────┐         ┌──────────────────┐
│                 │         │                  │
│  LLM Gateway    │─────────▶  Memory Service  │
│  (Chat Path)    │  HTTP   │  (Background)    │
│                 │  POST   │                  │
└─────────────────┘         └──────────────────┘
         │                           │
         │                           │
         ▼                           ▼
    messages DB              ┌───────────────┐
                             │  SQLite DB    │
                             │  - memories   │
                             │  - audits     │
                             │  - summaries  │
                             └───────────────┘
```

### Flow

1. **Message Event**: Gateway fires message event (userId, threadId, content, tokens) to memory-service
2. **Accumulation**: Memory-service tracks counters per thread (msgs, tokens, time)
3. **Trigger**: When cadence thresholds met, schedule AuditJob
4. **Audit**: Process message window → score candidates → redact → save top entries
5. **Storage**: Batch writes to SQLite with WAL mode
6. **Retrieval**: Endpoints for reading/editing memories (future UI integration)

---

## Data Model

### Tables

#### `memories`
```sql
CREATE TABLE IF NOT EXISTS memories(
  id TEXT PRIMARY KEY,                    -- uuid
  user_id TEXT NOT NULL,                  -- auth user ID
  thread_id TEXT NOT NULL,                -- conversation thread
  content TEXT NOT NULL,                  -- redacted memory text
  entities TEXT,                          -- JSON: extracted keywords/entities
  priority REAL NOT NULL DEFAULT 0.5,     -- quality score Q (0..1)
  confidence REAL NOT NULL DEFAULT 0.5,   -- extraction confidence
  redaction_map TEXT,                     -- JSON: {hash: {original, placeholder}}
  created_at INTEGER NOT NULL,            -- unix timestamp
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER                      -- soft delete
);

CREATE INDEX IF NOT EXISTS idx_memories_user_priority
  ON memories(user_id, priority DESC, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_memories_thread_time
  ON memories(thread_id, updated_at DESC);
```

#### `memory_audits`
```sql
CREATE TABLE IF NOT EXISTS memory_audits(
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  start_msg_id TEXT,                      -- first message in audit window
  end_msg_id TEXT,                        -- last message in audit window
  token_count INTEGER NOT NULL,           -- total tokens in window
  score REAL NOT NULL,                    -- avg quality score
  saved INTEGER NOT NULL,                 -- count of memories saved
  created_at INTEGER NOT NULL
);
```

#### `thread_summaries` (reuse existing)
```sql
-- Already exists in gateway; memory-service reads for entity matching
CREATE TABLE IF NOT EXISTS thread_summaries(
  thread_id TEXT PRIMARY KEY,
  summary TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
```

### SQLite Configuration

```javascript
// db.ts PRAGMAs for performance
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('temp_store = MEMORY');
db.pragma('mmap_size = 268435456');      // 256MB
db.pragma('cache_size = -80000');        // 80MB
db.pragma('page_size = 4096');
```

**Rationale**:
- WAL mode: concurrent reads during writes
- NORMAL sync: balance safety/speed (not FULL for performance)
- Memory temp store: faster temp operations
- Large mmap/cache: optimize for read-heavy workload

---

## Cadence & Triggers

### Thresholds (Configurable)

Run an audit when **ANY** threshold is met:

| Trigger | Default | Purpose |
|---------|---------|---------|
| Messages | ≥ 6 | Capture complete exchanges (3 turns) |
| Tokens | ≥ 1,500 | Long technical discussions |
| Time | ≥ 3 min | Ongoing conversations |

**Debounce**: Minimum 30 seconds between audits per thread (prevent spam)

### Event Flow

```javascript
// Gateway emits after saving message
emitMessageEvent({
  userId: 'user_123',
  threadId: 'thread_abc',
  msgId: 'msg_xyz',
  role: 'assistant',
  content: 'Here is the solution...',
  tokens: { input: 120, output: 85 }
});

// Memory-service accumulates
threadCounters[threadId] = {
  msgs: 7,           // ✓ exceeded (≥6)
  tokens: 1650,      // ✓ exceeded (≥1500)
  lastAudit: Date.now() - 60000,  // ✓ debounce ok (>30s)
};

// → Schedule AuditJob
```

---

## Quality Scoring Algorithm

### Formula

For a candidate span **S** (window of 6-12 recent messages):

```
Q = 0.4·r + 0.3·i + 0.2·c + 0.1·h
```

Where:
- **r** (Relevance): FTS/keyword match to thread summary entities (0..1)
- **i** (Importance): Heuristic features (0..1)
- **c** (Recency): Time decay exp(-Δt/τ), τ = 36 hours
- **h** (Coherence): Structural completeness (0..1)

### Component Details

#### Relevance (r)
```javascript
// Extract keywords from thread summary
const summaryKeywords = extractKeywords(threadSummary);

// Count matches in candidate span
const matches = countKeywordMatches(spanContent, summaryKeywords);
r = Math.min(matches / 5, 1.0);  // saturate at 5 matches
```

#### Importance (i)
```javascript
const features = {
  hasDirective: /\b(do|create|build|implement|fix|ensure)\b/i.test(content),
  hasGoal: /\b(goal|objective|deadline|must|requirement)\b/i.test(content),
  hasNumbers: /\d{3,}/.test(content),  // version numbers, IDs, dates
  hasUrls: /https?:\/\//.test(content),
  hasCode: /```|`[^`]+`/.test(content),
  hasEntities: extractEntities(content).length > 0,
  userMarked: message.starred || false  // future feature
};

i = (
  features.hasDirective * 0.25 +
  features.hasGoal * 0.25 +
  features.hasNumbers * 0.1 +
  features.hasUrls * 0.1 +
  features.hasCode * 0.15 +
  features.hasEntities * 0.1 +
  features.userMarked * 0.4  // boost if explicitly starred
);
```

#### Recency (c)
```javascript
const ageHours = (Date.now() - message.timestamp) / 3600000;
const tau = 36;  // 36-hour half-life
c = Math.exp(-ageHours / tau);
```

#### Coherence (h)
```javascript
const checks = {
  hasQuestion: /\?/.test(content),
  hasAnswer: spanMessages.some(m => m.role === 'assistant'),
  isComplete: spanMessages.length >= 2,  // Q→A pair minimum
  notFragment: content.length > 50
};

h = (
  (checks.hasQuestion && checks.hasAnswer) ? 0.4 : 0 +
  checks.isComplete ? 0.3 : 0 +
  checks.notFragment ? 0.3 : 0
);
```

### Decision Rules

- **Save Threshold**: Q ≥ 0.65 (default)
- **High-Value Slot**: Q ≥ 0.8 (priority storage, longer retention)
- **Max Per Audit**: ≤ 3 memories (prevent storage explosion)

### Examples

| Scenario | r | i | c | h | Q | Save? |
|----------|---|---|---|---|---|-------|
| Recent code snippet with goal | 0.6 | 0.8 | 0.95 | 0.7 | **0.74** | ✅ |
| Old casual chat | 0.2 | 0.1 | 0.3 | 0.5 | **0.24** | ❌ |
| Important deadline 12h ago | 0.5 | 0.9 | 0.72 | 0.8 | **0.72** | ✅ |
| Fragment without context | 0.7 | 0.6 | 0.9 | 0.2 | **0.64** | ❌ |

---

## Privacy & Redaction

### Redaction Patterns

```javascript
const REDACTION_RULES = [
  {
    name: 'email',
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    placeholder: '[EMAIL]'
  },
  {
    name: 'phone',
    pattern: /\b(\+?1?[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
    placeholder: '[PHONE]'
  },
  {
    name: 'ssn',
    pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
    placeholder: '[SSN]'
  },
  {
    name: 'credit_card',
    pattern: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
    placeholder: '[CARD]'
  },
  {
    name: 'api_key',
    pattern: /\b(sk-[a-zA-Z0-9]{32,}|xox[baprs]-[a-zA-Z0-9-]+)\b/g,
    placeholder: '[API_KEY]'
  },
  {
    name: 'jwt',
    pattern: /\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
    placeholder: '[JWT]'
  },
  {
    name: 'ipv4',
    pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
    placeholder: '[IP]'
  },
  {
    name: 'ipv6',
    pattern: /\b(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\b/g,
    placeholder: '[IP]'
  },
  {
    name: 'home_path',
    pattern: /\/(home|Users)\/[a-zA-Z0-9_-]+\//g,
    placeholder: '/[HOME]/'
  }
];
```

### Redaction Map

Store reversible mappings for user editing:

```javascript
// Before redaction
const original = "Contact me at john@example.com or 555-1234";

// After redaction
const redacted = "Contact me at [EMAIL] or [PHONE]";

// Stored in redaction_map column (JSON)
{
  "sha256_abc123": {
    "original": "john@example.com",
    "placeholder": "[EMAIL]",
    "type": "email"
  },
  "sha256_def456": {
    "original": "555-1234",
    "placeholder": "[PHONE]",
    "type": "phone"
  }
}
```

**Note**: Hash is salted with user_id to prevent cross-user correlation.

### Size Limits

- **Max entry size**: 1,024 characters
- **Truncation**: Append "..." if exceeded
- **Binary data**: Store reference only, never raw content

---

## Write-Behind Batching

### Architecture

```
Message Events → Accumulator → Job Queue → Batch Writer → SQLite
                     ↓
                 Trigger Logic
                 (cadence check)
```

### Performance Budgets

| Operation | Soft Limit | Hard Limit | Action on Exceed |
|-----------|-----------|------------|------------------|
| Audit Job | 120ms | 300ms | Log warning, continue |
| Write Batch | 150ms | 250ms | Split batch, retry |
| Event Processing | 5ms | 10ms | Drop event, log error |

### Batching Strategy

```javascript
class WriteBatcher {
  queue = [];
  timer = null;

  add(memory) {
    this.queue.push(memory);
    if (this.queue.length >= 10) {
      this.flush();  // size trigger
    } else {
      this.scheduleFlush();  // time trigger
    }
  }

  scheduleFlush() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 250);  // 250-500ms window
  }

  flush() {
    const batch = this.queue.splice(0);
    db.transaction(() => {
      for (const mem of batch) {
        insertMemory(mem);
      }
    })();
  }
}
```

---

## Retrieval Policy (v0)

### Tier-0: Thread Summaries Only

```javascript
// On chat request path (FAST)
const summary = db.prepare(
  'SELECT summary FROM thread_summaries WHERE thread_id = ?'
).get(threadId);

// Use summary for context (already implemented in gateway)
```

### Tier-1: Keyword Recall (Async, Advisory)

```javascript
// NOT on critical path; runs async with 30ms deadline
async function getAdvisoryMemories(userId, threadId, query) {
  return Promise.race([
    db.prepare(`
      SELECT content, priority
      FROM memories
      WHERE user_id = ? AND thread_id = ? AND deleted_at IS NULL
      ORDER BY priority DESC
      LIMIT 5
    `).all(userId, threadId),

    timeout(30)  // abort after 30ms
  ]).catch(() => []);  // graceful fallback
}
```

**Usage**: Attach to message metadata for UI display, NOT injected into prompts.

### Tier-2: Embeddings (v1 - Future)

```javascript
// Optional background job; never on request path
// Queue: generateEmbedding(memoryId) → store in separate table
// Query: semanticSearch(queryVector, k=5) with HNSW/FAISS
```

---

## Observability

### Metrics (Exposed at `/v1/metrics`)

```json
{
  "jobs": {
    "enqueued": 1247,
    "processed": 1245,
    "failed": 2,
    "avg_latency_ms": 87.3,
    "p95_latency_ms": 142.1
  },
  "memories": {
    "total": 3821,
    "saved_last_hour": 18,
    "deleted": 42,
    "avg_priority": 0.73
  },
  "audits": {
    "total": 415,
    "avg_score": 0.68,
    "saves_per_audit": 2.1
  },
  "rejections": {
    "below_threshold": 892,
    "redacted_all": 14,
    "too_long": 3,
    "rate_limited": 0
  },
  "health": {
    "db_size_mb": 47.2,
    "queue_depth": 3,
    "last_audit_ms_ago": 12483
  }
}
```

### Logging

**Structured logs (pino)**:

```javascript
// Job processing
logger.info({
  event: 'audit_completed',
  threadId,
  userId,
  msgCount: 8,
  avgScore: 0.71,
  saved: 2,
  duration_ms: 94
});

// Rejections
logger.debug({
  event: 'memory_rejected',
  reason: 'below_threshold',
  score: 0.58,
  threshold: 0.65
});

// Errors
logger.error({
  event: 'audit_failed',
  error: err.message,
  stack: err.stack
});
```

---

## Migration to Embeddings (v1)

### Phase 1: Preparation (v0.5)

1. Add `embedding BLOB` column to `memories` (nullable)
2. Create `embedding_jobs` queue table
3. Background worker generates embeddings for existing memories (batch 100/min)

### Phase 2: Integration (v1.0)

1. Deploy vector DB (pgvector, Qdrant, or Milvus)
2. Sync embeddings on memory insert
3. Add `/v1/memories/search?q=semantic+query` endpoint
4. Update retrieval to use hybrid (keyword + semantic)

### Phase 3: Optimization (v1.5)

1. HNSW index tuning
2. Re-ranking with cross-encoder
3. Query caching
4. Incremental updates

**Timeline**: v0 → v0.5 (2 weeks), v0.5 → v1.0 (4 weeks)

---

## Configuration

### `apps/memory-service/config/memory.json`

```json
{
  "cadence": {
    "msgs": 6,
    "tokens": 1500,
    "minutes": 3,
    "debounceSec": 30
  },
  "thresholds": {
    "save": 0.65,
    "high": 0.8,
    "maxPerAudit": 3
  },
  "limits": {
    "maxEntryChars": 1024,
    "maxMemoriesPerUser": 10000
  },
  "privacy": {
    "redact": true,
    "redactRules": ["email", "phone", "ssn", "credit_card", "api_key", "jwt", "ipv4", "ipv6", "home_path"]
  },
  "performance": {
    "auditSoftMs": 120,
    "auditHardMs": 300,
    "writeBatchMs": 250,
    "eventTimeoutMs": 10
  }
}
```

### `apps/llm-gateway/config/llm-gateway.json` (add)

```json
{
  "flags": {
    "fr": true,
    "memoryEvents": true  // ← NEW
  },
  "memory": {
    "serviceUrl": "http://localhost:3001"
  }
}
```

---

## Acceptance Criteria

### ✅ Functional Requirements

- [ ] Memory-service starts independently on port 3001
- [ ] Gateway emits message events without blocking (fire-and-forget)
- [ ] Cadence triggers work for msgs/tokens/time thresholds
- [ ] Quality score Q computed correctly (r, i, c, h components)
- [ ] Only Q ≥ 0.65 entries saved; max 3 per audit
- [ ] Redaction masks all PII patterns; redaction_map stored
- [ ] Write batching with 250ms window; single-writer queue
- [ ] GET /v1/memories returns filtered, paged results
- [ ] PATCH /v1/memories/:id updates content/priority/deletion
- [ ] Metrics endpoint returns live counters

### ✅ Non-Functional Requirements

- [ ] Chat path latency unchanged (0ms impact)
- [ ] Event emission < 10ms (hard deadline)
- [ ] Audit job avg < 120ms (soft), < 300ms (hard)
- [ ] SQLite with WAL, NORMAL sync, optimized PRAGMAs
- [ ] Graceful degradation on memory-service failure
- [ ] Unit test coverage > 80%

### ✅ Testing

- [ ] scorer.spec.ts passes with deterministic fixtures
- [ ] redaction.spec.ts validates all PII patterns
- [ ] cadence.spec.ts simulates triggers and debounce
- [ ] Integration test: emit 10 events → audit → verify saves

---

## Development Workflow

### 1. Start Memory Service

```bash
cd apps/memory-service
pnpm install
pnpm dev  # runs on port 3001
```

### 2. Run Tests

```bash
pnpm test
```

### 3. Simulate Events

```bash
# Send test message event
curl -X POST http://localhost:3001/v1/events/message \
  -H 'Content-Type: application/json' \
  -d '{
    "userId": "user_123",
    "threadId": "thread_abc",
    "msgId": "msg_001",
    "role": "user",
    "content": "Build a dashboard with charts",
    "tokens": {"input": 50, "output": 0}
  }'

# Check metrics
curl http://localhost:3001/v1/metrics
```

### 4. Query Memories

```bash
# List memories for user
curl 'http://localhost:3001/v1/memories?userId=user_123&limit=10'

# Edit memory
curl -X PATCH http://localhost:3001/v1/memories/mem_xyz \
  -H 'Content-Type: application/json' \
  -d '{"priority": 0.9}'
```

---

## Security Considerations

1. **Authentication**: Assume upstream auth; accept userId in `x-user-id` header
2. **Authorization**: Users can only access their own memories
3. **Redaction**: Never log raw PII; always redact in logs
4. **Rate Limiting**: 100 events/sec per user (prevent abuse)
5. **Data Retention**: Auto-delete memories older than 90 days (configurable)

---

## Future Enhancements

- [ ] Multi-user memory synthesis (team knowledge base)
- [ ] Temporal reasoning ("What did we discuss last week?")
- [ ] Cross-thread memory links
- [ ] Export/import memories (GDPR compliance)
- [ ] Memory editing UI with diff preview
- [ ] Active learning: user feedback loop to improve scoring
- [ ] Federated search across multiple memory stores

---

## Glossary

- **Audit**: Background job that evaluates a message window and saves qualified memories
- **Cadence**: Trigger logic for scheduling audits (msgs, tokens, time)
- **Quality Score (Q)**: Composite metric (0..1) measuring memory value
- **Redaction**: Automatic PII removal with reversible mapping
- **Thread Summary**: Cached synopsis of conversation for fast context retrieval
- **Write-Behind**: Batched async writes to decouple from critical path

---

## References

- [SQLite Performance Tuning](https://www.sqlite.org/pragma.html)
- [Better-SQLite3 Docs](https://github.com/WiseLibs/better-sqlite3)
- [Fastify Documentation](https://www.fastify.io/)
- [Zod Schema Validation](https://github.com/colinhacks/zod)
- [Pino Logging](https://github.com/pinojs/pino)

---

**Document Version**: 1.0
**Last Updated**: 2025-10-31
**Author**: AI Assistant
**Status**: Ready for Implementation
