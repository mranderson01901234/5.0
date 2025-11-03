# Testing Plan for Recent Optimizations

**Date:** 2025-01-27  
**Objective:** Verify that all recent optimizations and integrations are working correctly

## Optimizations to Test

### 1. Enhanced Web Search Detection
**What Changed:**
- Strengthened QueryAnalyzer patterns for temporal queries
- Added detection for "latest + year", "year + features" patterns
- Enhanced logging for web search trigger decisions

**Tests:**
- ✅ "What are the latest React features in 2025?" → Should trigger web search
- ✅ "What's the latest AI safety news?" → Should trigger web search
- ✅ Check logs for QueryAnalyzer intent classification

### 2. Enhanced Follow-Up Detection
**What Changed:**
- Replaced FollowUpDetector with EnhancedFollowUpDetector
- Now detects queries up to 6 words with context awareness
- Detects "How do I handle state?" (5 words) as follow-up

**Tests:**
- ✅ "I'm building a React app" → "How do I handle state?" → Should detect as follow-up
- ✅ "What is React?" → "Tell me more" → Should detect as follow-up (≤3 words)
- ✅ "How do I learn Python?" (standalone, no context) → Should NOT detect as follow-up
- ✅ Check logs for follow-up detection and max_tokens=200 enforcement

### 3. Math Query Post-Processing
**What Changed:**
- Added MathQueryPostProcessor to normalize math responses
- Converts "four" → "4", extracts numbers from verbose responses
- Post-processes after streaming completes

**Tests:**
- ✅ "What's 2+2?" → Should return "4" (not "four" or verbose explanation)
- ✅ "10 * 5" → Should return "50"
- ✅ Check logs for post-processing (should show normalization when verbose)
- ⚠️ Note: Streamed response still shows original (post-processing is for stored response)

### 4. Memory Recall Stability
**What Changed:**
- Replaced direct fetch with MemoryRecallStabilizer
- Added retry logic (2 retries) with 300ms timeout
- Improved error handling and graceful fallback

**Tests:**
- ✅ "I'm learning Spanish" → "What language was I learning?" → Should recall correctly
- ✅ Simulate timeout scenario → Should retry 2 times before fallback
- ✅ Check logs for retry attempts and success/failure

### 5. Follow-Up Brevity Enforcement
**What Changed:**
- Changed follow-up instruction priority to CRITICAL
- Added max_tokens=200 enforcement for follow-ups
- Enhanced logging

**Tests:**
- ✅ Follow-up responses should be <400 chars (target <1000)
- ✅ Check logs for max_tokens=200 enforcement
- ✅ Verify CRITICAL priority instructions are applied

### 6. Math Query Token Enforcement
**What Changed:**
- Added max_tokens=10 for simple math queries
- Added comprehensive logging for max_tokens decisions

**Tests:**
- ✅ "What's 2+2?" → Should enforce max_tokens=10
- ✅ Check logs for max_tokens enforcement
- ⚠️ Note: May still be verbose due to streaming, but post-processing fixes stored response

## Test Execution

### Quick Manual Tests

```bash
# 1. Start services
cd apps/llm-gateway
pnpm dev

# 2. In another terminal, run conversation tests
cd apps/llm-gateway
pnpm test:conversation

# 3. Or run specific test scenarios
GATEWAY_URL=http://localhost:8787 \
TEST_API_KEY=test-key \
TEST_USER_ID=test-user \
pnpm test:conversation
```

### Key Test Scenarios from CONVERSATION_TESTER.md

1. **Formulaic Response Pattern Test**
   - Query: "What's 2+2?"
   - Expected: Direct answer, NOT formulaic patterns
   - Verify: Math post-processing normalizes to "4"

2. **Memory Integration Naturalness Test**
   - Setup: "I'm learning Spanish"
   - Query: "What language tips do you have?"
   - Expected: Recalls Spanish naturally (memory recall stability)
   - Verify: MemoryRecallStabilizer works correctly

3. **Context Source Confusion Test**
   - Query: "What are the latest React features in 2025?"
   - Expected: Web search triggered
   - Verify: QueryAnalyzer intent = 'needs_web_search'

4. **Conversational Continuity Test**
   - Multi-turn: Building app → Components → "How do I handle state?"
   - Expected: Follow-up detected, brief response
   - Verify: EnhancedFollowUpDetector catches it, max_tokens=200 enforced

5. **Response Length Appropriateness Test**
   - Simple: "What's useState?" → max 400 chars
   - Verify: Follow-up detection + brevity enforcement works

6. **Memory Recall Across Conversations**
   - Setup: "I'm learning Spanish"
   - Query: "What language was I learning?"
   - Expected: Recalls correctly
   - Verify: MemoryRecallStabilizer with retry logic

## Log Review Checklist

After running tests, check logs for:

1. **QueryAnalyzer Intent Detection:**
   ```
   QueryAnalyzer analysis result
   - intent: needs_web_search | conversational_followup | factual
   - complexity: simple | moderate | complex
   ```

2. **Web Search Triggering:**
   ```
   Web search triggered by QueryAnalyzer intent
   OR
   Web search decision from legacy needsWebSearch function
   ```

3. **Follow-Up Detection:**
   ```
   Follow-up detected (Enhanced), adding CRITICAL brevity instruction
   ```

4. **Max Tokens Enforcement:**
   ```
   Provider selection with max_tokens enforcement
   - maxTokens: 10 (for math) | 200 (for follow-ups)
   - maxTokensOverride: 10 | 200
   ```

5. **Math Query Post-Processing:**
   ```
   Math query post-processed for consistent format
   - originalLength: 212
   - processedLength: 1
   - originalPreview: "Sure! The equation..."
   - processedPreview: "4"
   ```

6. **Memory Recall:**
   ```
   Memory recall completed (with stabilizer)
   - memoryCount: 1
   - tier1Count: 1
   ```

## Expected Improvements

Based on OPTIMIZATION_FIXES_RESULTS.md:
- **Before:** 3/8 tests passing (37.5%)
- **Target:** 5-6/8 tests passing (62.5-75%)
- **Improvements:**
  - Math queries: Should normalize to "4" via post-processing
  - Follow-ups: Should be detected better (Enhanced detector)
  - Web search: Should trigger for temporal queries
  - Memory recall: Should be more reliable (retry logic)

## Issues to Watch For

1. **Math queries still verbose:**
   - Check if max_tokens=10 is actually sent to provider
   - Verify post-processing is working (check stored response)
   - May need provider-specific handling

2. **Follow-ups not detected:**
   - Check if conversation history is passed correctly
   - Verify EnhancedFollowUpDetector keyword matching
   - Check context awareness logic

3. **Web search not triggering:**
   - Check QueryAnalyzer intent classification
   - Verify config.flags.search is enabled
   - Review strengthened patterns

4. **Memory recall failures:**
   - Check retry logs
   - Verify timeout handling
   - Check fallback behavior

## Success Criteria

- ✅ Math queries return normalized numeric format
- ✅ Follow-up detection catches previously missed cases
- ✅ Web search triggers for temporal queries
- ✅ Memory recall is more reliable (fewer failures)
- ✅ Follow-up responses are shorter (<400 chars)
- ✅ Comprehensive logging shows optimization decisions

## Next Actions After Testing

1. Review test results and identify remaining failures
2. Check logs to understand why optimizations didn't work (if any)
3. Adjust patterns/thresholds based on actual behavior
4. Consider additional improvements based on findings

