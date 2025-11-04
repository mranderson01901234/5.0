# Proactive Summarization Process - Current State & Enhancements

## Current Process

### When Summaries Are Generated

1. **Trigger**: During audit jobs (non-blocking, background)
   - Audit cadence: Every 6 messages OR 1500 tokens OR 3 minutes
   - Debounce: Minimum 30 seconds between audits per thread

2. **Update Frequency**:
   - Summary generated if: Doesn't exist OR older than 1 hour
   - Problem: Important conversations might have stale summaries

3. **Process**:
   - Fetches last 50 messages from gateway DB
   - Generates summary using LLM (Google/OpenAI)
   - Stores in `thread_summaries` table (gateway DB)

### How Summaries Are Used

1. **ContextTrimmer** (`apps/llm-gateway/src/ContextTrimmer.ts`):
   - Fetches last 2 conversations from memory-service `/v1/conversations`
   - Gets summaries from gateway DB `thread_summaries` table
   - Includes in context if under token limits (max 300 tokens)

2. **When User References Previous Conversations**:
   - User says "pick up where we left off" → Fetches last 2 conversations
   - User asks about something from a few conversations back → Only gets last 2

### Current Limitations

1. **Only 2 conversations included** - might miss relevant context
2. **1-hour update threshold** - summaries can be stale for active conversations
3. **No importance scoring** - all conversations treated equally
4. **No on-demand generation** - if summary missing, conversation skipped
5. **Fixed summary length** - all summaries limited to 500 chars regardless of importance
6. **No conversation prioritization** - recent conversations prioritized over important ones

---

## Proposed Enhancements

### 1. Importance-Based Summary Updates
- More frequent updates for important conversations
- Detect importance: high memory count, TIER1 memories, long conversations, recent activity

### 2. Increase Conversation Count
- Include 3-5 conversations instead of 2
- Prioritize by recency AND importance

### 3. Variable-Length Summaries
- Important conversations get longer summaries (up to 800 chars)
- Normal conversations get standard summaries (500 chars)

### 4. On-Demand Summary Generation
- If summary missing when fetching conversation history, generate on-the-fly
- Use fallback summary if LLM unavailable

### 5. Importance Scoring
- Score conversations based on:
  - Memory count (more memories = more important)
  - TIER1/TIER2 memory presence
  - Conversation length
  - Recency
  - User engagement (multiple sessions)

---

## Implementation Plan

### Phase 1: Enhanced Update Frequency
- Reduce update threshold for active conversations (< 1 hour)
- More frequent updates for conversations with high memory counts

### Phase 2: Increased Conversation Count
- Increase from 2 to 4-5 conversations
- Add importance-based prioritization

### Phase 3: Variable-Length Summaries
- Generate longer summaries for important conversations
- Store importance score in thread_summaries table

### Phase 4: On-Demand Generation
- Generate summaries on-the-fly when missing
- Add fallback generation logic

