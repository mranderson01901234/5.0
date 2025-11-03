# Prompt Tuning Guide

## 🎯 Current Base Prompt Review

Your base prompt in `PromptBuilder.ts` is **well-structured** and covers the essentials:
- Context tracking
- Conversation awareness
- Natural language
- Length adaptation
- Context integration

## 🧪 How to Test

1. **Open the Prompt Tester**: http://localhost:5173 → Click "Prompt Tester" in sidebar
2. **Run automated tests** OR **Test manually**
3. **Note the issues** in the results

### Test Scenarios Available

1. **Simple Knowledge Query** - Basic information retrieval
2. **Multi-turn Context** - Conversation continuity  
3. **Technical Deep Dive** - Complex reasoning
4. **Follow-up Question** - Context tracking
5. **Conversational Tone** - Natural language
6. **Memory Recall (Same Thread)** - Memory persistence within conversation

## 🔧 Common Issues & Fixes

### Issue 1: Too Robotic / Formal
**Symptoms**: Responses feel stiff, no contractions, overly formal

**Fix** (Add to Guidelines section around line 266):
```typescript
- Use contractions and casual phrasing: "don't" instead of "do not", "it's" instead of "it is"
- Match the user's energy level - if they're casual, you be casual
```

### Issue 2: Ignores Previous Context
**Symptoms**: Responses don't reference earlier messages, act like first turn

**Fix** (Strengthen line 255):
```typescript
1. **Track conversation thread**: Always reference what the user JUST said, make explicit connections to earlier messages even if briefly
```

### Issue 3: Too Verbose / Terse
**Symptoms**: Responses are too long or too short for the query

**Fix** (Clarify line 270):
```typescript
- Brief for simple questions (1-2 sentences) 
- Comprehensive for complex topics (2-4 paragraphs)
- Let the query complexity guide your response length
```

### Issue 4: Context Feels Bolted On
**Symptoms**: Memories/web search results feel pasted in rather than synthesized

**Fix** (Add after line 271):
```typescript
- When synthesizing context, write naturally as if the information was always part of your knowledge
- Don't quote or cite sources unless the user explicitly asks
```

### Issue 5: Asks Too Many Follow-ups
**Symptoms**: Every response asks a question, even when unnecessary

**Fix** (Add to Guidelines):
```typescript
- Only ask clarifying questions when genuinely necessary
- Most responses should be complete answers, not question chains
```

### Issue 6: Memory Not Recalled
**Symptoms**: System doesn't reference saved memories when asked about them

**Fix** (Check PromptBuilder context integration):
```typescript
// In PromptBuilder.ts, ensure memory context is properly injected
// Look for lines that handle "user memories" or "explicit memories"
// Make sure context blocks properly include memory information
```

## 🎨 Minimal Example

If you see "Too robotic", here's a minimal change to test:

```typescript
// In PromptBuilder.ts, replace line 266:
// OLD:
- Use natural language—concise, not robotic or overly formal

// NEW:
- Use natural language—concise, conversational, and human. Use contractions freely. Treat this like a helpful friend, not a corporate memo.
```

## 📊 Testing Workflow

1. Run the automated tests
2. Check which tests fail
3. Read the "Issues" for each failure
4. Make ONE small change to the prompt
5. Test again
6. Iterate

**Rule**: Make the SMALLEST change possible to fix the issue. Don't rewrite everything.

## 🚫 What NOT to Do

❌ Don't add multiple fixes at once - you won't know what worked
❌ Don't make the prompt longer than it needs to be
❌ Don't add conflicting instructions
❌ Don't optimize based on one test - run multiple scenarios

## ✅ What TO Do

✅ Make ONE specific change at a time
✅ Test immediately after each change
✅ Document what you changed and why
✅ Keep the prompt concise
✅ Trust the evaluation results

## 🎯 Success Criteria

Your prompt is good when:
- ✅ Multi-turn conversations flow naturally
- ✅ Responses reference previous context
- ✅ Tone feels human, not robotic
- ✅ Responses are appropriately length
- ✅ Context is synthesized, not quoted
- ✅ No unnecessary questions

Good luck! 🚀

