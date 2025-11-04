# Database Infrastructure Audit Report

**Date**: 2025-11-01  
**Scope**: Complete database infrastructure across all services  
**Auditor**: AI Assistant

---

## Executive Summary

This audit examines the database infrastructure across the entire application, including schema design, connection management, query patterns, configuration, data integrity, and potential issues.

**Key Findings**:
- ✅ **Proper SQLite setup** with WAL mode for concurrent access
- ✅ **Optimized PRAGMAs** for performance (WAL, mmap, cache)
- ✅ **Comprehensive indexing** on critical query paths
- ⚠️ **CRITICAL**: Empty database files detected (0 bytes)
- ⚠️ **CRITICAL**: No schema migrations system
- ⚠️ **CRITICAL**: Missing foreign key constraints between services
- ⚠️ **ARCHITECTURE**: Multiple overlapping database files
- ⚠️ **DATA**: No thread_summaries in gateway.db despite code expecting them

---

## Database Infrastructure Overview

### Database Files Inventory

| Path | Size | Purpose | Status |
|------|------|---------|--------|
| `apps/llm-gateway/gateway.db` | **0 bytes** | Gateway messages & summaries | ❌ **EMPTY** |
| `apps/llm-gateway/gateway.db.backup` | 652K | Backup of gateway data | ✅ Has data (414 messages) |
| `apps/llm-gateway/data/memory.db` | 60K | Memory service data (in gateway dir) | ⚠️ Misplaced |
| `apps/memory-service/gateway.db` | **0 bytes** | Gateway DB copy for memory service | ❌ **EMPTY** |
| `apps/memory-service/data/memory.db` | 60K | Memory service primary DB | ✅ Has data |

**Critical Issue**: Two empty gateway.db files exist. The backup contains actual data.

### Service-to-Database Mapping

| Service | Primary DB | Secondary DB | Purpose |
|---------|------------|--------------|---------|
| **llm-gateway** | `gateway.db` | `data/memory.db` | Messages, thread summaries |
| **memory-service** | `data/memory.db` | `gateway.db` | Memories, audits, summaries |

**Architectural Issue**: Both services share similar database names with different content, causing confusion.

---

## Schema Analysis

### 1. LLM Gateway Database Schema

**File**: `apps/llm-gateway/src/database.ts`

#### Tables

##### `messages`
```sql
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id TEXT NOT NULL,
  user_id TEXT,
  role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch('now')),
  meta JSON,
  important INTEGER NOT NULL DEFAULT 0,
  provider TEXT,
  model TEXT,
  tokens_input INTEGER,
  tokens_output INTEGER,
  deleted_at INTEGER
);
```

**Issues**:
- ⚠️ **Missing indexes** on `user_id` alone
- ⚠️ **No full-text search** on `content`
- ✅ Has proper `deleted_at` for soft deletes
- ✅ Includes token tracking

##### `thread_summaries`
```sql
CREATE TABLE IF NOT EXISTS thread_summaries (
  thread_id TEXT PRIMARY KEY,
  user_id TEXT,
  summary TEXT NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch('now')),
  deleted_at INTEGER
);
```

**Issues**:
- ⚠️ **No actual data** in current gateway.db
- ✅ Proper primary key on `thread_id`
- ⚠️ No indexes on `updated_at` alone

#### Indexes

```sql
CREATE INDEX IF NOT EXISTS idx_messages_thread_time ON messages(thread_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_user_thread ON messages(user_id, thread_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_summaries_user ON thread_summaries(user_id) WHERE deleted_at IS NULL;
```

**Missing Indexes**:
- `messages(user_id)` - Common filter in conversation listings
- `messages(provider)` - Provider analytics
- `thread_summaries(updated_at)` - Sorting by recency

### 2. Memory Service Database Schema

**File**: `apps/memory-service/src/db.ts`

#### Tables

##### `memories`
```sql
CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  threadId TEXT NOT NULL,
  content TEXT NOT NULL CHECK(length(content) <= 1024),
  entities TEXT,
  priority REAL NOT NULL DEFAULT 0.5 CHECK(priority >= 0 AND priority <= 1),
  confidence REAL NOT NULL DEFAULT 0.5 CHECK(confidence >= 0 AND confidence <= 1),
  redactionMap TEXT,
  tier TEXT CHECK(tier IN('TIER1','TIER2','TIER3')) DEFAULT 'TIER3',
  sourceThreadId TEXT,
  repeats INTEGER DEFAULT 1,
  threadSet TEXT,
  lastSeenTs INTEGER,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  deletedAt INTEGER
);
```

**Strengths**:
- ✅ Comprehensive field coverage
- ✅ Proper CHECK constraints on priority/confidence
- ✅ Content length limit enforced
- ✅ Tier enum enforced

##### `memory_audits`
```sql
CREATE TABLE IF NOT EXISTS memory_audits (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  threadId TEXT NOT NULL,
  startMsgId TEXT,
  endMsgId TEXT,
  tokenCount INTEGER NOT NULL CHECK(tokenCount >= 0),
  score REAL NOT NULL,
  saved INTEGER NOT NULL CHECK(saved >= 0),
  createdAt INTEGER NOT NULL
);
```

**Note**: Matches audit requirements

##### `thread_summaries`
```sql
CREATE TABLE IF NOT EXISTS thread_summaries (
  threadId TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  summary TEXT NOT NULL,
  lastMsgId TEXT,
  tokenCount INTEGER NOT NULL DEFAULT 0,
  updatedAt INTEGER NOT NULL
);
```

**Issue**: ❌ **Schema mismatch** with gateway version (different fields!)

#### Indexes (Memory Service)

✅ Comprehensive indexing:
- `idx_memories_user_thread` - User + thread queries
- `idx_memories_priority` - Quality sorting
- `idx_memories_created` - Recency
- `idx_memories_user_tier` - Tier-based queries
- `idx_memories_last_seen` - Recency tracking
- `idx_audits_user_thread` - Audit history
- `idx_summaries_user` - Summary lookups

**Excellent**: Partial indexes with `WHERE deletedAt IS NULL` optimize query performance.

---

## Configuration & PRAGMAs

### LLM Gateway PRAGMAs

```typescript
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('temp_store = MEMORY');
db.pragma('mmap_size = 268435456'); // 256MB
db.pragma('cache_size = -80000'); // ~80MB
db.pragma('foreign_keys = ON');
```

✅ **Excellent configuration**:
- WAL mode enables concurrent reads during writes
- NORMAL sync balances performance and safety
- Large mmap improves I/O performance
- Foreign keys enforced for integrity

### Memory Service PRAGMAs

```typescript
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('temp_store = MEMORY');
db.pragma('mmap_size = 268435456'); // 256MB
db.pragma('cache_size = -80000'); // ~80MB
db.pragma('page_size = 8192');
db.pragma('auto_vacuum = INCREMENTAL');
```

**Differences**:
- ✅ Extra `page_size` specification
- ✅ `auto_vacuum = INCREMENTAL` for better maintenance

---

## Connection Management

### LLM Gateway

**File**: `apps/llm-gateway/src/database.ts`

```typescript
let db: Database.Database | null = null;

export function getDatabase(): Database.Database {
  if (!db) {
    // Initialize singleton
  }
  return db;
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}
```

**Issues**:
- ⚠️ **No graceful shutdown handler** in server.ts calls `closeDatabase()`
- ✅ Singleton pattern prevents multiple connections
- ⚠️ **No connection pooling** (one global connection)

**Server shutdown**:
```typescript
// apps/llm-gateway/src/server.ts - NO DATABASE CLEANUP
process.on('SIGTERM', async () => {
  logger.info('Shutting down...');
  await providerPool.close();
  await app.close();
  process.exit(0); // ❌ Database not closed
});
```

### Memory Service

**File**: `apps/memory-service/src/server.ts`

```typescript
async function start() {
  const db = createDatabase(DB_PATH);
  
  // Also open gateway DB connection
  let gatewayDb: Database.Database | null = null;
  try {
    gatewayDb = new Database(GATEWAY_DB_PATH);
  } catch (error: any) {
    logger.warn('Failed to connect to gateway database');
  }
  
  // Graceful shutdown
  const shutdown = async () => {
    await app.close();
    await closeRedis();
    db.close(); // ✅ Closes memory DB
    if (gatewayDb) {
      gatewayDb.close(); // ✅ Closes gateway DB
    }
  };
}
```

**Strictly Better**: Proper cleanup on shutdown.

---

## Query Patterns & Performance

### LLM Gateway Queries

**Analysis**: `apps/llm-gateway/src/routes.ts`

#### Message Insertion (High Frequency)
```typescript
const stmt = db.prepare('INSERT INTO messages (...) VALUES (?, ?, ?, ?, ?)');
for (const msg of body.messages) {
  stmt.run(threadId, userId, msg.role, msg.content, now);
}
```

**Issues**:
- ⚠️ **No transaction** - Multiple inserts aren't atomic
- ⚠️ **Prepared statement reused** in loop (good) but no batching
- ⚠️ **No error recovery** if one insert fails

**Improvement**:
```typescript
const insertMany = db.transaction((messages, threadId, userId, now) => {
  const stmt = db.prepare('INSERT INTO messages (...) VALUES (?, ?, ?, ?, ?)');
  for (const msg of messages) {
    stmt.run(threadId, userId, msg.role, msg.content, now);
  }
});
```

#### Conversation Listing (Critical Path)
```typescript
const conversations = db.prepare(`
  SELECT DISTINCT thread_id, MIN(created_at), MAX(created_at)
  FROM messages
  WHERE user_id = ? AND deleted_at IS NULL
  GROUP BY thread_id
  ORDER BY updated_at DESC
`).all(userId);
```

**Issues**:
- ⚠️ **Inefficient**: DISTINCT + GROUP BY for same data
- ⚠️ **Missing index** on `(user_id, thread_id, deleted_at, created_at)`
- ⚠️ Uses `MAX(created_at)` but aliases to `updated_at`

#### Thread Summaries (Lookup)
```typescript
const summary = db.prepare(`
  SELECT summary FROM thread_summaries
  WHERE thread_id = ? AND deleted_at IS NULL
`).get(conv.thread_id);
```

✅ **Efficient**: Single-row lookup with proper WHERE clause.

### Memory Service Queries

**Analysis**: `apps/memory-service/src/models.ts`

#### Memory Listing (With Filters)
```typescript
list(query: ListMemoriesQuery): { memories: Memory[]; total: number } {
  let sql = 'SELECT * FROM memories WHERE userId = ?';
  const params: unknown[] = [query.userId];
  
  if (query.threadId) {
    sql += ' AND threadId = ?';
    params.push(query.threadId);
  }
  
  if (!query.includeDeleted) {
    sql += ' AND deletedAt IS NULL';
  }
  
  if (query.minPriority !== undefined) {
    sql += ' AND priority >= ?';
    params.push(query.minPriority);
  }
  
  // Count + pagination
  const countResult = this.db.prepare(sql.replace('SELECT *', 'SELECT COUNT(*) as count')).get(...params);
  sql += ' ORDER BY priority DESC, createdAt DESC LIMIT ? OFFSET ?';
  params.push(query.limit, query.offset);
  
  return { memories: this.db.prepare(sql).all(...params), total };
}
```

**Issues**:
- ⚠️ **Dynamic SQL building** - SQL injection risk if `minPriority` validated poorly
- ⚠️ **Two queries** - Could use window functions
- ✅ Proper parameterization
- ✅ Partial index usage

**Improvement**:
```typescript
const countResult = this.db.prepare(sql.replace('SELECT *', 'SELECT COUNT(*)')).get(...params);
const memories = this.db.prepare(sql + ' LIMIT ? OFFSET ?').all(...params, limit, offset);
```

---

## Data Integrity Issues

### 1. Missing Foreign Keys

**Critical**: No foreign key relationships between:
- `messages.thread_id` → `thread_summaries.thread_id`
- `memories.threadId` → `thread_summaries.threadId`

**Impact**: Orphaned records possible, no referential integrity.

### 2. No Unique Constraints

**Issue**: `memory_audits` allows duplicate audits for same thread window.

**Fix**: Add unique constraint on `(userId, threadId, startMsgId, endMsgId)` or composite key.

### 3. Thread Summary Schema Mismatch

**LLM Gateway**:
```sql
thread_summaries (
  thread_id TEXT PRIMARY KEY,
  user_id TEXT,
  summary TEXT NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch('now')),
  deleted_at INTEGER
)
```

**Memory Service**:
```sql
thread_summaries (
  threadId TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  summary TEXT NOT NULL,
  lastMsgId TEXT,
  tokenCount INTEGER NOT NULL DEFAULT 0,
  updatedAt INTEGER NOT NULL
)
```

**Critical**: Completely different schemas! Same table name, incompatible structures.

### 4. Soft Delete Inconsistency

- Gateway `messages`: Uses `deleted_at INTEGER`
- Gateway `thread_summaries`: Uses `deleted_at INTEGER`
- Memory `memories`: Uses `deletedAt INTEGER`

**Issue**: Mixed naming conventions (`deleted_at` vs `deletedAt`), inconsistent querying.

---

## Missing Features

### 1. No Schema Migrations

**Impact**: 
- Schema changes require manual SQL
- No version tracking
- No rollback capability
- Production schema drift risk

**Recommendation**: Add migration system (node-sqlite3 migrations, `better-sqlite3-migrations`, or custom).

### 2. No Connection Pooling

**Current**: One singleton connection per service.

**Impact**: 
- Better-sqlite3 supports concurrent reads (WAL), but single writer
- Potential lock contention under heavy write load
- No graceful degradation

**Recommendation**: For high write loads, consider connection pool or read replicas.

### 3. No Full-Text Search

**Missing**: FTS5 indexes on:
- `messages.content` (chat search)
- `memories.content` (memory search)
- `thread_summaries.summary` (conversation search)

**Recommendation**: Enable FTS for semantic search capability.

### 4. No Backup Strategy

**Current**: Manual backup files only (`gateway.db.backup`).

**Missing**:
- Automated daily backups
- Point-in-time recovery
- Backup verification
- Offsite storage

### 5. No Database Monitoring

**Missing**:
- Connection pool metrics
- Query performance tracking
- Lock contention monitoring
- Disk usage alerts
- Slow query logs

---

## Critical Issues Summary

### P0 - Production Blocking

#### ISSUE-001: Empty Database Files
**Location**: `apps/llm-gateway/gateway.db`, `apps/memory-service/gateway.db`  
**Severity**: CRITICAL  
**Impact**: Application has no conversation history in current databases

**Root Cause**: Unknown - backup file has data but current files are empty.

**Remediation**:
1. Investigate why main database files are empty
2. Restore from backup if necessary
3. Implement data recovery procedures
4. Add automated backups

#### ISSUE-002: Thread Summary Schema Mismatch
**Location**: `apps/llm-gateway/src/database.ts` vs `apps/memory-service/src/db.ts`  
**Severity**: CRITICAL  
**Impact**: Services share table name but have incompatible schemas

**Remediation**:
1. Unify schema design
2. Use separate table names if schemas must differ
3. Add foreign keys to link properly

#### ISSUE-003: No Gateway Database Cleanup
**Location**: `apps/llm-gateway/src/server.ts`  
**Severity**: HIGH  
**Impact**: Database connections not closed on shutdown

**Remediation**:
```typescript
import { closeDatabase } from './database.js';

process.on('SIGTERM', async () => {
  logger.info('Shutting down...');
  closeDatabase(); // Add this
  await providerPool.close();
  await app.close();
  process.exit(0);
});
```

### P1 - Important Issues

#### ISSUE-004: Missing Foreign Keys
**Impact**: No referential integrity enforcement

**Remediation**: Add foreign key constraints between related tables.

#### ISSUE-005: No Transaction Batching
**Impact**: Multiple inserts aren't atomic, performance overhead

**Remediation**: Wrap bulk inserts in transactions.

#### ISSUE-006: No Migration System
**Impact**: Schema changes require manual intervention

**Remediation**: Implement database migration framework.

#### ISSUE-007: No Full-Text Search
**Impact**: Search capabilities limited to exact matches

**Remediation**: Enable FTS5 on text columns.

---

## Positive Aspects

### ✅ Excellent Practices

1. **WAL Mode**: Proper use of Write-Ahead Logging for concurrency
2. **Partial Indexes**: WHERE clauses on deleted fields optimize queries
3. **CHECK Constraints**: Priority, confidence bounds enforced at DB level
4. **Soft Deletes**: Consistent pattern across tables
5. **Comprehensive Indexing**: Memory service has excellent index coverage
6. **Type Safety**: Better-sqlite3 provides strong typing
7. **Connection Singletons**: Prevents connection leaks

### ✅ Well-Designed Schema

- Memories table with proper normalization
- Audit trail tracking
- Thread summaries for quick lookups
- Token and metadata tracking

---

## Performance Considerations

### Current Performance Profile

**Read Performance**: ✅ Excellent
- WAL mode enables concurrent reads
- Partial indexes reduce scan size
- Proper query parameterization

**Write Performance**: ⚠️ Adequate
- Single writer (SQLite limitation)
- No batching for bulk inserts
- No connection pooling

**Scalability**: ⚠️ Limitations
- SQLite not designed for high write concurrency
- Single-file database
- No horizontal scaling

### Optimization Opportunities

1. **Batch Writes**: Wrap message inserts in transactions
2. **Read Replicas**: Future architecture for read-heavy workloads
3. **Query Optimization**: Add missing indexes (user_id, updated_at)
4. **FTS5**: Enable full-text search for better search UX
5. **Connection Pool**: For future distributed architecture

---

## Recommendations

### Immediate Actions (P0)

1. ✅ **Investigate empty database files** - critical data loss risk
2. ✅ **Close database on shutdown** - prevent corruption
3. ✅ **Implement migrations** - enable safe schema evolution
4. ✅ **Add foreign keys** - enforce referential integrity

### Short-Term Improvements (P1)

1. ✅ **Add missing indexes** - improve query performance
2. ✅ **Enable FTS5** - semantic search capabilities
3. ✅ **Implement backup automation** - data protection
4. ✅ **Add query monitoring** - identify bottlenecks

### Long-Term Architecture (P2)

1. ✅ **Connection pool design** - for multi-instance deployment
2. ✅ **Read replicas** - scale read queries
3. ✅ **Sharding strategy** - by user_id or date
4. ✅ **Consider PostgreSQL** - if write concurrency needed

---

## Testing Recommendations

### Unit Tests Needed

1. **Database connection lifecycle** - open, query, close
2. **Transaction integrity** - rollback on errors
3. **Index usage** - verify query plans use indexes
4. **Soft delete queries** - ensure deleted records excluded
5. **Schema validation** - CHECK constraints enforced

### Integration Tests Needed

1. **Multi-service database sync** - gateway ↔ memory-service
2. **Concurrent read/write** - verify WAL mode works
3. **Database migration** - schema evolution tests
4. **Backup/restore** - data integrity verification
5. **Failure scenarios** - disk full, corruption handling

---

## Conclusion

The database infrastructure is **architecturally sound** with proper SQLite configuration, indexing, and schema design. However, **critical operational issues** exist:

1. **Empty database files** indicate data loss or startup problems
2. **No graceful shutdown** risks corruption
3. **Schema mismatches** between services cause integration issues
4. **Missing migrations** makes schema evolution risky

**Priority**: Fix P0 issues immediately before deployment. Implement P1 improvements for production reliability.

**Overall Grade**: **B-** (Good design, operational gaps)

---

**Report Status**: COMPLETE  
**Next Steps**: 
1. Investigate and fix empty database files
2. Add database cleanup on shutdown
3. Implement migration system
4. Unify thread_summaries schema
5. Add automated backups
6. Enable monitoring

---

**Auditor**: AI Assistant  
**Artifacts**: 
- `DATABASE_INFRASTRUCTURE_AUDIT.md` (this report)
- `apps/llm-gateway/src/database.ts` (schema reference)
- `apps/memory-service/src/db.ts` (schema reference)

