# Web Search Freshness Fix

**Issue**: Web search was producing stale results because it always used "past month" freshness parameter.

**Root Cause**: `apps/memory-service/src/webSearch.ts` was hardcoded to use `freshness: 'pm'` (past month) for all queries, regardless of query intent.

---

## Fix Applied

### 1. Added Dynamic Freshness Detection

Created `determineFreshness()` function that analyzes query keywords to determine appropriate freshness:

**Past Day (`pd`)** - For very recent queries:
- Keywords: `latest`, `newest`, `recent`, `today`, `just`, `now`, `breaking`, `breaking news`, `just announced`, `just released`, `this hour`, `this minute`, `latest news`, `current events`, `what happened today`, `what just happened`

**Past Week (`pw`)** - For weekly queries:
- Keywords: `this week`, `past week`, `recently`, `lately`, `latest developments`, `recent updates`

**Past Month (`pm`)** - Default for general queries:
- Used when no time-specific keywords detected

### 2. Updated Web Search Endpoint

Modified `registerWebSearchRoute()` to:
- Call `determineFreshness(query)` instead of hardcoding `'pm'`
- Pass dynamic freshness to Brave API
- Log which freshness level is being used

---

## Example Behavior

**Before** (All queries):
```
Query: "latest AI news"
Freshness: 'pm' (past month) ❌
Result: Could be 3 weeks old
```

**After** (Query-aware):
```
Query: "latest AI news"
Freshness: 'pd' (past day) ✅
Result: Last 24 hours only

Query: "this week's AI updates"  
Freshness: 'pw' (past week) ✅
Result: Last 7 days

Query: "explain React hooks"
Freshness: 'pm' (past month) ✅
Result: General content, last 30 days
```

---

## Testing

### Test Recent Query
```bash
curl -X POST http://localhost:3001/v1/web-search \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test" \
  -H "x-user-id: test" \
  -d '{"query": "latest AI news"}'
```

**Expected**: Results should be from last 24 hours (check dates in response)

### Test Weekly Query
```bash
curl -X POST http://localhost:3001/v1/web-search \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test" \
  -H "x-user-id: test" \
  -d '{"query": "this week AI developments"}'
```

**Expected**: Results should be from last 7 days

### Test General Query
```bash
curl -X POST http://localhost:3001/v1/web-search \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test" \
  -H "x-user-id: test" \
  -d '{"query": "explain TypeScript"}'
```

**Expected**: Results from last 30 days (acceptable for general content)

---

## Files Modified

- ✅ `apps/memory-service/src/webSearch.ts`
  - Added `determineFreshness()` function
  - Updated `registerWebSearchRoute()` to use dynamic freshness

---

## Verification

1. **Check Logs**: Look for freshness decisions in memory-service logs:
   ```
   Using past day freshness for recent query
   Using past week freshness for weekly query
   Using past month freshness for general query
   ```

2. **Check Results**: Dates in web search results should match query intent:
   - "latest" queries → dates should be very recent (hours/days)
   - "this week" queries → dates should be within 7 days
   - General queries → dates can be up to 30 days

3. **Browser Test**: 
   - Send "latest AI news" in chat
   - Check that results are actually recent (not weeks/months old)

---

## Next Steps

If still seeing stale results:

1. **Check Brave API**: Verify Brave is returning fresh results for `pd` parameter
2. **Increase Recency Weight**: Could add more keyword patterns
3. **Use Query Analyzer**: Could leverage Hybrid RAG's Query Analyzer to detect temporal intent more accurately
4. **Add Date Filtering**: Post-process results to filter by date even if Brave returns older content

---

**Status**: ✅ Fixed - Freshness detection now query-aware

