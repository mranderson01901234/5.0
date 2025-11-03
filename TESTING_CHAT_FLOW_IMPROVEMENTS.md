# Testing Guide: Chat Flow Improvements

**Date**: 2025-01-28  
**Status**: Ready for testing ✅

---

## Quick Start

### Restart Services

```bash
./stop.sh
./start.sh
```

### Enable Debug Logging

Set log level to `info` or `debug` in environment:
```bash
export LOG_LEVEL=info
```

---

## Test Cases

### Test 1: Context Continuity (✅ SHOULD PASS)

**Goal**: Verify LLM remembers earlier messages in long conversations.

**Procedure**:
1. Start conversation: "Hi, I want to learn React"
2. Continue discussing React for **15+ messages**
3. Ask: "What was the first thing I wanted to learn?"

**Expected Result**:
- ✅ LLM remembers "React" (now has 10 turns of history vs 5 before)
- ✅ First sentence explicitly references context

**Before Fix**: Only last 5 turns, would likely forget  
**After Fix**: Last 10 turns, should remember

---

### Test 2: Context Enforcement (✅ SHOULD PASS)

**Goal**: Verify LLM follows mandatory context rules.

**Procedure**:
1. Start conversation: "Explain Redux"
2. LLM explains
3. You: "How does it compare to Context API?"
4. **Observe first sentence** of LLM response

**Expected Result**:
- ✅ First sentence references previous topic ("Continuing our Redux discussion...")
- ✅ Response stays on topic
- ✅ Explicit references if discussing earlier points

**Before Fix**: Might drift, no explicit context acknowledgment  
**After Fix**: Mandatory context acknowledgment + structure

---

### Test 3: Context Awareness in Short Conversations (✅ SHOULD PASS)

**Goal**: Verify context awareness works even in 2-3 message exchanges.

**Procedure**:
1. You: "What is TypeScript?"
2. LLM responds
3. You: "Why use it?"
4. **Observe** if LLM acknowledges "it" refers to TypeScript

**Expected Result**:
- ✅ LLM understands pronoun references
- ✅ Explicit acknowledgment of context continuity

**Before Fix**: Sometimes needed clarification  
**After Fix**: Better tracking of context

---

### Test 4: Debug Logging (✅ SHOULD PASS)

**Goal**: Verify comprehensive logging is working.

**Procedure**:
1. Send any message in chat
2. Check `logs/gateway.log`
3. Search for "Final prompt structure before LLM call"

**Expected Result**:
```json
{
  "msg": "Final prompt structure before LLM call",
  "systemMessagesCount": 2-4,
  "systemMessageLength": 500-2000,
  "totalMessages": 5-25,
  "estimatedTokens": 1000-5000,
  "contextSources": {
    "hasMemories": true/false,
    "hasProfile": false,
    "hasCorrection": false,
    "hasQueryAnalysis": true,
    "queryComplexity": "simple/moderate/complex"
  }
}
```

**Before Fix**: No logging  
**After Fix**: Comprehensive context data logged

---

### Test 5: Topic Drift Prevention (✅ SHOULD PASS)

**Goal**: Verify LLM stays on topic.

**Procedure**:
1. You: "Explain Promises in JavaScript"
2. LLM explains
3. You: "Can you give an example?"
4. **Observe** if response is about Promises, not random topic

**Expected Result**:
- ✅ Response is about Promises
- ✅ Example relates to discussion
- ✅ No unrelated topics introduced

**Before Fix**: Sometimes drifted to unrelated topics  
**After Fix**: Mandatory "stay on topic" rule enforced

---

### Test 6: Explicit Reference Tracking (✅ SHOULD PASS)

**Goal**: Verify LLM references earlier points explicitly.

**Procedure**:
1. You: "React has hooks. Explain useState."
2. LLM explains
3. You: "What about useEffect?"
4. You: "Compare the two hooks we just discussed."

**Expected Result**:
- ✅ Uses phrases like "As we discussed..."
- ✅ References both hooks explicitly
- ✅ Shows awareness of conversation thread

**Before Fix**: Might summarize without referencing  
**After Fix**: Mandatory explicit references

---

## Logs to Monitor

### Normal Operation Logs

**Location**: `logs/gateway.log`

**Look for**:
```json
{"level":30,"time":1234567890,"msg":"Final prompt structure before LLM call","userId":"...","threadId":"...","systemMessagesCount":2,"estimatedTokens":2345}
```

### Success Indicators

✅ **Good Signs**:
- `systemMessagesCount`: 2-5 (not 1, indicating split messages)
- `estimatedTokens`: Reasonable (under 8000 for most queries)
- `hasQueryAnalysis`: true (query is being analyzed)
- `hasMemories`: true/false appropriately based on query

⚠️ **Warning Signs**:
- `systemMessagesCount`: 1 (messages not split)
- `estimatedTokens`: > 8000 (approaching limit)
- Missing context sources
- `queryComplexity`: always "unknown"

---

## Comparison: Before vs After

### Before (Old System)

```
Context Window: 5 turns (10 messages)
Max Input Tokens: 8,000
System Messages: 1 merged block
Base Prompt: Passive suggestions
Logging: Minimal
```

**Result**: LLM sometimes got lost, context drifted, needed user clarification

---

### After (New System)

```
Context Window: 10 turns (20 messages) ✅ 2x
Max Input Tokens: 16,000 ✅ 2x
System Messages: Multiple separated blocks ✅
Base Prompt: Mandatory context enforcement ✅
Logging: Comprehensive context tracking ✅
```

**Expected Result**: Better context tracking, explicit acknowledgment, fewer drift issues

---

## Known Limitations

### Not Implemented Yet

❌ Query analysis before context fetch (requires refactoring)  
❌ Conversation summarization (future enhancement)  
❌ Context validation layer (future enhancement)

### Potential Issues

⚠️ **Anthropic Haiku Model**: Still using smallest model - may have limits  
⚠️ **Memory Retrieval**: Still best-effort, can timeout  
⚠️ **Token Costs**: Larger context window = higher token usage  

---

## Success Criteria

**Week 1 Metrics**:
- ✅ No increase in errors
- ✅ Debug logs working
- ✅ Token usage within expected range

**Week 2 Metrics** (User Validation):
- ✅ Reduced user clarifications needed
- ✅ Better context continuity in long conversations
- ✅ Explicit context acknowledgments observed

**Long-term Metrics** (A/B Testing):
- User satisfaction scores
- Conversation completion rates
- Average conversation length
- Context relevance scores

---

## Troubleshooting

### Issue: No debug logs appearing

**Solution**: Check LOG_LEVEL environment variable
```bash
export LOG_LEVEL=info  # or debug
```

### Issue: System messages still showing count of 1

**Solution**: Restart services, verify changes saved
```bash
./stop.sh
./start.sh
```

### Issue: Context window still 5 turns

**Solution**: Verify config file saved correctly
```bash
cat apps/llm-gateway/config/llm-gateway.json | grep keepLastTurns
# Should show: "keepLastTurns": 10
```

### Issue: LLM still drifting

**Potential Causes**:
1. Model limitations (Haiku may struggle with complex contexts)
2. Memory retrieval failures (unreliable context)
3. Need additional enforcement

**Solutions**:
- Try upgrading to Sonnet 3.5 model
- Check memory service logs
- Consider implementing additional context validation

---

## Next Steps After Testing

1. **Review logs** for 24-48 hours
2. **Gather user feedback** on context quality
3. **Measure metrics**: errors, token usage, response times
4. **Iterate**: Make refinements based on results
5. **Consider**: Upgrading model or additional features

---

## Files Changed

```
apps/llm-gateway/src/PromptBuilder.ts       (+12 lines base prompt enhancement)
apps/llm-gateway/config/llm-gateway.json    (+1 turn, +8000 tokens)
apps/llm-gateway/src/routes.ts              (+16 lines debug logging, split messages)
```

**Total**: ~30 lines of strategic improvements

---

**Status**: Ready for deployment and testing ✅

