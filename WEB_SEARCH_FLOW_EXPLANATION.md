# How Web Search Works from Chat - Flow Explanation

## User Query Flow: "search the web" or Similar Queries

### Complete Flow Diagram

```
User Types Query
    ↓
Chat UI (CenterComposer.tsx)
    ↓
useChatStream().send()
    ↓
POST /v1/chat/stream (LLM Gateway)
    ↓
needsWebSearch() checks query patterns
    ↓ (if true)
POST /v1/web-search/stream (Memory Service)
    ↓
determineFreshness() analyzes query keywords
    ↓
fetchBrave() → Brave API with freshness parameter
    ↓
Filter results (keep only last 7 days)
    ↓
LLM composes response (composeSearchResponseStream)
    ↓
Stream SSE events back to user
    ↓
Chat UI displays results
```

---

## The Problem: Why You Got Outdated Results

### Issue #1: Weak Freshness Detection

**Location**: `apps/memory-service/src/webSearch.ts` (lines 18-50)

The `determineFreshness()` function only matches specific keywords:

```typescript
function determineFreshness(query: string): 'pd' | 'pw' | 'pm' {
  const queryLower = query.toLowerCase();
  
  // Only matches these EXACT patterns
  const recentKeywords = [
    'latest', 'newest', 'recent', 'today', 'just', 'now', 
    'breaking', 'breaking news', 'just announced', 'just released',
    'this hour', 'this minute', 'latest news', 'current events',
    'what happened today', 'what just happened'
  ];
  
  // If NO keywords match → defaults to 'pm' (past MONTH)
  return 'pm';  // ❌ This is the problem!
}
```

**What Happens When You Say "search the web":**
1. Query: "search the web for latest AI news"
2. `determineFreshness()` checks for keywords
3. Finds "latest" → returns `'pd'` (past day) ✅ Works

**What Happens When You Say "what's happening with X":**
1. Query: "what's happening with OpenAI?"
2. `determineFreshness()` checks for keywords
3. NO keywords match (no "latest", "today", "recent")
4. Returns `'pm'` (past MONTH) ❌ Gets month-old results!

**What Happens When You Say "search the web":**
1. Query: "search the web about climate change"
2. `determineFreshness()` checks for keywords
3. NO keywords match
4. Returns `'pm'` (past MONTH) ❌ Gets month-old results!

---

### Issue #2: Research Pipeline Cache Bug (My Fix)

**Note**: This affects background research, not immediate web search, but it's related.

**Before Fix:**
- Research pipeline cached capsules with wrong cache key
- Cache lookups always failed
- System either:
  - Always called Brave API (good for freshness, bad for performance)
  - OR used wrong cached data (bad for freshness)

**After Fix:**
- Cache keys now match between store/retrieve
- Background research can use cached data correctly
- Fresh data when cache expires

---

## Current Behavior: Immediate Web Search

The `/v1/web-search/stream` endpoint (used by chat) does **NOT use cache**:

```typescript
// apps/memory-service/src/webSearch.ts
app.post('/v1/web-search/stream', async (req, reply) => {
  // NO cache lookup - always calls Brave API directly
  const requestedFreshness = determineFreshness(query.trim());
  
  items = await fetchBrave(searchQuery, {
    freshness: requestedFreshness,  // May be 'pm' (past month)!
    timeout: 5000,
  });
  
  // Filter to keep only last 7 days
  const recentItems = items.filter(item => {
    // Only keeps items from last 7 days
  });
});
```

**So the issue is:**
1. Query doesn't match freshness keywords → `determineFreshness()` returns `'pm'`
2. Brave API called with `freshness=pm` → returns up to month-old results
3. Date filter keeps only last 7 days → but Brave already filtered to month-old content
4. **Result**: You get month-old (or week-old) results even though you wanted current info

---

## Examples of Problematic Queries

### Query: "search the web about Bitcoin price"
- **Pattern match**: "price" → should match pricing keywords, but...
- **determineFreshness()**: Doesn't have "price" in recentKeywords → returns `'pm'`
- **Result**: Month-old Bitcoin prices ❌

### Query: "what's new with Tesla?"
- **Pattern match**: "what's new" → not in recentKeywords
- **determineFreshness()**: Returns `'pm'`
- **Result**: Month-old Tesla news ❌

### Query: "search the web for recent developments"
- **Pattern match**: "recent" → in recentKeywords! ✅
- **determineFreshness()**: Returns `'pd'` (past day)
- **Result**: Current results ✅

---

## How My Fix Helps (Indirectly)

The cache fix I made doesn't directly fix immediate web search, but it helps the **background research pipeline**:

1. **Before**: Background research cache was broken → stale data
2. **After**: Background research cache works → can provide fresh context

However, **the immediate web search still has the freshness detection issue**.

---

## What Needs to Be Fixed for Immediate Web Search

### Fix #1: Improve Freshness Detection

**Current Problem**:
```typescript
// Only matches exact keywords
const recentKeywords = ['latest', 'today', ...];

// Defaults to month for unmatched queries
return 'pm';  // ❌ Too conservative
```

**Fix Needed**:
```typescript
function determineFreshness(query: string): 'pd' | 'pw' | 'pm' {
  const queryLower = query.toLowerCase();
  
  // More patterns
  const recentPatterns = [
    /\b(latest|newest|recent|today|just|now|breaking)\b/i,
    /\b(what'?s?\s+new|what'?s?\s+happening|current|updates?)\b/i,
    /\b(search\s+the\s+web|web\s+search|search\s+for)\b/i,  // Explicit search requests
    /\b(this\s+week|past\s+week|recently|lately)\b/i,
  ];
  
  const weekPatterns = [
    /\b(this\s+month|past\s+month|recent\s+updates)\b/i,
  ];
  
  // Check patterns instead of exact keywords
  if (recentPatterns.some(pattern => pattern.test(query))) {
    return 'pd';  // Past day
  }
  
  if (weekPatterns.some(pattern => pattern.test(query))) {
    return 'pw';  // Past week
  }
  
  // Default to week instead of month for better freshness
  return 'pw';  // ✅ Changed from 'pm'
}
```

### Fix #2: Make "search the web" Always Fresh

**Add Special Handling**:
```typescript
function determineFreshness(query: string): 'pd' | 'pw' | 'pm' {
  const queryLower = query.toLowerCase();
  
  // Explicit search requests should always be fresh
  if (/\b(search\s+the\s+web|web\s+search|search\s+for|look\s+up)\b/i.test(query)) {
    return 'pd';  // Always use past day for explicit searches
  }
  
  // ... rest of logic
}
```

---

## Summary

### Why You Got Outdated Results

1. **Weak Keyword Matching**: `determineFreshness()` only matches exact keywords like "latest", "today"
2. **Default to Past Month**: Queries without keywords default to `'pm'` (past month)
3. **No Special Handling**: "search the web" doesn't trigger fresh search
4. **Brave API Filter**: When `freshness=pm` is sent, Brave returns month-old results

### What I Fixed

1. **Cache Key Bug**: Fixed research pipeline cache (background research)
2. **This helps indirectly**: Background research now works correctly

### What Still Needs Fixing

1. **Freshness Detection**: Make it smarter (use regex, add patterns)
2. **Default Behavior**: Default to `'pw'` (week) instead of `'pm'` (month)
3. **Explicit Search**: "search the web" should always use `'pd'` (past day)

### Quick Test

Try these queries:
- ✅ "what's the latest news about OpenAI?" → Should work (has "latest")
- ❌ "search the web about Bitcoin" → Gets month-old results
- ❌ "what's happening with Tesla?" → Gets month-old results

The second two will now work better after improving `determineFreshness()`.



