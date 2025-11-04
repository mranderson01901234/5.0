# Web Search Functionality Comprehensive Audit

**Date**: 2025-01-27  
**Objective**: Identify why users are receiving outdated information instead of current data from the Brave API

---

## Executive Summary

This audit reveals **critical bugs** and design issues causing stale data to be returned to users:

1. **🔴 CRITICAL: Cache Key Mismatch Bug** - Cached research capsules are never retrieved due to incorrect cache key generation
2. **🟡 HIGH: Missing Freshness Parameters** - Recency hints not always properly mapped to Brave API freshness parameters
3. **🟡 HIGH: Overly Long Cache TTLs** - Cache durations too long for time-sensitive queries (30-60 min for news)
4. **🟡 MEDIUM: Weak Topic Classification** - Simple keyword matching misses many time-sensitive queries
5. **🟡 MEDIUM: Dual Search Systems** - Two independent search paths create inconsistency

---

## 1. Search System Architecture

### System Components

The codebase has **two separate search systems** that operate independently:

#### System A: Research Pipeline (Memory Service)
- **Trigger**: Memory review batches (async, background)
- **Flow**: Topic extraction → Research job → Brave API → Capsule → Cache → Redis
- **Usage**: Used for future context injection via early-window polling
- **Location**: `apps/memory-service/src/research/pipeline/`

#### System B: Immediate Web Search (Memory Service)
- **Trigger**: Direct user queries via LLM Gateway
- **Flow**: Query → Brave API → LLM composition → Stream to user
- **Usage**: Real-time search results streamed directly to user
- **Location**: `apps/memory-service/src/webSearch.ts`

**Issue**: These two systems don't share cache or coordinate, leading to inconsistent freshness.

### Search Decision Logic

**Location**: `apps/llm-gateway/src/routes.ts` (lines 178-298)

The `needsWebSearch()` function uses pattern matching to determine if a query needs web search:

```typescript
// Strong indicators
/\b(latest|recent|current|today|this week|this month|now|news|breaking|just announced|just released)\b/i
/\b(when did|when will|when was)\s+(.*?)\s+(happen|happened|announce|announced|release|released|launch|launched)\b/i
/\b(price|cost|buy|availability|stock|deal|discount|on sale)\b/i
```

**Issues**:
1. **Too Conservative**: Only triggers on explicit time-sensitive keywords
2. **Missing Patterns**: Queries like "What's the current state of X?" may not trigger
3. **No LLM Validation**: Relies solely on regex patterns

---

## 2. Critical Bugs Identified

### Bug #1: Cache Key Mismatch (CRITICAL) 🔴 ✅ FIXED

**Location**: `apps/memory-service/src/research/cache.ts`

**Problem**:
```typescript
// Line 81: Storing cache with empty recency and normQuery
const key = generateCacheKey(capsule.topic, ttlClass as TTLClass, '', '');
```

But when retrieving:
```typescript
// Line 49: Using actual recency and normQuery values
const key = generateCacheKey(topic, ttlClass, recency, normQuery);
```

**Impact**: 
- **Cached capsules are NEVER found** - cache lookups always miss
- System always hits Brave API (or returns stale data from wrong cache entry)
- Cache TTLs are completely ineffective

**Root Cause**: The cache key generation includes `recency` and `normQuery` parameters, but when storing, these are passed as empty strings. When retrieving, actual values are used, creating different keys.

**Fix Applied**: 
- Updated `cacheCapsule()` function signature to accept `recencyHint` and `normQuery` parameters
- Updated cache key generation to use actual values instead of empty strings
- Updated call site in `runResearchPipeline()` to pass correct parameters

**Status**: ✅ Fixed in commit (files updated: `cache.ts`, `index.ts`)

### Bug #2: Freshness Parameter Not Always Sent 🟡

**Location**: `apps/memory-service/src/research/fetchers/brave.ts`

**Problem**:
```typescript
// Line 407: mapRecencyToFreshness may return undefined
const freshness = mapRecencyToFreshness(job.recencyHint);

// Line 408-412: Only appends freshness if it exists
braveItems = await fetchBrave(job.normQuery, {
  count: 8,
  freshness,  // May be undefined!
  timeout: 900,
});
```

**Impact**:
- If `recencyHint` is not 'day', 'week', or 'month', no freshness parameter is sent to Brave API
- Brave API defaults to general search (no recency filter)
- Users get older results even for time-sensitive queries

**Root Cause**: The mapping function only handles three specific values:
```typescript
export function mapRecencyToFreshness(recency: string): string | undefined {
  switch (recency) {
    case 'day': return 'pd';
    case 'week': return 'pw';
    case 'month': return 'pm';
    default: return undefined;  // ❌ Returns undefined for other values
  }
}
```

**Additional Issue**: Default `recencyHint` is 'month' for general topics, but should be more aggressive for time-sensitive queries.

### Bug #3: Topic Extraction Too Weak 🟡

**Location**: `apps/memory-service/src/topicExtractor.ts`

**Problem**: Simple keyword matching may miss time-sensitive queries:

```typescript
// Lines 63-75: Very basic keyword matching
if (NEWS_KEYWORDS.some(kw => recentContent.includes(kw.toLowerCase()))) {
  ttlClass = 'news/current';
  recencyHint = 'day';
} else {
  ttlClass = 'general';
  recencyHint = 'month';  // ❌ Defaults to month even for recent queries
}
```

**Impact**:
- Queries like "What happened with OpenAI this week?" may not match keywords
- Falls back to 'general' with 'month' recency
- Results are stale even when query is time-sensitive

**Example Queries That Fail**:
- "Updates on climate change" (no 'today', 'latest', 'news' keywords)
- "Recent AI developments" (doesn't match NEWS_KEYWORDS exactly)
- "What's new with Tesla?" (no explicit time keywords)

---

## 3. Caching Analysis

### Cache TTL Configuration

**Location**: `apps/memory-service/src/research/cache.ts` (lines 14-20)

```typescript
const TTL_MAP: Record<TTLClass, { min: number; max: number }> = {
  'news/current': { min: 30 * 60, max: 60 * 60 },      // 30-60 minutes ⚠️
  'pricing': { min: 24 * 60 * 60, max: 24 * 60 * 60 }, // 24 hours ⚠️
  'releases': { min: 72 * 60 * 60, max: 72 * 60 * 60 }, // 72 hours
  'docs': { min: 7 * 24 * 60 * 60, max: 7 * 24 * 60 * 60 }, // 7 days
  'general': { min: 30 * 24 * 60 * 60, max: 30 * 24 * 60 * 60 }, // 30 days ⚠️
};
```

**Issues**:
1. **News cache too long**: 30-60 minutes for news is too long for breaking news
2. **Pricing cache too long**: 24 hours for pricing can miss daily price changes
3. **General cache way too long**: 30 days means users get month-old data for general queries

### Cache Key Structure

**Cache Key Format**: `CAPS:v2:${topicHash}:${ttlClass}:${recency}:${queryHash}`

**Problem with Bug #1**: The `recency` and `queryHash` parts don't match between store/retrieve.

**Impact**: Even with correct TTLs, cache never works due to key mismatch.

---

## 4. Brave API Integration

### API Configuration

**Location**: `apps/memory-service/src/research/fetchers/brave.ts`

**Endpoint**: `https://api.search.brave.com/res/v1/web/search`

**Request Parameters**:
```typescript
const searchParams = new URLSearchParams({
  q: query,
  count: count.toString(),
});

if (freshness) {  // ⚠️ Only added if explicitly provided
  searchParams.append('freshness', freshness);
}
```

**Issues**:
1. Freshness parameter is optional - may not be sent
2. No default freshness for time-sensitive queries
3. Timeout is 900ms (0.9 seconds) - may be too short for some queries

### Freshness Mapping

**Supported Values**: `'pd'` (past day), `'pw'` (past week), `'pm'` (past month)

**Problem**: If `recencyHint` is not exactly 'day', 'week', or 'month', no freshness filter is applied to Brave API request.

**Example**:
- Query: "What's the latest news about OpenAI?"
- Topic extraction may miss keywords → `ttlClass = 'general'`, `recencyHint = 'month'`
- But user clearly wants recent info, not month-old results

### Error Handling

**Retry Logic** (lines 126-132):
```typescript
// Retry once on 429 or 5xx
if (error.message.includes('Rate limited') || error.message.includes('Server error')) {
  logger.info({ query }, 'Retrying Brave fetch after error');
  await new Promise(resolve => setTimeout(resolve, 500));
  return fetchBrave(query, { ...options, timeout: Math.max(timeout - 500, 100) });
}
```

**Issues**:
- Only retries once
- No exponential backoff
- Timeout reduction on retry may cause issues

---

## 5. User Experience Flow

### Immediate Web Search Flow

**Path**: User Query → LLM Gateway → Memory Service `/v1/web-search/stream` → Brave API → Stream to User

**Steps**:
1. User sends query via chat
2. `needsWebSearch()` decides to search
3. Gateway calls `/v1/web-search/stream`
4. Memory service calls Brave API with freshness parameter
5. Results filtered by date (7 days max)
6. LLM composes response and streams to user

**Freshness Strategy** (lines 214-248):
```typescript
const requestedFreshness = determineFreshness(query.trim());  // 'pd', 'pw', or 'pm'

// Try requested freshness first
items = await fetchBrave(searchQuery, { freshness: requestedFreshness });

// Cascade: if few results, try broader freshness
if (items.length < 3 && requestedFreshness === 'pd') {
  items = await fetchBrave(searchQuery, { freshness: 'pw' });
}
```

**Issue**: Good cascading strategy, but `determineFreshness()` function is too conservative (only matches specific keywords).

### Research Pipeline Flow

**Path**: Memory Review → Topic Extraction → Research Job → Cache Check → Brave API → Capsule → Cache → Redis

**Steps**:
1. Memory review triggers on batch
2. Topic extracted with `ttlClass` and `recencyHint`
3. Research job created
4. **Cache lookup** (currently broken due to Bug #1)
5. If cache miss, fetch from Brave API
6. Build capsule and cache it
7. Publish to Redis for early-window injection

**Issue**: Cache never works due to key mismatch, so always hits API or uses wrong cached data.

---

## 6. Specific Test Scenarios Analysis

### Test Case 1: "What's the latest news about OpenAI?"

**Expected Flow**:
1. `needsWebSearch()` should return `true` (contains 'latest')
2. `/v1/web-search/stream` called
3. `determineFreshness()` should return `'pd'` (past day)
4. Brave API called with `freshness=pd`
5. Recent results returned

**Actual Flow**:
- ✅ Step 1: Works (matches 'latest' pattern)
- ✅ Step 2: Works
- ✅ Step 3: Works (matches 'latest' keyword)
- ✅ Step 4: Works (freshness parameter sent)
- ✅ Step 5: Should work, but if cache used, may get stale data

**Verdict**: Should work correctly for immediate web search, but research pipeline may cache stale data.

### Test Case 2: "Who won the Super Bowl this year?"

**Expected Flow**:
1. `needsWebSearch()` should return `true` (contains 'this year')
2. Freshness should be 'pw' or 'pm' (week/month)
3. Brave API should return recent results

**Actual Flow**:
- ✅ Step 1: Works (matches 'this year' pattern)
- ✅ Step 2: May default to 'pm' (past month) if 'this year' not in keywords
- ⚠️ Step 3: May get older results if freshness defaults

**Verdict**: May work, but freshness determination may be suboptimal.

### Test Case 3: "What's the current price of Bitcoin?"

**Expected Flow**:
1. Should trigger search (price keyword)
2. Freshness should be aggressive ('pd' or 'pw')
3. Topic extraction should set `ttlClass = 'pricing'`, `recencyHint = 'week'`

**Actual Flow**:
- ✅ Step 1: Works (matches 'price' keyword)
- ✅ Step 2: Works (determineFreshness() matches 'price')
- ✅ Step 3: Works (topic extraction matches PRICING_KEYWORDS)
- ⚠️ **But**: Research pipeline cache may return stale pricing data (24 hour TTL)

**Verdict**: Works but may serve cached pricing data up to 24 hours old.

---

## 7. Root Cause Analysis

### Why Users Get Outdated Information

**Primary Causes**:

1. **Cache Key Mismatch (Bug #1)**
   - Cached capsules stored with key: `CAPS:v2:{topic}:{ttlClass}::` (empty recency/query)
   - Cache lookup uses key: `CAPS:v2:{topic}:{ttlClass}:{recency}:{queryHash}` (actual values)
   - **Result**: Cache misses always occur → Wrong cached data used OR API always called with wrong freshness

2. **Weak Freshness Detection**
   - `determineFreshness()` only matches specific keywords
   - Misses queries like "updates on X", "recent Y", "what happened with Z"
   - Defaults to 'pm' (past month) for unmatched queries
   - **Result**: Time-sensitive queries get month-old results

3. **Overly Long Cache TTLs**
   - News: 30-60 minutes (should be 5-15 minutes for breaking news)
   - Pricing: 24 hours (should be 1-6 hours for volatile prices)
   - General: 30 days (should be 1-7 days)
   - **Result**: Even when cache works, data is stale

4. **Topic Classification Misses**
   - Simple keyword matching misses nuanced queries
   - No LLM-based classification for ambiguous cases
   - Falls back to 'general' with 'month' recency
   - **Result**: Time-sensitive topics classified as general

---

## 8. Configuration Issues

### Environment Variables

**Location**: `apps/memory-service/src/config.ts`

**Key Variables**:
- `BRAVE_API_KEY` - Required for search
- `RESEARCH_SIDECAR_ENABLED=true` - Enables research
- `FEATURE_RESEARCH_INJECTION` - Enables injection
- `FEATURE_NEWSDATA_FALLBACK` - Fallback to NewsData API

**No Configuration For**:
- Cache TTL overrides
- Freshness default values
- Topic classification sensitivity
- Brave API timeout values

### API Configuration

**Current Settings**:
- Timeout: 900ms (0.9 seconds) - may be too short
- Count: 8 results per query
- Freshness: Optional (only if recencyHint matches)

**Missing Settings**:
- Region/market parameter
- SafeSearch level configuration
- Result count limits
- Retry count configuration

---

## 9. Performance Analysis

### Cache Hit/Miss Rates

**Current State**: **Cache miss rate is effectively 100%** due to Bug #1 (cache key mismatch)

**Expected State** (after fixes):
- News queries: 70-80% cache hits (with 5-15 min TTL)
- Pricing queries: 60-70% cache hits (with 1-6 hour TTL)
- General queries: 80-90% cache hits (with 1-7 day TTL)

### API Usage Patterns

**From Logs**: Frequent timeouts and rate limits observed:
```
Brave fetch timeout
Brave API rate limited
Retrying Brave fetch after error
```

**Issues**:
- Timeout too short (900ms)
- No rate limit handling beyond single retry
- No request queuing or throttling

---

## 10. Recommendations

### Immediate Fixes (1-3 days) 🔴

1. **Fix Cache Key Mismatch**
   ```typescript
   // apps/memory-service/src/research/cache.ts line 81
   // BEFORE:
   const key = generateCacheKey(capsule.topic, ttlClass as TTLClass, '', '');
   
   // AFTER:
   const key = generateCacheKey(capsule.topic, ttlClass as TTLClass, job.recencyHint, job.normQuery);
   ```
   **Impact**: Cache will actually work, reducing API calls and ensuring correct data retrieval.

2. **Reduce Cache TTLs**
   ```typescript
   // apps/memory-service/src/research/cache.ts
   'news/current': { min: 5 * 60, max: 15 * 60 },    // 5-15 minutes (was 30-60)
   'pricing': { min: 1 * 60 * 60, max: 6 * 60 * 60 }, // 1-6 hours (was 24 hours)
   'general': { min: 1 * 24 * 60 * 60, max: 7 * 24 * 60 * 60 }, // 1-7 days (was 30 days)
   ```
   **Impact**: Users get fresher data, especially for news and pricing.

3. **Improve Freshness Detection**
   ```typescript
   // apps/memory-service/src/webSearch.ts
   function determineFreshness(query: string): 'pd' | 'pw' | 'pm' {
     const queryLower = query.toLowerCase();
     
     // Add more patterns
     const recentPatterns = [
       'latest', 'recent', 'current', 'today', 'now', 'breaking',
       'updates on', 'what happened', 'new developments', 'just', 'this week'
     ];
     
     const weekPatterns = [
       'this week', 'past week', 'recently', 'lately', 'this month'
     ];
     
     // Use regex for better matching
     if (recentPatterns.some(p => new RegExp(p, 'i').test(queryLower))) {
       return 'pd';
     }
     if (weekPatterns.some(p => new RegExp(p, 'i').test(queryLower))) {
       return 'pw';
     }
     
     // Default to week instead of month for better freshness
     return 'pw';  // Changed from 'pm'
   }
   ```
   **Impact**: Better freshness detection for time-sensitive queries.

### Short-term Improvements (1-2 weeks) 🟡

4. **Add Default Freshness for Time-Sensitive Queries**
   ```typescript
   // apps/memory-service/src/research/fetchers/brave.ts
   export function mapRecencyToFreshness(recency: string, ttlClass?: TTLClass): string | undefined {
     switch (recency) {
       case 'day': return 'pd';
       case 'week': return 'pw';
       case 'month': return 'pm';
       default:
         // For time-sensitive classes, default to week instead of undefined
         if (ttlClass === 'news/current' || ttlClass === 'pricing') {
           return 'pw';
         }
         return 'pm';  // Instead of undefined
     }
   }
   ```
   **Impact**: Ensures freshness parameter is always sent for time-sensitive queries.

5. **Enhance Topic Extraction**
   - Add LLM-based classification for ambiguous queries
   - Improve keyword matching with better patterns
   - Add context awareness (check previous messages for time indicators)

6. **Improve Error Handling**
   - Add exponential backoff for retries
   - Implement request queuing for rate limits
   - Increase timeout for complex queries
   - Add fallback to broader freshness if timeouts occur

### Long-term Enhancements (1-2 months) 🟢

7. **Unify Search Systems**
   - Share cache between research pipeline and immediate web search
   - Coordinate freshness settings
   - Implement cache warming for popular queries

8. **Add User Feedback Mechanisms**
   - Show timestamp of search results
   - Allow users to request fresh search
   - Display cache status to users
   - Provide "refresh" button for stale results

9. **Advanced Query Processing**
   - LLM-based intent detection
   - Contextual freshness inference
   - Multi-source search integration
   - Personalized freshness preferences

---

## 11. Test Scenarios After Fixes

### Test Case: "What's the latest news about OpenAI?"

**Expected After Fixes**:
1. ✅ Cache key matches → Cache works correctly
2. ✅ Freshness detected as 'pd' → Recent results
3. ✅ Cache TTL 5-15 min → Data stays fresh
4. ✅ If cache hit, data is recent (within TTL)

### Test Case: "What's the current price of Bitcoin?"

**Expected After Fixes**:
1. ✅ Topic classified as 'pricing'
2. ✅ Freshness set to 'pw' (past week)
3. ✅ Cache TTL 1-6 hours → Fresh pricing data
4. ✅ Cache key matches → Retrieves correct cached data

---

## 12. Metrics to Monitor

### After Implementing Fixes

1. **Cache Hit Rate**
   - Target: >60% for news, >70% for general
   - Monitor: Cache hits vs. misses per TTL class

2. **Result Freshness**
   - Target: >90% of results <24 hours old for news queries
   - Monitor: Average age of results returned to users

3. **API Usage**
   - Target: 30-40% reduction in Brave API calls
   - Monitor: API calls per day, rate limit encounters

4. **User Satisfaction**
   - Target: Reduced complaints about stale data
   - Monitor: User feedback, search refresh requests

---

## Conclusion

The root causes of outdated information are:

1. **🔴 CRITICAL**: Cache key mismatch bug prevents cache from working
2. **🟡 HIGH**: Weak freshness detection defaults to month-old results
3. **🟡 HIGH**: Overly long cache TTLs serve stale data even when cache works
4. **🟡 MEDIUM**: Simple topic classification misses time-sensitive queries

**Priority Actions**:
1. Fix cache key mismatch (immediate)
2. Reduce cache TTLs (immediate)
3. Improve freshness detection (immediate)
4. Enhance topic extraction (short-term)

After implementing these fixes, users should receive current, up-to-date information from the Brave API effectively.

