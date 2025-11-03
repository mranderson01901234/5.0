# Memory Recall Fix - The Missing Piece

## Problem Analysis

### What's Working ✅
1. **Explicit Memory Saving** - User says "remember my favorite color is blue" → Memory gets saved
2. **Proactive Memory Saving** - Audit jobs save memories automatically based on quality scores
3. **Memory Storage** - Memories are stored with userId, persist across chats/logins

### What's Broken ❌
1. **Memory Recall During Chat** - When user asks "what's my favorite color?", the saved memory may not be recalled
2. **Hybrid RAG Override** - If Hybrid RAG is enabled, simple memory recall is skipped entirely
3. **Keyword Matching Only** - Recall uses keyword matching, misses semantic connections
4. **Aggressive Timeout** - 30ms timeout is too short, memories often timeout

## The Key Difference

### Proactive Memory Saving & Recall
- **Saves**: Automatically via audit jobs (background, quality-based)
- **Recalls**: Via ContextTrimmer, but ONLY if Hybrid RAG is disabled
- **Timing**: Background job, happens after conversation

### Explicit "Remember This" Feature  
- **Saves**: Immediately when user says "remember" ✅ (working)
- **Recalls**: Should happen during next chat turn ❌ (broken)
- **Timing**: Needs to be available in real-time during conversation

## Root Cause

Looking at `ContextTrimmer.ts` line 52:
```typescript
const useHybridRAG = this.config.flags.hybridRAG && lastUserMessage;

if (useHybridRAG) {
  // Uses Hybrid RAG (may or may not recall memories)
  ...
} else {
  // Falls back to simple recall (keyword-based, 30ms timeout)
  ...
}
```

**Issues:**
1. Hybrid RAG path might not recall user's explicit memories
2. Simple recall path is keyword-based only (won't match "what's my favorite color" with "my favorite color is blue")
3. 30ms timeout is too aggressive

## Solution

### Fix 1: Always Recall Memories (Even with Hybrid RAG)
- Don't skip memory recall when Hybrid RAG is enabled
- Recall memories independently, then merge with Hybrid RAG results

### Fix 2: Better Semantic Matching
- Use the user query to recall memories, not just keywords
- Pass full query to `/v1/recall` for better matching

### Fix 3: Increase Timeout
- 30ms is too aggressive, increase to at least 100-200ms for memory recall

### Fix 4: Always Recall TIER1 Memories
- Explicit "remember" saves are TIER1 - should always be recalled if at all relevant
- Prioritize TIER1 memories in recall

## Implementation Plan

1. Modify `ContextTrimmer.ts` to always recall memories (not just when Hybrid RAG is off)
2. Increase recall timeout to 100ms
3. Pass full user query (not just keywords) to recall endpoint
4. Prioritize TIER1 memories in recall query
5. Merge memory results with Hybrid RAG results (if enabled)

