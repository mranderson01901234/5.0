# Keyword Recall Optimization Plan

**Date**: 2025-11-03  
**Status**: Audit Complete - Plan Ready for Implementation  
**Current Pass Rate**: 76.5% (13/17 tests)  
**Target Pass Rate**: 95%+ (16+/17 tests)

---

## Executive Summary

The memory recall system currently uses basic LIKE-based keyword matching with simple stop word filtering. While hybrid search (semantic embeddings) works well for most queries, keyword-only fallback and some hybrid queries fail due to:
1. **No phrase matching** - "favorite color" treated as separate words
2. **No query preprocessing** - questions like "what is my favorite color" lose key terms
3. **No synonym expansion** - "preferred" doesn't match "favorite"
4. **FTS5 not utilized** - Full-text search infrastructure exists but unused
5. **Incomplete stop word list** - Missing common question words
6. **Simple relevance scoring** - No term position or frequency weighting

---

## Current Implementation Analysis

### 1. Keyword-Only Search (`keywordOnlySearch`)
**Location**: `apps/memory-service/src/vector-search.ts:272-358`

**Current Flow**:
```
Query → Extract words (length ≥2) → Filter stop words → LIKE %keyword% matching
```

**Issues Identified**:
- ❌ Stop word list excludes important question words: "what", "is", "my", "are", "you"
- ❌ No phrase detection: "favorite color" becomes 2 separate LIKE queries
- ❌ No stemming: "preferred" vs "prefer" don't match
- ❌ No query normalization: question forms lose context
- ❌ Simple relevance = sum of matches (no position weighting)
- ❌ No minimum match threshold

**Test Failures**:
- "what is my favorite color" → 0 results (all words filtered as stop words)

### 2. Hybrid Search (`hybridSearch`)
**Location**: `apps/memory-service/src/vector-search.ts:108-267`

**Current Flow**:
```
Query → Generate embedding → Semantic search → Keyword search → Weighted combine
```

**Issues Identified**:
- ⚠️ Semantic similarity too loose: "deadline" matches "finish... by next month" (false positive)
- ⚠️ Synonym expansion via embeddings: "preferred" matches "favorite" (unintended)
- ⚠️ Keyword weight (0.3) may be too low for precise matches
- ⚠️ No query expansion control

**Test Failures**:
- "deadline" → Matches "finish... by next month" (shouldn't match)
- "preferred language" → Matches "favorite language" (shouldn't match per test spec)
- "coding language" → Matches "programming language" (shouldn't match per test spec)

### 3. FTS5 Infrastructure (Unused)
**Location**: `apps/memory-service/src/db.ts:218-232`, `apps/memory-service/src/ftsSync.ts`

**Status**: 
- ✅ FTS5 table exists (`memories_fts`)
- ✅ Sync mechanism implemented (`FTSSync.syncMemory()`)
- ✅ Search method exists (`FTSSync.search()`)
- ❌ **NOT USED** in recall endpoint

**Capabilities Available**:
- Phrase matching with `"phrase"`
- Boolean operators (AND, OR, NOT)
- Prefix matching with `prefix*`
- Ranked results with relevance scoring
- Tokenization and stemming (basic)

---

## Optimization Plan

### Phase 1: Query Preprocessing (High Priority)

**Goal**: Normalize queries before keyword extraction to improve matching

**Changes**:
1. **Question Normalization**
   - Extract intent from questions: "what is my favorite color" → "favorite color"
   - Remove question words: what, who, where, when, why, how
   - Remove possessive determiners: my, your, his, her, our, their
   - Remove copula verbs: is, are, was, were

2. **Phrase Detection**
   - Detect multi-word phrases: "favorite color", "dark mode", "working on"
   - Extract noun phrases: "UI redesign", "Project Atlas"
   - Keep phrases as single units for matching

3. **Query Expansion (Optional)**
   - Add common synonyms: favorite → preferred, like
   - Add related terms: deadline → finish, complete, due
   - Controlled expansion (only for high-confidence terms)

**Implementation**:
- Create `apps/memory-service/src/query-preprocessor.ts`
- Functions:
  - `normalizeQuery(query: string): string`
  - `extractPhrases(query: string): string[]`
  - `expandQuery(query: string, aggressive: boolean = false): string[]`

**Files to Modify**:
- `apps/memory-service/src/vector-search.ts` (import and use preprocessor)

---

### Phase 2: Enhanced Stop Word List (High Priority)

**Goal**: Improve stop word filtering to preserve meaningful query terms

**Changes**:
1. **Categorize Stop Words**
   - **Question words**: what, who, where, when, why, how (remove in questions)
   - **Articles**: the, a, an (always remove)
   - **Prepositions**: in, on, at, to, for, of, with, from (context-dependent)
   - **Pronouns**: I, you, he, she, it, we, they (context-dependent)
   - **Possessive**: my, your, his, her, our, their (remove in questions)

2. **Context-Aware Filtering**
   - In questions: remove question words, possessives, copulas
   - In statements: keep all meaningful terms
   - Preserve important prepositions: "working on", "prefer over"

**Implementation**:
- Update stop word lists in:
  - `apps/memory-service/src/vector-search.ts:158, 298`
  - `apps/memory-service/src/models.ts:23-29`
  - `apps/memory-service/src/memory-prioritizer.ts:40`

**Files to Modify**:
- Create `apps/memory-service/src/stopwords.ts` (shared stop word lists)
- Update all files to use shared stop word lists

---

### Phase 3: Integrate FTS5 Search (High Priority)

**Goal**: Replace LIKE-based matching with FTS5 for better phrase and relevance matching

**Changes**:
1. **FTS5 Query Construction**
   - Convert user query to FTS5 syntax
   - Handle phrases: "favorite color" → `"favorite color"`
   - Handle keywords: "blue dark mode" → `blue OR "dark mode"`
   - Handle required terms: "must have" → `"must have" AND prefer`

2. **Hybrid FTS5 + Semantic**
   - Use FTS5 for keyword/phrase matching
   - Use semantic embeddings for semantic similarity
   - Combine scores: `FTS5_score * 0.4 + semantic_score * 0.6`

3. **FTS5 Relevance Tuning**
   - Use FTS5 rank() function for relevance
   - Boost exact phrase matches
   - Boost term position (earlier terms = higher relevance)

**Implementation**:
- Modify `keywordOnlySearch()` to use `FTSSync.search()`
- Modify `hybridSearch()` to include FTS5 results
- Update `apps/memory-service/src/vector-search.ts`

**Files to Modify**:
- `apps/memory-service/src/vector-search.ts`
- `apps/memory-service/src/ftsSync.ts` (add query builder)

---

### Phase 4: Improved Relevance Scoring (Medium Priority)

**Goal**: Better ranking of results by relevance to query

**Changes**:
1. **Term Position Weighting**
   - Terms at start of memory = higher score
   - Terms in middle = medium score
   - Terms at end = lower score

2. **Term Frequency Weighting**
   - Multiple occurrences = higher relevance
   - Use TF-IDF-like scoring (but simplified for performance)

3. **Phrase Match Boosting**
   - Exact phrase match = 2x boost
   - Partial phrase match = 1.5x boost
   - Single keyword match = 1x

4. **Tier and Priority Weighting**
   - TIER1 memories = 1.2x boost
   - High priority (>0.8) = 1.1x boost
   - Recent memories (24h) = 1.1x boost

**Implementation**:
- Add scoring functions in `apps/memory-service/src/vector-search.ts`
- Update ranking logic in `hybridSearch()` and `keywordOnlySearch()`

**Files to Modify**:
- `apps/memory-service/src/vector-search.ts`

---

### Phase 5: Query Expansion Control (Low Priority)

**Goal**: Control synonym expansion to reduce false positives

**Changes**:
1. **Synonym Lists**
   - Create controlled synonym dictionary
   - Only expand high-confidence synonyms
   - Don't expand in strict mode

2. **Expansion Modes**
   - **Strict**: No expansion (exact matches only)
   - **Normal**: Limited expansion (common synonyms)
   - **Aggressive**: Full expansion (for difficult queries)

3. **Hybrid Search Tuning**
   - Lower semantic weight for strict queries
   - Higher keyword weight for precise matching
   - Add minimum keyword match threshold

**Implementation**:
- Create `apps/memory-service/src/synonyms.ts`
- Add expansion mode parameter to search functions
- Update recall endpoint to accept `strict` parameter

**Files to Modify**:
- `apps/memory-service/src/vector-search.ts`
- `apps/memory-service/src/routes.ts` (recall endpoint)

---

## Implementation Priority

### Phase 1: Query Preprocessing (Week 1)
**Impact**: Fixes 1/4 failures (question normalization)  
**Effort**: 2-3 days  
**Risk**: Low

**Tasks**:
1. Create `query-preprocessor.ts`
2. Implement question normalization
3. Implement phrase detection
4. Integrate into `keywordOnlySearch()`
5. Test with audit script

**Expected Results**:
- "what is my favorite color" → matches "favorite color is blue"
- Pass rate: 76.5% → 82.4%

### Phase 2: Enhanced Stop Words (Week 1)
**Impact**: Improves keyword extraction quality  
**Effort**: 1 day  
**Risk**: Low

**Tasks**:
1. Create `stopwords.ts` with categorized lists
2. Update all files to use shared stop words
3. Add context-aware filtering
4. Test with audit script

**Expected Results**:
- Better keyword preservation
- Pass rate: 82.4% → 85%

### Phase 3: FTS5 Integration (Week 2)
**Impact**: Fixes phrase matching, improves relevance  
**Effort**: 3-4 days  
**Risk**: Medium (requires testing FTS5 behavior)

**Tasks**:
1. Add FTS5 query builder to `ftsSync.ts`
2. Modify `keywordOnlySearch()` to use FTS5
3. Update `hybridSearch()` to include FTS5
4. Test FTS5 index health
5. Test with audit script

**Expected Results**:
- "favorite color" matches as phrase
- Better relevance ranking
- Pass rate: 85% → 92%

### Phase 4: Relevance Scoring (Week 2)
**Impact**: Improves result ranking  
**Effort**: 2 days  
**Risk**: Low

**Tasks**:
1. Add term position weighting
2. Add phrase match boosting
3. Add tier/priority weighting
4. Update ranking logic
5. Test with audit script

**Expected Results**:
- Better result ordering
- Pass rate: 92% → 94%

### Phase 5: Query Expansion Control (Week 3)
**Impact**: Reduces false positives  
**Effort**: 2-3 days  
**Risk**: Medium (requires tuning expansion)

**Tasks**:
1. Create `synonyms.ts`
2. Add expansion modes
3. Update hybrid search weights
4. Add strict mode to recall endpoint
5. Test with audit script

**Expected Results**:
- Fewer false positives
- Pass rate: 94% → 95%+

---

## Testing Strategy

### 1. Unit Tests
- Test query preprocessing with various question forms
- Test phrase detection with different phrase types
- Test stop word filtering with context
- Test FTS5 query construction

### 2. Integration Tests
- Run `audit_keyword_recall.mjs` after each phase
- Verify pass rate improvements
- Check for regressions

### 3. Performance Tests
- Measure recall latency (<200ms deadline)
- Measure FTS5 query performance
- Compare before/after performance

---

## Risk Assessment

### High Risk
- **FTS5 Integration**: May have compatibility issues, requires thorough testing
- **Query Expansion**: May introduce false positives if too aggressive

### Medium Risk
- **Stop Word Changes**: May affect existing matching behavior
- **Relevance Scoring**: May change result ordering (verify with users)

### Low Risk
- **Query Preprocessing**: Isolated change, easy to test
- **Stop Word Lists**: Centralized, easy to revert

---

## Success Metrics

### Primary Metrics
- **Pass Rate**: 76.5% → 95%+ (target: 16/17 tests)
- **False Negatives**: 1 → 0
- **False Positives**: 3 → 0-1 (acceptable for semantic expansion)

### Secondary Metrics
- **Recall Latency**: Maintain <200ms (current: ~50-100ms)
- **FTS5 Index Health**: 100% sync (currently unknown)
- **Code Maintainability**: Centralized stop words, reusable preprocessing

---

## Rollback Plan

Each phase is independent and can be rolled back:
1. **Phase 1**: Remove query preprocessing, revert to original
2. **Phase 2**: Revert stop word lists to original hardcoded sets
3. **Phase 3**: Keep LIKE-based matching, disable FTS5
4. **Phase 4**: Revert to simple relevance scoring
5. **Phase 5**: Disable query expansion

---

## Next Steps

1. ✅ **Audit Complete** - Identified all issues
2. ✅ **Plan Created** - Comprehensive optimization plan
3. ⏳ **Review Plan** - Double-check plan completeness
4. ⏳ **Get Approval** - User approval before implementation
5. ⏳ **Implement Phase 1** - Start with query preprocessing

---

## Appendix: Current Test Failures

### False Negatives (1)
- "what is my favorite color" → Should match "my favorite color is blue"
  - **Issue**: All words filtered as stop words
  - **Fix**: Query preprocessing (Phase 1)

### False Positives (3)
- "deadline" → Matches "finish... by next month"
  - **Issue**: Semantic similarity too loose
  - **Fix**: Query expansion control (Phase 5), stricter semantic threshold

- "preferred language" → Matches "favorite language"
  - **Issue**: Semantic embeddings expand synonyms
  - **Fix**: Query expansion control (Phase 5), strict mode

- "coding language" → Matches "programming language"
  - **Issue**: Semantic embeddings expand synonyms
  - **Fix**: Query expansion control (Phase 5), strict mode

---

*Plan created by: Memory System Audit*  
*Last updated: 2025-11-03*

