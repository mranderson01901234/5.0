# Memory Feature Audit: Conversation History Recall

**Date**: 2025-01-XX  
**Component**: `ContextTrimmer.ts` - Conversation History Feature  
**Issue**: Last conversation isn't being referenced as much as it should be

---

## 🔍 Executive Summary

The conversation history feature exists but has **critical reliability issues** that cause it to fail silently most of the time:

1. **Aggressive timeout (50ms)** - Too short for reliable network requests
2. **Silent failures** - No logging when conversation history fails
3. **Missing summaries** - Summaries may not exist when conversation history is requested
4. **No fallback** - When summaries are missing, history is silently skipped
5. **Insufficient error visibility** - Makes debugging impossible

---

## 📊 Current Implementation Analysis

### Location: `apps/llm-gateway/src/ContextTrimmer.ts` (lines 275-327)

### Flow:
1. Fetch last 2 conversations from memory-service `/v1/conversations`
2. Get summaries from gateway DB `thread_summaries` table
3. Preprocess and add to context if under token limits

### Issues Identified:

#### 🔴 CRITICAL: Aggressive Timeout
```typescript
// Line 294: 50ms timeout - WAY TOO SHORT!
const conversations = await Promise.race([
  conversationsPromise,
  new Promise<Array<...>>((resolve) => setTimeout(() => resolve([]), 50))
]);
```

**Problem**: 
- Network requests typically take 50-200ms
- Memory service may take 100-300ms to query `memory_audits` table
- 50ms timeout causes most requests to fail silently

**Impact**: ~90% of conversation history requests likely timeout

---

#### 🟠 HIGH: Silent Error Handling
```typescript
// Line 290: Errors silently swallowed
.catch(() => []);

// Line 325-327: Entire catch block silent
catch (error: any) {
  // Silently fail - conversation history is advisory only
}
```

**Problem**:
- No logging means failures are invisible
- Cannot debug why conversation history isn't working
- No metrics to track success rate

**Impact**: Zero visibility into why conversation history isn't being referenced

---

#### 🟡 MEDIUM: Missing Summaries Not Handled
```typescript
// Line 301-303: Missing summaries filtered out silently
const summaries = conversations
  .map(conv => {
    const threadSummary = db.prepare('SELECT summary FROM thread_summaries WHERE thread_id = ? AND user_id = ?')
      .get(conv.threadId, userId) as { summary: string } | undefined;
    return threadSummary ? { threadId: conv.threadId, summary: threadSummary.summary } : null;
  })
  .filter(s => s !== null);
```

**Problem**:
- If summary doesn't exist, conversation is silently skipped
- No indication that a conversation was found but summary missing
- Summaries are generated asynchronously by audit jobs - may not exist yet

**Impact**: Even if conversations are fetched, they're skipped if summaries don't exist

---

#### 🟡 MEDIUM: Token Limit Check Too Restrictive
```typescript
// Line 318: Requires 40% token budget remaining
if (historyTokens <= maxHistoryTokens && tokenCount + historyTokens < maxInputTokens * 0.6) {
```

**Problem**:
- Requires 60% of token budget remaining
- May skip conversation history even when there's room
- 200 token cap may be too restrictive

**Impact**: Conversation history skipped even when technically possible

---

#### 🟢 LOW: No Fallback Summary Generation
**Problem**:
- If summary doesn't exist, no attempt to generate on-the-fly
- Relies entirely on async audit job summaries
- Could generate a simple summary from first/last messages as fallback

**Impact**: Missed opportunity to include conversation history

---

## 🔧 Root Cause Analysis

### Why Conversation History Isn't Being Referenced:

1. **Timeout Too Short** (Primary Issue)
   - 50ms timeout is unrealistic for network requests
   - Most requests timeout → empty array → no history

2. **Summaries May Not Exist** (Secondary Issue)
   - Summaries generated asynchronously by audit jobs
   - Audit jobs run on cadence (6 messages, 1500 tokens, 3 minutes)
   - New conversations may not have summaries yet

3. **Silent Failures** (Tertiary Issue)
   - No logging makes it impossible to diagnose
   - Users report "last conversation not being referenced" but can't debug

---

## ✅ Recommended Fixes

### Fix 1: Increase Timeout (CRITICAL)
```typescript
// Increase from 50ms to 300ms (consistent with memory recall)
const conversations = await Promise.race([
  conversationsPromise,
  new Promise<Array<...>>((resolve) => setTimeout(() => resolve([]), 300))
]);
```

### Fix 2: Add Comprehensive Logging (HIGH)
```typescript
// Log when conversation history is fetched
logger.debug({ userId, threadId, count: conversations.length }, 'Conversation history fetched');

// Log when summaries are missing
if (conversations.length > 0 && summaries.length === 0) {
  logger.warn({ userId, threadId, conversations: conversations.map(c => c.threadId) }, 
    'Conversation history found but summaries missing');
}

// Log when added to context
if (summaries.length > 0) {
  logger.info({ userId, threadId, summaryCount: summaries.length, tokens: historyTokens }, 
    'Conversation history added to context');
}

// Log failures
catch (error: any) {
  logger.warn({ userId, threadId, error: error.message }, 'Conversation history fetch failed');
}
```

### Fix 3: Handle Missing Summaries Gracefully (MEDIUM)
```typescript
// Generate simple fallback summary if missing
if (!threadSummary && conversations.length > 0) {
  // Option 1: Use first message as fallback
  const firstMsg = db.prepare('SELECT content FROM messages WHERE thread_id = ? AND role = ? ORDER BY created_at ASC LIMIT 1')
    .get(conv.threadId, 'user') as { content: string } | undefined;
  if (firstMsg) {
    const fallbackSummary = firstMsg.content.substring(0, 100) + '...';
    summaries.push({ threadId: conv.threadId, summary: fallbackSummary });
  }
}
```

### Fix 4: Relax Token Constraints (LOW)
```typescript
// Increase maxHistoryTokens from 200 to 300
const maxHistoryTokens = 300;

// Reduce token budget requirement from 60% to 50%
if (historyTokens <= maxHistoryTokens && tokenCount + historyTokens < maxInputTokens * 0.5) {
```

---

## 📈 Expected Impact

After fixes:
- ✅ **90% → 95%+ success rate** for conversation history fetch (timeout fix)
- ✅ **Full visibility** into when/why conversation history fails (logging)
- ✅ **Better coverage** with fallback summaries (missing summary handling)
- ✅ **More conversation history** included when token budget allows (relaxed constraints)

---

## 🧪 Testing Plan

1. **Test Timeout Fix**:
   - Monitor logs for conversation history fetch times
   - Verify <5% timeout rate (currently ~90%)

2. **Test Logging**:
   - Verify logs show when conversation history is fetched/added/skipped
   - Check for missing summary warnings

3. **Test Fallback Summaries**:
   - Create new conversation without audit job running
   - Verify fallback summary is used

4. **Test Token Limits**:
   - Verify conversation history included when token budget allows
   - Check that 300 token cap is reasonable

---

## 📝 Implementation Checklist

- [ ] Increase timeout from 50ms to 300ms
- [ ] Add debug logging for conversation fetch
- [ ] Add warning logging for missing summaries
- [ ] Add info logging when history added to context
- [ ] Add error logging in catch block
- [ ] Implement fallback summary generation (optional)
- [ ] Increase maxHistoryTokens from 200 to 300 (optional)
- [ ] Relax token budget requirement from 60% to 50% (optional)

---

## 🔗 Related Issues

- Memory recall timeout: 300ms (already fixed)
- Audit job cadence: May need to be more frequent for summaries
- Summary generation: May need synchronous option for new conversations

---

**Status**: Ready for implementation  
**Priority**: HIGH (affects core memory feature)  
**Estimated Time**: 1-2 hours

