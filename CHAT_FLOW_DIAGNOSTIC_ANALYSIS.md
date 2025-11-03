# Chat Flow Diagnostic Analysis

**Date**: 2025-01-28  
**Issue**: LLM gets "lost" and requires follow-up direction to get back on track  
**Goal**: Identify root causes of context loss and inconsistent responses

---

## Problem Statement

**Observable Symptoms**:
1. LLM responses sometimes drift from conversation topic
2. Context appears to be "forgotten" mid-conversation
3. User must provide follow-up clarification/direction
4. Quality inconsistency between responses

**User Expectation**: Every response should be on-task, contextually aware, and exceptional, regardless of message quality.

---

## Current Flow Analysis

### Message Processing Pipeline

```
1. User sends message
   ↓
2. Rate limiting + authentication check
   ↓
3. Web search trigger check (if applicable)
   ↓
4. Ingestion context fetch (if applicable)
   ↓
5. ContextTrimmer.trim() - fetches memories & builds context
   ↓
6. QueryAnalyzer.analyzeQuery() - complexity assessment
   ↓
7. PromptBuilder construction:
   - Base prompt (tone, ethics, behavior)
   - Critical instructions (corrections)
   - High priority (memory saves)
   - Medium priority (verbosity)
   - Low priority (profile, follow-ups)
   - Context blocks (memories, ingested, conversations)
   ↓
8. Messages sent to LLM via provider
   ↓
9. Stream response to user
```

### Critical Components

#### 1. ContextTrimmer (`apps/llm-gateway/src/ContextTrimmer.ts`)

**Key Behavior**:
- Fetches last K turns (default: 5, so 10 messages total)
- Attempts to fetch memories via direct recall + Hybrid RAG
- Has **6 second timeout** for Hybrid RAG
- Falls back to direct memories if Hybrid RAG fails
- Preprocesses all context into "natural narrative"

**Potential Issues**:
- **Too few conversation turns**: Only keeps last 5 turns (10 messages)
- **Race condition**: Hybrid RAG timeout could cause inconsistent context
- **No conversation summary**: Only uses raw messages, no distillation
- **Context overload**: All memories dumped into single system message

#### 2. PromptBuilder (`apps/llm-gateway/src/PromptBuilder.ts`)

**Key Behavior**:
- Merges everything into **single system message**
- Base prompt + instructions + contexts all concatenated
- No separation of critical vs. supplementary context

**Potential Issues**:
- **Signal-to-noise ratio**: Context buried in long system message
- **No prioritization**: LLM must find relevant context in wall of text
- **Static base prompt**: Generic instructions may not match query needs

#### 3. QueryAnalyzer (`apps/llm-gateway/src/QueryAnalyzer.ts`)

**Key Behavior**:
- Detects complexity (simple/moderate/complex)
- Detects intent (factual/explanatory/discussion/action/memory_list/memory_save)
- Generates verbosity instructions

**Potential Issues**:
- **Rule-based only**: No LLM validation of actual intent
- **Limited patterns**: May miss nuanced queries
- **Passive**: Doesn't actively guide LLM, just adds instruction

#### 4. Base Prompt (`PromptBuilder.getDefaultBasePrompt()`)

**Current Content**:
```
You are a knowledgeable, articulate conversational partner...

Guidelines:
- Use natural language
- Maintain context across turns
- Integrate information naturally
- Prioritize accuracy, reasoning, coherence
...
```

**Potential Issues**:
- **Too vague**: "Maintain context" is generic instruction
- **No enforcement**: No mechanism to ensure compliance
- **Passive tone**: Doesn't command attention to context
- **No examples**: Abstract principles, no concrete examples

---

## Root Cause Hypotheses

### Hypothesis 1: **Context Window Too Small**

**Evidence**:
```typescript
// ContextTrimmer.ts line 37
const keepLast = this.config.router.keepLastTurns; // Default: 5
const recentMessages = allMessages.slice(0, keepLast * 2).reverse();
```

**Problem**: Only keeps **last 5 turns** (10 messages). Long conversations lose earlier context.

**Impact**: LLM "forgets" earlier topics and drifts.

**Fix**: Increase `keepLastTurns` OR add conversation summarization.

### Hypothesis 2: **Context Overload / Buried Signal**

**Evidence**:
```typescript
// PromptBuilder buildMerged() merges everything
const parts: string[] = [];
// Base prompt + CRITICAL + IMPORTANT + medium + low + contexts
return [{ role: 'system', content: parts.join('') }];
```

**Problem**: Single massive system message with:
- Base prompt (~15 lines)
- Critical instructions
- High priority instructions
- Medium priority instructions
- Low priority instructions
- Preprocessed memories
- Ingested context
- Conversation context

**Impact**: LLM has to parse huge context block, important info gets lost.

**Fix**: Use **multiple system messages** instead of one merged message.

### Hypothesis 3: **Memory Retrieval Inconsistency**

**Evidence**:
```typescript
// ContextTrimmer.ts - Memory fetching has fallbacks
// Try Hybrid RAG (6s timeout)
// Fallback to direct memories
// Fallback to nothing
```

**Problem**: Memory fetching is **best-effort**. Can timeout, fail, return partial results.

**Impact**: Context varies per query → inconsistent responses.

**Fix**: Make memory retrieval deterministic and predictable.

### Hypothesis 4: **No Active Context Enforcement**

**Evidence**:
```typescript
// Base prompt is passive
"Maintain context across turns; refer back to earlier topics when relevant"
```

**Problem**: Generic instruction with no enforcement. LLM can ignore it.

**Impact**: LLM drifts when not explicitly reminded of context.

**Fix**: Add **explicit context reminders** in conversation messages.

### Hypothesis 5: **No Query Understanding Before Context Fetch**

**Evidence**:
```typescript
// ContextTrimmer fetches ALL memories
// Then QueryAnalyzer analyzes query
// Memories already fetched, can't adjust
```

**Problem**: Fetching context **before** understanding what's needed. Loads everything.

**Impact**: Irrelevant memories dilute context.

**Fix**: Analyze query first, then fetch **relevant** context.

### Hypothesis 6: **Anthropic Model Inefficiency**

**Evidence**:
```json
// config/llm-gateway.json
"models": {
  "anthropic": "claude-3-haiku-20240307"
}
```

**Problem**: Using **Haiku** (smallest model). Limited reasoning capacity.

**Impact**: Can't handle complex multi-turn contexts effectively.

**Fix**: Upgrade to Sonnet 3.5 for better context handling.

---

## Diagnostic Tests Needed

### Test 1: **Context Window Size**

**Procedure**:
1. Start conversation with topic A
2. Continue conversation on topic A for 10+ messages
3. Check if LLM remembers early context

**Expected**: Should reference earlier messages if window is adequate.

### Test 2: **Memory Retrieval**

**Procedure**:
1. Save explicit memory: "My favorite color is blue"
2. Ask question requiring that memory
3. Check logs for memory recall
4. Verify memory appears in prompt

**Expected**: Memory should always appear in context when relevant.

### Test 3: **Prompt Structure**

**Procedure**:
1. Enable debug logging
2. Capture actual system message sent to LLM
3. Measure length, check formatting
4. Count context sources

**Expected**: System message should be < 2000 tokens, well-structured.

### Test 4: **Conversation Continuity**

**Procedure**:
1. User: "What is React?"
2. LLM: (responds about React)
3. User: "How does it work?"
4. Check if "it" refers to React

**Expected**: LLM should maintain reference continuity.

---

## Immediate Action Plan

### Priority 1: **Add Debug Logging**

**Goal**: See exactly what context LLM receives.

**Implementation**:
```typescript
// In routes.ts after PromptBuilder.buildMerged()
const systemMessages = promptBuilder.buildMerged();
logger.info({ 
  userId, 
  threadId,
  systemMessagesCount: systemMessages.length,
  systemMessageLength: systemMessages[0]?.content?.length || 0,
  estimatedTokens: provider.estimate(systemMessages, model),
  contextSources: {
    hasMemories: ingestedContextText.length > 0,
    hasProfile: !!userProfile,
    hasCorrection: isCorrection(lastQuery),
    hasQueryAnalysis: !!queryAnalysis
  }
}, 'Final system messages before LLM');
```

### Priority 2: **Increase Context Window**

**Goal**: Keep more conversation history.

**Implementation**:
```json
// config/llm-gateway.json
"router": {
  "keepLastTurns": 10,  // Change from 5 to 10
  "maxInputTokens": 16000,  // Increase from 8000
  ...
}
```

**Risk**: Higher token usage. Mitigate with smarter context pruning.

### Priority 3: **Split System Messages**

**Goal**: Separate concerns so LLM can focus.

**Implementation**:
```typescript
// In PromptBuilder
build(): Array<{ role: 'system'; content: string }> {
  // Don't merge, return as separate messages
  return [
    { role: 'system', content: this.basePrompt },
    ...this.instructions.map(i => ({ role: 'system', content: i.content })),
    ...this.contextBlocks.map(c => ({ role: 'system', content: c.content }))
  ];
}
```

### Priority 4: **Add Explicit Context References**

**Goal**: Force LLM to acknowledge context.

**Implementation**:
```typescript
// In PromptBuilder base prompt
static getDefaultBasePrompt(): string {
  return `You are a knowledgeable conversational partner.

CRITICAL: At the start of EVERY response, mentally check:
1. What has the user been discussing?
2. What context from previous messages is relevant?
3. Am I maintaining continuity or drifting?

Then respond in a way that demonstrates you're following the conversation thread.

Guidelines:
- Your first sentence should acknowledge the previous topic
- Reference earlier points explicitly ("As we discussed...", "Regarding X...")
- Don't assume context - demonstrate awareness`;
}
```

### Priority 5: **Query Analysis Before Context Fetch**

**Goal**: Fetch relevant context only.

**Implementation**:
```typescript
// In ContextTrimmer
async trim(threadId, messages, userId): Promise<...> {
  // Analyze query FIRST
  const lastUserMessage = messages.filter(m => m.role === 'user').pop();
  const analysis = analyzeQuery(lastUserMessage?.content || '');
  
  // Then fetch context based on analysis
  const memories = await fetchRelevantMemories(analysis);
  ...
}
```

---

## Recommended Immediate Fixes

### Fix 1: **Enhanced Base Prompt**

**Current**:
```
You are a knowledgeable, articulate conversational partner...

Guidelines:
- Use natural language—concise, not robotic or overly formal
- Maintain context across turns; refer back to earlier topics when relevant
```

**Proposed**:
```
You are a knowledgeable conversational partner. You excel at maintaining context and providing consistent, on-topic responses.

CORE RULES (MANDATORY):
1. **Track the conversation thread**: Always reference what the user JUST said and how it connects to earlier messages
2. **Demonstrate awareness**: Begin responses by showing you understand the context ("Continuing our discussion on X..." or "You asked about Y...")
3. **Stay on topic**: If the user asks about X, answer about X. Don't introduce unrelated topics.
4. **Use explicit references**: When discussing something mentioned earlier, reference it explicitly ("As we discussed...", "Earlier you mentioned...")

RESPONSE STRUCTURE:
1. Acknowledge context (1 sentence)
2. Answer the question
3. Maintain continuity (reference earlier if relevant)

Guidelines:
- If the conversation seems to drift, refocus on the user's actual question
- If context is unclear, ask for clarification rather than assuming
- Prioritize accuracy and relevance over flowery language
```

### Fix 2: **Add Context Reminder to User Messages**

**Current**: User message sent as-is.

**Proposed**: Wrap user message with context reminder:
```typescript
// In routes.ts before sending to LLM
const contextualizedMessages = trimmed.map(msg => {
  if (msg.role === 'user') {
    return {
      ...msg,
      content: `[Conversation context: We've been discussing ${conversationTopic}]\n\n${msg.content}`
    };
  }
  return msg;
});
```

### Fix 3: **Conversation Summarization**

**Proposed**: Add lightweight summarization to track conversation topics:

```typescript
// New function
async function getConversationSummary(threadId: string, userId: string): Promise<string> {
  // Fetch last 20 messages
  // Generate 1-sentence summary of main topic
  // Return: "Currently discussing React hooks and state management"
  return summary;
}
```

Then add to context:
```typescript
const summary = await getConversationSummary(threadId, userId);
promptBuilder.addInstruction(`Current conversation focus: ${summary}`, 'high');
```

---

## Metrics to Track

### Response Quality Metrics

1. **Context Continuity Score**: % of responses that reference earlier messages
2. **Topic Drift Rate**: % of responses that introduce unrelated topics
3. **User Clarification Rate**: % of responses followed by user correction/clarification
4. **Context Window Usage**: Average tokens used for context vs. available

### Performance Metrics

1. **Memory Recall Accuracy**: % of times relevant memories are retrieved
2. **Context Fetch Success Rate**: % of queries with full context
3. **Prompt Size Distribution**: Histogram of system message token counts

---

## Long-term Improvements

### 1. **Conversation State Machine**

Track conversation state:
- Current topic
- Active references (what "it", "this", "that" refer to)
- Ongoing discussions vs. finished threads
- User goals/intent

### 2. **Dynamic Context Pruning**

Instead of fixed "last K turns", use:
- Topic-aware pruning (keep all messages on current topic)
- Importance scoring (keep "important" messages longer)
- Reference tracking (keep messages being referenced)

### 3. **Context Validation Layer**

Before sending to LLM:
- Check if all necessary context is present
- Verify memory recall succeeded
- Ensure continuity markers are present
- Validate prompt structure

### 4. **Response Quality Filter**

After LLM responds:
- Check if response is on-topic
- Verify context awareness
- Auto-correct obvious drifts
- Add clarification if needed

---

## Next Steps

1. ✅ **Immediate**: Add debug logging to capture actual prompts
2. ✅ **This Week**: Implement enhanced base prompt + context reminders
3. ✅ **Next Week**: Increase context window and add conversation summarization
4. ✅ **Testing**: Run diagnostic tests and measure improvements
5. ✅ **Iteration**: Refine based on results

---

## Key Insight

**The LLM is getting lost because there's no enforcement of context awareness.** Current system:
- ✅ Fetches context (sometimes)
- ✅ Adds it to prompt (buried in long message)
- ❌ Doesn't enforce LLM to use it
- ❌ Doesn't validate LLM maintains continuity

**Solution**: **Active context enforcement**, not passive context injection.

