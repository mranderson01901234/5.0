# Manual Chat Testing Guide - Database Optimizations

This guide helps you verify that all database optimizations are working correctly in the chat interface.

## Prerequisites

1. **Start both services**:
   ```bash
   # Terminal 1: Gateway
   cd apps/llm-gateway && pnpm dev
   
   # Terminal 2: Memory Service
   cd apps/memory-service && pnpm dev
   
   # Terminal 3: Web UI
   cd apps/web && pnpm dev
   ```

2. **Open the chat interface** in your browser (usually `http://localhost:5173`)

---

## Test 1: Transaction Batching (Message Inserts)

**What we're testing**: Messages should be saved atomically in transactions, improving performance.

**Steps**:
1. Start a new conversation
2. Send **multiple messages quickly** (type and send 3-4 messages within 5 seconds):
   ```
   Message 1: "Hello, I need help with TypeScript"
   Message 2: "Specifically, I'm working on async functions"
   Message 3: "Can you explain promises?"
   Message 4: "And async/await syntax?"
   ```

**Expected Result**:
- ✅ All messages should be saved correctly
- ✅ No partial message saves (either all saved or none)
- ✅ Response should acknowledge previous context
- ✅ Check gateway logs - should see transaction commits

**Verify in Database**:
```bash
# Check messages were saved atomically
sqlite3 gateway.db "SELECT COUNT(*) FROM messages WHERE thread_id = '<your-thread-id>';"
# Should show 4 user messages + assistant responses
```

---

## Test 2: Thread Summary Schema (Unified Schema)

**What we're testing**: Memory-service can write thread summaries with unified schema (user_id, last_msg_id, token_count).

**Steps**:
1. Have a conversation with at least **6 messages** (this triggers memory audit):
   ```
   User: "I love working with React hooks"
   Assistant: [response]
   User: "useState and useEffect are my favorites"
   Assistant: [response]
   User: "I'm building a todo app"
   Assistant: [response]
   User: "What's the best way to manage state?"
   ```

2. Wait ~30 seconds for memory-service to process and create summary

**Expected Result**:
- ✅ Thread summary should be created in gateway DB
- ✅ Summary should have `user_id` populated (not NULL)
- ✅ Check that memory-service wrote successfully

**Verify in Database**:
```bash
# Check thread_summaries has new columns
sqlite3 gateway.db "SELECT thread_id, user_id, summary, last_msg_id, token_count, updated_at FROM thread_summaries ORDER BY updated_at DESC LIMIT 1;"

# Should show:
# - thread_id: [your thread]
# - user_id: [your user id, NOT NULL]
# - summary: [generated summary text]
# - last_msg_id: [may be NULL initially]
# - token_count: [should be >= 0]
```

---

## Test 3: RAG Indexes Performance

**What we're testing**: New indexes should improve query performance for user-based searches.

**Steps**:
1. Create **multiple conversations** across different topics:
   - Conversation A: "Tell me about Python programming"
   - Conversation B: "What are the best React patterns?"
   - Conversation C: "Explain Docker containers"

2. Switch between conversations quickly
3. Ask follow-up questions in each thread

**Expected Result**:
- ✅ Fast conversation switching
- ✅ Context maintained across threads
- ✅ No noticeable lag when loading previous messages

**Verify Index Usage** (optional):
```bash
# Check index exists
sqlite3 gateway.db ".indexes"

# Should see:
# - idx_messages_user_content
# - idx_messages_user_time
# - idx_summaries_updated
# - idx_summaries_embedding
```

---

## Test 4: FTS5 Full-Text Search

**What we're testing**: Full-text search enables hybrid (keyword + semantic) search capability.

**Steps**:
1. Have a conversation with specific technical terms:
   ```
   User: "I'm using TypeScript with React hooks"
   User: "I need help with useEffect dependencies"
   User: "How do I prevent infinite loops in React?"
   ```

2. Later, search for related content (if search feature exists)

**Expected Result**:
- ✅ FTS5 virtual table should be created
- ✅ Messages should be indexed for full-text search

**Verify FTS5**:
```bash
# Check FTS5 table exists
sqlite3 gateway.db "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%_fts';"

# Should show: messages_fts

# Test FTS5 search (if you have messages)
sqlite3 gateway.db "SELECT rowid, content FROM messages_fts WHERE messages_fts MATCH 'TypeScript' LIMIT 5;"
```

---

## Test 5: Database Cleanup on Shutdown

**What we're testing**: Database should close gracefully when gateway shuts down.

**Steps**:
1. Start a conversation and send a few messages
2. **Gracefully shutdown gateway** (Ctrl+C or SIGTERM)
3. Check logs for cleanup message

**Expected Result**:
- ✅ Gateway logs should show: `"Shutting down..."`
- ✅ Database connection should close cleanly
- ✅ No database lock errors
- ✅ Can restart gateway without issues

**Verify Shutdown**:
```bash
# After shutdown, check gateway.db-wal exists (WAL mode working)
ls -la gateway.db*

# Should show:
# - gateway.db (main database)
# - gateway.db-wal (WAL file, if there were uncommitted writes)
# - gateway.db-shm (shared memory file)

# Restart gateway - should work without "database is locked" errors
```

---

## Test 6: Memory Service Embedding Columns

**What we're testing**: Memory service can store embedding references for RAG.

**Steps**:
1. Have a conversation with 6+ messages (triggers audit)
2. Wait for memory-service to process and save memories

**Expected Result**:
- ✅ Memories should be saved with embedding columns available
- ✅ New columns: `embedding_id`, `embedding`, `embedding_updated_at`

**Verify in Memory DB**:
```bash
sqlite3 data/memory.db "PRAGMA table_info(memories);"

# Should show columns:
# - embedding_id (TEXT)
# - embedding (BLOB)
# - embedding_updated_at (INTEGER)

# Check if memories table has new columns
sqlite3 data/memory.db "SELECT id, content, embedding_id FROM memories LIMIT 3;"
```

---

## Test 7: RAG Tables (memory_embeddings, memory_relationships)

**What we're testing**: New RAG-specific tables exist and are ready for vector DB integration.

**Steps**:
1. No user action needed - tables should exist after memory-service starts

**Expected Result**:
- ✅ Tables should be created automatically
- ✅ Foreign keys configured correctly

**Verify Tables**:
```bash
sqlite3 data/memory.db "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('memory_embeddings', 'memory_relationships');"

# Should show:
# memory_embeddings
# memory_relationships

# Check schema
sqlite3 data/memory.db "PRAGMA table_info(memory_embeddings);"
sqlite3 data/memory.db "PRAGMA table_info(memory_relationships);"
```

---

## Test 8: Cross-Service Schema Alignment

**What we're testing**: Memory-service can write to gateway's thread_summaries using unified schema.

**Steps**:
1. Have multiple conversations (2-3 different threads)
2. Each conversation should have 6+ messages
3. Wait for memory-service to generate summaries

**Expected Result**:
- ✅ All summaries in gateway DB should have `user_id` populated
- ✅ No NULL user_id values
- ✅ Memory-service can successfully write to gateway DB

**Verify Alignment**:
```bash
# Check all summaries have user_id (should be no NULLs)
sqlite3 gateway.db "SELECT COUNT(*) FROM thread_summaries WHERE user_id IS NULL;"
# Should return: 0

# Check recent summaries
sqlite3 gateway.db "SELECT thread_id, user_id, LENGTH(summary) as summary_len, token_count, updated_at FROM thread_summaries ORDER BY updated_at DESC LIMIT 5;"
```

---

## Quick Verification Checklist

Run these commands to quickly verify everything:

```bash
# 1. Gateway DB - Check unified schema
sqlite3 gateway.db "PRAGMA table_info(thread_summaries);" | grep -E "(thread_id|user_id|last_msg_id|token_count|embedding)"

# 2. Gateway DB - Check indexes
sqlite3 gateway.db ".indexes" | grep -E "(user_content|user_time|summaries_updated|summaries_embedding)"

# 3. Gateway DB - Check FTS5
sqlite3 gateway.db "SELECT name FROM sqlite_master WHERE name LIKE '%_fts';"

# 4. Memory DB - Check embedding columns
sqlite3 data/memory.db "PRAGMA table_info(memories);" | grep -E "(embedding_id|embedding)"

# 5. Memory DB - Check RAG tables
sqlite3 data/memory.db "SELECT name FROM sqlite_master WHERE name IN ('memory_embeddings', 'memory_relationships');"

# 6. Memory DB - Check indexes
sqlite3 data/memory.db ".indexes" | grep -E "(memories_embedding|relationships)"

# 7. Check PRAGMAs
sqlite3 gateway.db "PRAGMA journal_mode; PRAGMA page_size; PRAGMA auto_vacuum;"
# Should show: wal, 8192 (or 4096), 2 (incremental)
```

---

## Expected Test Results Summary

| Test | What It Validates | Success Criteria |
|------|------------------|------------------|
| 1. Transaction Batching | Atomic message saves | All messages saved, no partial writes |
| 2. Thread Summary Schema | Unified schema | user_id NOT NULL, new columns present |
| 3. RAG Indexes | Query performance | Fast conversation loading |
| 4. FTS5 | Full-text search | messages_fts table exists and functional |
| 5. Database Cleanup | Graceful shutdown | No lock errors on restart |
| 6. Embedding Columns | RAG readiness | New columns in memories table |
| 7. RAG Tables | Vector DB mapping | memory_embeddings & relationships exist |
| 8. Schema Alignment | Cross-service writes | All summaries have user_id |

---

## Troubleshooting

**Issue**: "database is locked" errors
- **Solution**: Check if gateway shutdown properly, restart services

**Issue**: Thread summaries not being created
- **Solution**: Ensure memory-service is running and can connect to gateway DB

**Issue**: Missing columns in schema
- **Solution**: The migrations run automatically on startup - check logs for warnings

**Issue**: FTS5 not working
- **Solution**: FTS5 requires SQLite with FTS5 extension - this is optional and won't break functionality

---

## Next Steps After Testing

Once all tests pass:
1. ✅ Databases are RAG-ready
2. ✅ Ready for vector DB integration (Qdrant)
3. ✅ Ready for embedding generation
4. ✅ Ready for multi-hop reasoning (graph relationships)

