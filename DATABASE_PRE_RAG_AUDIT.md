# Database Pre-RAG Audit & Optimization Checklist

## Executive Summary

Before implementing Agentic RAG, we need to ensure databases are:
1. **Aligned** - Schemas consistent across services
2. **Optimized** - Proper indexes, PRAGMAs, and performance settings
3. **RAG-Ready** - Prepared for embedding storage and vector search

**Status**: 🟡 **Needs Optimization** - Several critical issues identified

---

## Current State Analysis

### ✅ What's Working Well

1. **PRAGMA Configuration**
   - ✅ WAL mode enabled (concurrent reads)
   - ✅ Large mmap_size (256MB) and cache_size (80MB)
   - ✅ NORMAL synchronous mode (performance/safety balance)
   - ✅ Auto-vacuum on memory-service

2. **Indexing**
   - ✅ Partial indexes with `WHERE deletedAt IS NULL`
   - ✅ Composite indexes on common query paths
   - ✅ Proper index on priority, tier, dates

3. **Schema Design**
   - ✅ Soft deletes implemented
   - ✅ CHECK constraints on data quality
   - ✅ JSON support for metadata

---

## Critical Issues (Must Fix Before RAG)

### 🚨 P0 - Blocking Issues

#### 1. Thread Summary Schema Mismatch

**Issue**: Gateway and memory-service have different `thread_summaries` schemas

**Gateway Schema**:
```sql
CREATE TABLE thread_summaries (
  thread_id TEXT PRIMARY KEY,
  user_id TEXT,
  summary TEXT NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch('now')),
  deleted_at INTEGER
);
```

**Memory Service Schema**:
```sql
CREATE TABLE thread_summaries (
  threadId TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  summary TEXT NOT NULL,
  lastMsgId TEXT,
  tokenCount INTEGER NOT NULL DEFAULT 0,
  updatedAt INTEGER NOT NULL
);
```

**Impact**: 
- Different field names (snake_case vs camelCase)
- Missing fields in each (gateway missing `lastMsgId`, `tokenCount`; memory missing `deleted_at`)
- Agentic RAG needs unified access pattern

**Fix Required**:
```sql
-- Unified schema for both services
CREATE TABLE thread_summaries (
  thread_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  summary TEXT NOT NULL,
  last_msg_id TEXT,
  token_count INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  
  -- Additional fields for RAG
  embedding_id TEXT, -- Reference to embedding when generated
  summary_embedding BLOB -- Cached embedding for fast retrieval
);
```

#### 2. Missing Gateway Database Cleanup

**Issue**: Gateway doesn't close database on shutdown

**Current** (`apps/llm-gateway/src/server.ts`):
```typescript
process.on('SIGTERM', async () => {
  logger.info('Shutting down...');
  await providerPool.close();
  await app.close();
  process.exit(0); // ❌ Database not closed
});
```

**Fix Required**:
```typescript
import { closeDatabase } from './database.js';

process.on('SIGTERM', async () => {
  logger.info('Shutting down...');
  closeDatabase(); // ✅ Add this
  await providerPool.close();
  await app.close();
  process.exit(0);
});
```

#### 3. Missing Indexes for RAG Queries

**Missing Indexes**:

```sql
-- For user queries across threads (RAG will need this)
CREATE INDEX IF NOT EXISTS idx_messages_user_content 
  ON messages(user_id, content) 
  WHERE deleted_at IS NULL;

-- For temporal queries (RAG temporal strategy)
CREATE INDEX IF NOT EXISTS idx_messages_user_time 
  ON messages(user_id, created_at DESC) 
  WHERE deleted_at IS NULL;

-- For thread summaries updates
CREATE INDEX IF NOT EXISTS idx_summaries_updated 
  ON thread_summaries(updated_at DESC) 
  WHERE deleted_at IS NULL;

-- For memory cross-thread queries (RAG multi-hop)
CREATE INDEX IF NOT EXISTS idx_memories_user_created 
  ON memories(userId, createdAt DESC) 
  WHERE deletedAt IS NULL;

-- For entity-based retrieval
CREATE INDEX IF NOT EXISTS idx_memories_entities 
  ON memories(entities) 
  WHERE deletedAt IS NULL AND entities IS NOT NULL;
```

---

### 🟡 P1 - Important Optimizations

#### 4. Add Embedding Storage Columns

**For Agentic RAG**, we need to store embeddings:

```sql
-- Add to memories table
ALTER TABLE memories ADD COLUMN embedding_id TEXT;
ALTER TABLE memories ADD COLUMN embedding BLOB; -- 1536 dimensions × 4 bytes = 6144 bytes
ALTER TABLE memories ADD COLUMN embedding_updated_at INTEGER;

-- Index for embedding lookups
CREATE INDEX IF NOT EXISTS idx_memories_embedding 
  ON memories(embedding_id) 
  WHERE embedding_id IS NOT NULL;

-- Add to thread_summaries
ALTER TABLE thread_summaries ADD COLUMN summary_embedding BLOB;
ALTER TABLE thread_summaries ADD COLUMN embedding_updated_at INTEGER;
```

**Note**: Actual vector search will be in separate vector DB (Qdrant), but we keep embedding_id reference and optionally cache embeddings in SQLite for fast lookup.

#### 5. Enable Full-Text Search (FTS5)

**Why**: RAG needs semantic search, but FTS5 helps with keyword fallback and hybrid search

```sql
-- FTS5 virtual table for messages
CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
  content, 
  thread_id,
  user_id,
  content=messages,
  content_rowid=id
);

-- FTS5 for memories
CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
  content,
  userId,
  threadId,
  content=memories,
  content_rowid=id
);

-- Triggers to keep FTS in sync
CREATE TRIGGER IF NOT EXISTS messages_fts_insert AFTER INSERT ON messages BEGIN
  INSERT INTO messages_fts(rowid, content, thread_id, user_id) 
  VALUES (new.id, new.content, new.thread_id, new.user_id);
END;

CREATE TRIGGER IF NOT EXISTS messages_fts_delete AFTER UPDATE ON messages 
  WHEN new.deleted_at IS NOT NULL BEGIN
  DELETE FROM messages_fts WHERE rowid = new.id;
END;

-- Similar triggers for memories
```

#### 6. Transaction Batching

**Issue**: Message inserts aren't batched in transactions

**Current** (`apps/llm-gateway/src/routes.ts:192-197`):
```typescript
const stmt = db.prepare('INSERT INTO messages (...) VALUES (?, ?, ?, ?, ?)');
for (const msg of body.messages) {
  stmt.run(threadId, userId, msg.role, msg.content, now);
}
```

**Optimized**:
```typescript
const insertMessages = db.transaction((messages, threadId, userId, now) => {
  const stmt = db.prepare('INSERT INTO messages (...) VALUES (?, ?, ?, ?, ?)');
  for (const msg of messages) {
    stmt.run(threadId, userId, msg.role, msg.content, now);
  }
});

insertMessages(body.messages, threadId, userId, now);
```

#### 7. Add Foreign Key Constraints

**Current**: No foreign keys between related tables

**Add**:
```sql
-- In gateway database
-- Note: SQLite foreign keys are deferred by default, need to enable in PRAGMA
PRAGMA foreign_keys = ON;

-- In memory-service database (already has this)
-- Add explicit foreign keys when vector relationships are established
```

#### 8. PRAGMA Alignment

**Gateway Missing**:
```sql
-- Memory-service has these, gateway should too
db.pragma('page_size = 8192'); -- Gateway uses default (4096)
db.pragma('auto_vacuum = INCREMENTAL'); -- Gateway doesn't have this
```

**Fix Gateway PRAGMAs**:
```typescript
// In apps/llm-gateway/src/database.ts
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('temp_store = MEMORY');
db.pragma('mmap_size = 268435456');
db.pragma('cache_size = -80000');
db.pragma('foreign_keys = ON');
db.pragma('page_size = 8192'); // ✅ Add
db.pragma('auto_vacuum = INCREMENTAL'); // ✅ Add
```

---

### 🟢 P2 - Nice-to-Have (Post-RAG)

#### 9. Database Migration System

**Current**: Schema changes require manual SQL

**Recommendation**: Implement migration system before RAG rollout

```typescript
// Example migration system
interface Migration {
  version: number;
  up: (db: Database) => void;
  down: (db: Database) => void;
}

const migrations: Migration[] = [
  {
    version: 1,
    up: (db) => {
      db.exec('ALTER TABLE memories ADD COLUMN embedding_id TEXT');
    },
    down: (db) => {
      // Rollback
    }
  }
];
```

#### 10. Connection Pooling (Future)

**Current**: Singleton connections (works for SQLite)

**Note**: For Agentic RAG sidecar, vector DB (Qdrant) will handle connection pooling. SQLite singleton is fine.

#### 11. Backup Automation

**Current**: Manual backups only

**Recommendation**: Automated daily backups before RAG deployment

---

## Agentic RAG Specific Requirements

### Vector Database Setup

**Separate Vector DB Required**: 
- Agentic RAG sidecar will use **Qdrant** (or pgvector if PostgreSQL)
- SQLite is for reference/metadata only
- Embeddings stored in vector DB for fast similarity search

**SQLite Schema Additions**:
```sql
-- Mapping table: memory_id → vector_id
CREATE TABLE IF NOT EXISTS memory_embeddings (
  memory_id TEXT PRIMARY KEY,
  vector_id TEXT NOT NULL UNIQUE, -- Qdrant point ID
  embedding_generated_at INTEGER NOT NULL,
  embedding_model TEXT NOT NULL DEFAULT 'text-embedding-3-small',
  FOREIGN KEY (memory_id) REFERENCES memories(id)
);

CREATE INDEX IF NOT EXISTS idx_memory_embeddings_vector 
  ON memory_embeddings(vector_id);

-- Graph relationships for multi-hop reasoning
CREATE TABLE IF NOT EXISTS memory_relationships (
  id TEXT PRIMARY KEY,
  source_memory_id TEXT NOT NULL,
  target_memory_id TEXT NOT NULL,
  relationship_type TEXT NOT NULL CHECK(relationship_type IN (
    'same_topic', 'temporal_sequence', 'causal', 
    'contextual', 'entity_related'
  )),
  strength REAL NOT NULL DEFAULT 0.5 CHECK(strength >= 0 AND strength <= 1),
  created_at INTEGER NOT NULL,
  FOREIGN KEY (source_memory_id) REFERENCES memories(id),
  FOREIGN KEY (target_memory_id) REFERENCES memories(id),
  UNIQUE(source_memory_id, target_memory_id, relationship_type)
);

CREATE INDEX IF NOT EXISTS idx_relationships_source 
  ON memory_relationships(source_memory_id, relationship_type);

CREATE INDEX IF NOT EXISTS idx_relationships_target 
  ON memory_relationships(target_memory_id);

CREATE INDEX IF NOT EXISTS idx_relationships_type 
  ON memory_relationships(relationship_type, strength DESC);
```

---

## Optimization Checklist

### Immediate Actions (Before RAG)

- [ ] **Fix thread_summaries schema mismatch**
  - Unify schema across services
  - Add migration to sync existing data
  - Update both service code

- [ ] **Add database cleanup on shutdown**
  - Update gateway server.ts
  - Test graceful shutdown

- [ ] **Add missing indexes**
  - User+content index for RAG queries
  - Temporal indexes for time-based retrieval
  - Entity indexes for entity-based queries

- [ ] **Add embedding storage columns**
  - `embedding_id` reference column
  - Optional `embedding` BLOB cache
  - Embedding timestamp tracking

- [ ] **Enable FTS5**
  - Create FTS virtual tables
  - Add sync triggers
  - Test search performance

- [ ] **Align PRAGMAs**
  - Add `page_size = 8192` to gateway
  - Add `auto_vacuum = INCREMENTAL` to gateway
  - Verify both services match

- [ ] **Implement transaction batching**
  - Wrap message inserts in transactions
  - Batch memory operations
  - Test atomicity

- [ ] **Add memory_embeddings mapping table**
  - For vector DB reference tracking
  - Indexes for fast lookups

- [ ] **Add memory_relationships table**
  - For multi-hop reasoning
  - Indexes for graph traversal

### Short-Term (Week 1 of RAG Implementation)

- [ ] **Database migration system**
  - Framework for schema changes
  - Version tracking
  - Rollback capability

- [ ] **Backup automation**
  - Daily automated backups
  - Point-in-time recovery
  - Backup verification

- [ ] **Query performance monitoring**
  - Slow query logging
  - Index usage analysis
  - Performance metrics

### Long-Term (Post-RAG)

- [ ] **Connection pooling** (if scaling beyond SQLite)
- [ ] **Read replicas** (for high read load)
- [ ] **Sharding strategy** (by user_id if needed)

---

## Migration Plan

### Step 1: Schema Unification

```sql
-- Migration 001: Unify thread_summaries
-- Run on both databases

ALTER TABLE thread_summaries 
  RENAME COLUMN threadId TO thread_id;
ALTER TABLE thread_summaries 
  RENAME COLUMN userId TO user_id;
ALTER TABLE thread_summaries 
  RENAME COLUMN updatedAt TO updated_at;

-- Add missing columns
ALTER TABLE thread_summaries 
  ADD COLUMN last_msg_id TEXT;
ALTER TABLE thread_summaries 
  ADD COLUMN token_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE thread_summaries 
  ADD COLUMN deleted_at INTEGER;

-- Gateway adds: last_msg_id, token_count
-- Memory-service adds: deleted_at
```

### Step 2: Add RAG Columns

```sql
-- Migration 002: Add embedding support
ALTER TABLE memories ADD COLUMN embedding_id TEXT;
ALTER TABLE memories ADD COLUMN embedding_updated_at INTEGER;

ALTER TABLE thread_summaries ADD COLUMN summary_embedding BLOB;
ALTER TABLE thread_summaries ADD COLUMN embedding_updated_at INTEGER;
```

### Step 3: Create New Tables

```sql
-- Migration 003: RAG-specific tables
CREATE TABLE memory_embeddings (...);
CREATE TABLE memory_relationships (...);
```

### Step 4: Add Indexes

```sql
-- Migration 004: Performance indexes
CREATE INDEX idx_messages_user_content ...;
CREATE INDEX idx_memories_embedding ...;
CREATE INDEX idx_relationships_source ...;
-- etc.
```

### Step 5: Enable FTS5

```sql
-- Migration 005: Full-text search
CREATE VIRTUAL TABLE messages_fts ...;
CREATE VIRTUAL TABLE memories_fts ...;
-- Triggers to sync
```

---

## Testing Checklist

Before declaring databases RAG-ready:

- [ ] **Schema consistency test**
  - Both services can read same thread_summaries format
  - No field name mismatches
  - All required fields present

- [ ] **Index effectiveness test**
  - Query plans use new indexes
  - No full table scans on common queries
  - Partial indexes filter correctly

- [ ] **FTS5 functionality test**
  - Search queries return results
  - Triggers keep FTS in sync
  - Performance acceptable

- [ ] **Transaction integrity test**
  - Batch inserts are atomic
  - Rollback works on errors
  - No partial data

- [ ] **Embedding storage test**
  - Can store embedding references
  - Lookups are fast
  - No data corruption

- [ ] **Shutdown test**
  - Database closes cleanly
  - No corruption after shutdown
  - WAL files handled correctly

- [ ] **Performance test**
  - Query latency acceptable (<50ms for simple queries)
  - Index scans perform well
  - No lock contention

---

## Estimated Impact

### Performance Improvements

- **Index additions**: 30-50% faster RAG queries
- **FTS5**: Enables hybrid search (semantic + keyword)
- **Transaction batching**: 20-30% faster bulk inserts
- **PRAGMA alignment**: Consistent performance across services

### RAG Readiness

- **Embedding storage**: Ready for vector DB integration
- **Graph relationships**: Multi-hop reasoning enabled
- **Temporal queries**: Time-based retrieval optimized
- **Cross-thread queries**: User-based indexes ready

---

## Summary

**Current Grade**: 🟡 **B+ (Good, needs optimization)**

**After Fixes**: ✅ **A (Production-ready for RAG)**

**Critical Path**:
1. Fix schema mismatch (1-2 hours)
2. Add indexes (30 minutes)
3. Add RAG columns (30 minutes)
4. Enable FTS5 (1 hour)
5. Test thoroughly (2 hours)

**Total Time**: ~5-6 hours of focused work

**Risk**: Low - all changes are additive or improvements, no breaking changes

---

**Recommendation**: Complete P0 and P1 items before starting Agentic RAG Phase 1. This ensures a solid foundation and avoids rework later.

