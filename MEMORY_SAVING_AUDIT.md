# Memory Saving Functionality - Comprehensive Audit

**Date:** 2024  
**Scope:** Complete audit of memory saving, recall, prioritization, and persistence features

---

## Executive Summary

The memory system has **basic functionality** for saving and recalling user memories, but **lacks key optimizations** for timestamp-based prioritization, semantic search, and automatic superceding of duplicate memories. The system is functional but not optimized for the requirements.

### Status by Feature

| Feature | Status | Notes |
|---------|--------|-------|
| Explicit Memory Saving | ✅ **Working** | Detects "remember" patterns via QueryAnalyzer |
| Automatic Memory Saving | ✅ **Working** | Audit jobs triggered by cadence tracker |
| Timestamp Storage | ✅ **Working** | Stores createdAt, updatedAt, lastSeenTs |
| Timestamp Prioritization | ⚠️ **Partial** | Uses updatedAt but prioritizes tier/priority first |
| Semantic Search | ❌ **Not Implemented** | Uses keyword matching (LIKE queries) only |
| Superceding Memories | ⚠️ **Partial** | Only deduplicates during recall, not during save |
| Cross-Chat Persistence | ✅ **Working** | userId-based filtering handles this |
| Cross-Login Persistence | ✅ **Working** | userId-based, no explicit login/logout handling needed |

---

## 1. Memory Saving Mechanism

### 1.1 Explicit Memory Saves (User Says "Remember")

**Location:** `apps/llm-gateway/src/routes.ts` (lines 800-1006)

**Status:** ✅ **Working Well**

The system correctly detects explicit memory save requests through:
- `QueryAnalyzer.ts` detects `memory_save` intent
- Multiple regex patterns handle various formats:
  - "remember this" → saves last assistant message
  - "remember that my X" → extracts and saves "my X..."
  - "my X - remember that for me" → extracts content before "remember"
  - "can you remember that idea you gave me" → looks back in conversation
  - Quoted content: "remember 'specific thing'"

**Code Flow:**
```
User Message → QueryAnalyzer.analyzeQuery() → intent === 'memory_save'
→ Extract content via regex patterns
→ POST /v1/memories (memory-service)
→ MemoryModel.create() with priority=0.9, tier='TIER1'
```

**Issues Found:**
- ✅ None - explicit saves work correctly
- All saves get high priority (0.9) and TIER1 classification

---

### 1.2 Automatic Memory Saves (Cadence-Based)

**Location:** `apps/memory-service/src/routes.ts` (lines 670-790)

**Status:** ✅ **Working**

The system automatically saves memories via audit jobs:
1. Messages are emitted to memory-service via `/v1/events/message`
2. `CadenceTracker` monitors message count, tokens, time elapsed
3. When thresholds are met, an audit job is enqueued
4. Audit job processes recent messages and saves those with quality score ≥ 0.65

**Quality Scoring:** `apps/memory-service/src/scorer.ts`
- Formula: `Q = 0.4*relevance + 0.3*importance + 0.2*coherence + 0.1*recency`
- Threshold: 0.65 (QUALITY_THRESHOLD)

**Issues Found:**
- ✅ Works correctly
- Quality scoring is comprehensive

---

## 2. Timestamp Prioritization

### 2.1 Current Implementation

**Location:** `apps/memory-service/src/routes.ts` (lines 337-552)

**Status:** ⚠️ **Partial Implementation**

The `/v1/recall` endpoint does use timestamps in ordering:

```sql
ORDER BY 
  CASE WHEN threadId = ? THEN 0 ELSE 1 END,  -- Same-thread priority
  CASE tier
    WHEN 'TIER1' THEN 1
    WHEN 'TIER2' THEN 2
    WHEN 'TIER3' THEN 3
    ELSE 4
  END,                    -- Tier priority (FIRST)
  priority DESC,          -- Quality score (SECOND)
  updatedAt DESC         -- Timestamp (THIRD - TOO LOW!)
LIMIT ?
```

**Problem:** Timestamp (`updatedAt DESC`) is the **lowest priority** in the ordering. Newer memories are only prioritized if they have the same tier and priority as older ones.

**What Should Happen:**
- Newer memories should be **strongly prioritized** (timestamp-first or timestamp-weighted)
- Recency boost exists (line 412) but only applies when relevance score ≥ 2

**Current Recency Boost:**
```javascript
// Line 412 in routes.ts
const recencyBoost = `CASE WHEN (updatedAt > (strftime('%s', 'now') * 1000 - 86400000)) THEN 1 ELSE 0 END`;

// Only applied when relevance score >= 2
orderBy += `CASE WHEN (${relevanceScore}) >= 2 THEN ${recencyBoost} ELSE 0 END DESC, `;
```

**Issues:**
1. ❌ Timestamp is third priority, not first
2. ⚠️ Recency boost only for high-relevance queries
3. ❌ No prioritization of newly saved memories (createdAt vs updatedAt confusion)

---

### 2.2 Recommended Fix

Prioritize by timestamp more aggressively:

```sql
ORDER BY 
  CASE WHEN threadId = ? THEN 0 ELSE 1 END,
  CASE WHEN updatedAt > (strftime('%s', 'now') * 1000 - 86400000) THEN 0 ELSE 1 END, -- Recent memories first
  CASE tier
    WHEN 'TIER1' THEN 1
    WHEN 'TIER2' THEN 2
    WHEN 'TIER3' THEN 3
    ELSE 4
  END,
  updatedAt DESC,    -- Newer memories preferred within tier
  priority DESC       -- Quality score as tiebreaker
```

**Priority Order:**
1. Same-thread memories
2. **Recently updated (last 24h)** ← ADD THIS
3. Tier (TIER1 > TIER2 > TIER3)
4. **Timestamp (newer first)** ← MOVE UP
5. Priority score (tiebreaker)

---

## 3. Semantic Search & Superceding Memories

### 3.1 Current Search Implementation

**Location:** `apps/memory-service/src/routes.ts` (lines 377-432)

**Status:** ❌ **Keyword-Based Only, No Semantic Search**

The recall endpoint uses:
- **Keyword extraction** (removes stop words)
- **SQL LIKE queries** for matching: `LOWER(content) LIKE ?`
- **Relevance scoring** based on keyword match count

**Example:**
```javascript
// Line 397-399
const keywordConditions = queryKeywords.map((keyword) => {
  params.push(`%${keyword}%`);
  return `(CASE WHEN LOWER(content) LIKE ? THEN 1 ELSE 0 END)`;
});
```

**What's Missing:**
- ❌ No vector embeddings used (despite columns existing in DB)
- ❌ No semantic similarity search
- ❌ No LLM-based relevance ranking
- ❌ Limited to exact keyword matches

**Available Infrastructure (Not Used):**
- `memories.embedding_id` column exists (line 109 in db.ts)
- `memories.embedding` BLOB column exists (line 117 in db.ts)
- `memory_embeddings` table exists (line 158 in db.ts)
- FTS5 (`memories_fts`) exists but only for full-text search, not semantic

---

### 3.2 Superceding Memories (Deduplication)

**Location:** `apps/memory-service/src/routes.ts` (lines 461-517)

**Status:** ⚠️ **Partial - Only During Recall, Not During Save**

The system has deduplication logic but it **only runs during recall**, not during save:

```javascript
// Lines 461-517: Deduplication during recall
const seenTopics = new Map<string, any>();

for (const mem of memories) {
  const content = (mem as any).content.toLowerCase();
  
  // Pattern: "my [attribute] is [value]"
  const attributeMatch = content.match(/my\s+(favorite\s+)?(\w+(?:\s+\w+)?)\s+(?:is|are|was|were)\s+(.+)/);
  if (attributeMatch) {
    const topic = attributeMatch[2]; // e.g., "favorite color"
    const existing = seenTopics.get(topic);
    
    if (existing) {
      // Keep newer one
      if ((mem as any).updatedAt > existing.updatedAt) {
        // Replace older with newer
      }
    }
  }
}
```

**Problems:**
1. ❌ **Only works for specific patterns** ("my favorite color is X")
2. ❌ **Runs during recall, not during save** - duplicate memories are still saved
3. ❌ **No general semantic duplicate detection**
4. ❌ **No cross-thread duplicate detection during save**

**What Should Happen:**
1. **During Save:** Check for semantically similar existing memories
2. **If duplicate found:** Update existing memory's `updatedAt` and `lastSeenTs`, increment `repeats`, add threadId to `threadSet`
3. **If not duplicate:** Create new memory

**Current Behavior:**
- ✅ Deduplication during recall (filters results)
- ❌ No deduplication during save (allows duplicates)
- ❌ No semantic similarity check

---

### 3.3 Recommended Implementation

**Add semantic duplicate detection during save:**

```typescript
// In MemoryModel.create() or routes.ts POST /v1/memories

async function findSimilarMemory(
  userId: string,
  content: string,
  similarityThreshold: number = 0.85
): Promise<Memory | null> {
  // Option 1: Use embeddings (if available)
  // Option 2: Use FTS5 similarity (BM25)
  // Option 3: Use keyword overlap + content similarity
  
  // For now, implement keyword-based similarity:
  const keywords = extractKeywords(content);
  
  // Find memories with high keyword overlap
  const candidates = db.prepare(`
    SELECT * FROM memories
    WHERE userId = ? AND deletedAt IS NULL
    ORDER BY updatedAt DESC
    LIMIT 20
  `).all(userId);
  
  for (const candidate of candidates) {
    const candidateKeywords = extractKeywords(candidate.content);
    const overlap = calculateOverlap(keywords, candidateKeywords);
    const contentSimilarity = calculateContentSimilarity(content, candidate.content);
    
    if (overlap > 0.7 && contentSimilarity > similarityThreshold) {
      return candidate; // Found duplicate
    }
  }
  
  return null;
}

// In POST /v1/memories handler:
const similar = await findSimilarMemory(userId, contentToSave);
if (similar) {
  // Update existing memory instead of creating new
  memoryModel.updateCrossThread(similar.id, threadId);
  return reply.send(similar);
}
```

**For Semantic Search (Future):**
1. Generate embeddings using OpenAI `text-embedding-3-small`
2. Store in `memory_embeddings` table
3. Use vector similarity search (cosine similarity)
4. Integrate Qdrant or similar vector DB (infrastructure exists)

---

## 4. Persistence Across Chats & Sessions

### 4.1 Cross-Chat Persistence

**Status:** ✅ **Working Correctly**

Memories are filtered by `userId`:
- All queries include `WHERE userId = ?`
- Memories persist across different threads (chats)
- `threadId` is stored but memories are accessible across threads

**Evidence:**
```sql
-- routes.ts line 392
WHERE userId = ? AND deletedAt IS NULL
```

**No Issues Found** ✅

---

### 4.2 Cross-Login Persistence

**Status:** ✅ **Working Correctly**

Since memories are filtered by `userId` (not session-based), they automatically persist:
- ✅ Across login/logout cycles
- ✅ Across device changes (if userId is consistent)
- ✅ Across browser sessions

**Authentication:**
- `userId` comes from `req.user.id` (Fastify auth plugin)
- Must be consistent across sessions for persistence to work

**No Issues Found** ✅

---

## 5. Summary of Issues & Recommendations

### Critical Issues

1. **❌ Semantic Search Not Implemented**
   - **Current:** Keyword-based LIKE queries
   - **Needed:** Vector embeddings + similarity search
   - **Impact:** Low relevance recall, misses semantically similar memories

2. **⚠️ Timestamp Prioritization Too Weak**
   - **Current:** Timestamp is 3rd priority (after tier and priority)
   - **Needed:** Recent memories should be strongly prioritized
   - **Impact:** Older memories may be recalled over newer ones

3. **❌ No Superceding During Save**
   - **Current:** Deduplicates only during recall
   - **Needed:** Detect and update duplicates during save
   - **Impact:** Duplicate memories accumulate in database

### Medium Priority Issues

4. **⚠️ Limited Deduplication Patterns**
   - **Current:** Only handles "my [attribute] is [value]" patterns
   - **Needed:** General semantic duplicate detection
   - **Impact:** Many duplicates slip through

5. **⚠️ Recency Boost Only for High Relevance**
   - **Current:** Only applies when relevance score ≥ 2
   - **Needed:** Apply recency boost more broadly
   - **Impact:** Recent memories not prioritized in low-keyword queries

### Low Priority / Enhancements

6. **📝 Embedding Infrastructure Exists But Unused**
   - Columns and tables exist but no code uses them
   - Opportunity: Implement vector search

7. **📝 FTS5 Available But Limited**
   - FTS5 exists for full-text search
   - Could be used for better keyword matching

---

## 6. Recommended Implementation Plan

### Phase 1: Fix Timestamp Prioritization (Quick Win)

**File:** `apps/memory-service/src/routes.ts` (lines 404-453)

**Change:**
1. Move recency check to top of ORDER BY clause
2. Prioritize `updatedAt DESC` more heavily
3. Apply recency boost to all queries, not just high-relevance

**Estimated Effort:** 2-4 hours

---

### Phase 2: Add Superceding Logic During Save (High Impact)

**Files:**
- `apps/memory-service/src/models.ts` (add `findSimilarMemory()`)
- `apps/memory-service/src/routes.ts` (POST /v1/memories handler)

**Implementation:**
1. Add keyword-based similarity detection
2. Check for duplicates before creating new memory
3. If duplicate found, update existing instead of creating new
4. Update `updatedAt`, `lastSeenTs`, `repeats`, `threadSet`

**Estimated Effort:** 1-2 days

---

### Phase 3: Implement Semantic Search (Future)

**Files:**
- New: `apps/memory-service/src/embeddings.ts`
- Update: `apps/memory-service/src/routes.ts` (recall endpoint)
- Update: `apps/memory-service/src/models.ts`

**Implementation:**
1. Generate embeddings using OpenAI API
2. Store in `memory_embeddings` table
3. Implement cosine similarity search
4. Integrate into recall endpoint

**Estimated Effort:** 3-5 days

---

## 7. Code Locations Reference

| Feature | File | Lines |
|---------|------|-------|
| Explicit Memory Save Detection | `apps/llm-gateway/src/routes.ts` | 800-1006 |
| Query Analysis | `apps/llm-gateway/src/QueryAnalyzer.ts` | 1-135 |
| Memory Recall Endpoint | `apps/memory-service/src/routes.ts` | 337-552 |
| Memory Model (CRUD) | `apps/memory-service/src/models.ts` | 20-307 |
| Quality Scoring | `apps/memory-service/src/scorer.ts` | 1-352 |
| Database Schema | `apps/memory-service/src/db.ts` | 26-213 |
| FTS Sync | `apps/memory-service/src/ftsSync.ts` | 1-211 |
| Audit Job Handler | `apps/memory-service/src/routes.ts` | 670-900 |

---

## 8. Testing Recommendations

### Test Cases to Add

1. **Timestamp Prioritization:**
   - Save memory A (old)
   - Save memory B (new, same tier/priority)
   - Verify B is recalled before A

2. **Superceding During Save:**
   - Save "my favorite color is blue"
   - Save "my favorite color is red" (same user)
   - Verify only one memory exists (red, updatedAt = recent)

3. **Cross-Chat Persistence:**
   - Save memory in thread 1
   - Query memories from thread 2
   - Verify memory is accessible

4. **Semantic Similarity (when implemented):**
   - Save "I prefer Python over Java"
   - Query "What's my favorite programming language?"
   - Verify memory is recalled

---

## Conclusion

The memory system is **functionally working** but **not optimized** for the requirements:
- ✅ Basic save/recall works
- ⚠️ Timestamp prioritization needs improvement
- ❌ Semantic search not implemented
- ⚠️ Superceding only works partially

**Priority Actions:**
1. Fix timestamp prioritization (quick win)
2. Add superceding logic during save (high impact)
3. Implement semantic search (future enhancement)

