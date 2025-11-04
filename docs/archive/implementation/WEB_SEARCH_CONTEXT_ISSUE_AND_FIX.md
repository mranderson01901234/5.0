# Critical Issue: Web Search Context Loss

**Date**: 2025-01-28  
**Severity**: HIGH  
**Impact**: Web search can misinterpret follow-up questions

---

## The Problem

**User Experience**:
1. User: "search and find some good articles on React and summarize them"
2. LLM: Returns excellent summary of 5 React articles
3. User: "which one is the most critical to understand first"
4. LLM: **Incorrectly searches for "critical thinking" articles** ❌

---

## Root Cause

Web search is called **BEFORE** context trimming and receives **ONLY** the isolated query string:

```typescript
// apps/llm-gateway/src/routes.ts line 515-560
webSearchPromise = (async () => {
  const response = await fetch(searchUrl, {
    method: 'POST',
    body: JSON.stringify({
      query: userQuery,  // ❌ ONLY raw query, no context!
      threadId,
    }),
  });
});
```

**The flow**:
1. Web search triggered → Gets raw query: "which one is the most critical"
2. Web search calls Brave Search API with ambiguous query
3. Brave returns generic "critical thinking" results
4. LLM composer synthesizes those results
5. **User gets off-topic response**

---

## Why This Happens

The word "critical" is ambiguous without context:
- With context: "which [React article] is the most critical"
- Without context: Generic "critical thinking" concept

**The web search LLM composer** (`apps/memory-service/src/composeSearchResponse.ts`) has no access to:
- Previous messages in the conversation
- What the LLM said in the previous turn
- The broader topic being discussed

---

## The Solution

Pass conversation context to web search so the composer LLM can disambiguate follow-up questions.

### Phase 1: Add Context to Web Search API

**Update**: `apps/memory-service/src/webSearch.ts`

```typescript
// Accept conversation context
const { query, threadId, conversationContext } = req.body as { 
  query: string; 
  threadId?: string;
  conversationContext?: Array<{ role: string; content: string }>;
};
```

### Phase 2: Pass Context from Gateway

**Update**: `apps/llm-gateway/src/routes.ts`

**Critical Timing Fix**: Move web search trigger to **AFTER** context trimming:

```typescript
// NEW ORDER:
// 1. Context trimming
const { trimmed, trimmedTokens } = await trimmer.trim(threadId, body.messages, userId);

// 2. THEN web search (with context available!)
if (needsWebSearch(lastUserMessage.content)) {
  webSearchPromise = fetch(searchUrl, {
    body: JSON.stringify({
      query: lastUserMessage.content,
      threadId,
      conversationContext: trimmed.slice(-6), // Last 3 turns for context
    }),
  });
}
```

### Phase 3: Update LLM Composer

**Update**: `apps/memory-service/src/composeSearchResponse.ts`

```typescript
export async function composeSearchResponse(
  userQuery: string,
  items: SearchItem[],
  conversationContext?: Array<{ role: string; content: string }> // NEW
): Promise<{ summary: string; sources }> {
  
  // Build context-aware prompt
  let contextBlock = '';
  if (conversationContext && conversationContext.length > 0) {
    const contextText = conversationContext
      .map(msg => `${msg.role}: ${msg.content}`)
      .join('\n');
    contextBlock = `\n\nCONVERSATION CONTEXT (for disambiguation):\n${contextText}\n`;
  }
  
  const userPrompt = `User's question: "${cleanHtml(userQuery)}"${contextBlock}

SEARCH RESULTS:
${capsuleText}

Create a natural, conversational response that answers their question using ONLY the search results.
If the user's question references something from the conversation context (like "which one" or "the first one"), 
use the context to understand what they're referring to.`;
}
```

---

## Alternative Solutions Considered

### Option A: Smarter Query Analysis
**Approach**: Pre-analyze query for ambiguity before triggering web search  
**Problem**: Still can't disambiguate without conversation history  
**Status**: ❌ Rejected

### Option B: Post-Search Filtering
**Approach**: Get results, then filter by context  
**Problem**: Can't filter results if search query itself is wrong  
**Status**: ❌ Rejected

### Option C: Context-Injected Search (RECOMMENDED ✅)
**Approach**: Pass conversation context to composer LLM for disambiguation  
**Benefits**: 
- Preserves web search independence
- Gives LLM context to understand references
- Works for all follow-up patterns
**Status**: ✅ Implementing

---

## Testing Plan

### Test Case 1: Follow-up Question with Reference
```
1. User: "Find articles on React and summarize"
2. LLM: Returns 5 React articles
3. User: "which one is most critical"
4. Expected: Identifies React Fundamentals as most critical
```

### Test Case 2: Pronoun Reference
```
1. User: "Search for TypeScript best practices"
2. LLM: Returns article summaries
3. User: "Explain the first one in detail"
4. Expected: Explains first article mentioned, not generic TypeScript
```

### Test Case 3: Multi-Turn Navigation
```
1. User: "Find articles on Docker"
2. LLM: Returns 5 Docker articles
3. User: "Which is best for beginners?"
4. LLM: Identifies beginner-friendly article
5. User: "Summarize it"
6. Expected: Summarizes the beginner article
```

### Test Case 4: No Context (Baseline)
```
1. User: "Search for latest AI news"
2. LLM: Returns current AI news
3. Expected: Works as before (no regression)
```

---

## Implementation Checklist

- [x] Identify root cause
- [x] Design solution
- [ ] Update `apps/memory-service/src/webSearch.ts` to accept context
- [ ] Update `apps/llm-gateway/src/routes.ts` to pass context
- [ ] Move web search trigger after context trimming
- [ ] Update `apps/memory-service/src/composeSearchResponse.ts` to use context
- [ ] Update streaming version `composeSearchResponseStream`
- [ ] Add logging for context availability
- [ ] Test all test cases
- [ ] Monitor for regressions

---

## Expected Outcome

**Before Fix**:
- Follow-up questions trigger ambiguous web searches
- User gets irrelevant results
- User has to rephrase or provide more context

**After Fix**:
- Follow-up questions correctly reference conversation
- Web search composer understands "which one", "the first", etc.
- More natural, continuous conversation flow

---

## Performance Impact

- **Minimal**: Only adds last 3 turns (~200-300 tokens) to composer prompt
- **Timing**: Web search now happens after context trimming (moved ~200 lines later in code)
- **Latency**: No additional API calls, just more context to existing LLM call

---

## Rollout Plan

1. **Immediate**: Implement fix in all three files
2. **Testing**: Run through test cases
3. **Monitoring**: Watch logs for context usage and any composer errors
4. **Optimization**: If needed, tune context window size (currently 3 turns)

---

**Status**: Ready for implementation

