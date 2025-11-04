# Test Prompts for Soft Guidance Verification

Quick test prompts to verify dynamic verbosity scaling and follow-up guidance.

## Recent Changes

### Explicit Memory Save Feature (Nov 2024)
**Users can now explicitly tell the LLM to remember information** - Users can now say:
- "remember this"
- "save this"
- "store this"
- "memorize this"
- "keep this in mind"

**Implementation:**
- QueryAnalyzer detects memory_save intent
- Content extraction handles various phrasings
- POST /v1/memories endpoint for direct saves
- LLM acknowledges saves naturally
- **Result:** Users have guaranteed control over what gets saved

### User Profiling System - Phase 1 (Nov 2024)
**Built foundation for personalized chat experience** - System now extracts and stores:
- Tech stack preferences (e.g., TypeScript, React, FastAPI)
- Domains of interest (e.g., web-dev, ai-ml, backend)
- Expertise level (beginner/intermediate/expert)
- Communication style (concise/balanced/detailed)

**Implementation:**
- Profile extraction from TIER1/TIER2 memories
- Redis caching + SQLite persistence
- Auto-invalidation on memory updates
- GET `/v1/profile` API endpoint
- **Status:** Built, ready for Phase 2 integration

**Next:** Integrate profiles into QueryAnalyzer and memory retrieval for personalization

### Memory Listing Feature (Nov 2024)
**Added ability for users to list their saved memories** - Users can now ask:
- "What do you remember?"
- "List memories"
- "Show memories"
- "What's saved"
- "What information do you have"
- "What conversations do you remember"

**Implementation:**
- QueryAnalyzer detects memory_list intent
- LLM Gateway fetches user's memories from memory-service
- Memories formatted naturally for conversational response
- **Result:** Users can see what information is currently saved and being used

### Memory Recall Optimization (Nov 2024)
**Optimized ingestion context formatting for memory recall** - Reduced verbosity by:
- Removing verbose "Information about..." wrappers
- Skipping domain metadata (no more "(from domain.com)")
- Extracting just the summary content (most relevant info)
- **Result:** Much more concise memory recall responses that focus on actual content rather than metadata

---

## 🔹 Simple Queries (Expected: Brief, 1-2 sentences)

- What is React?
- What is TypeScript?
- Is JavaScript a language?
- Who created Python?
- What is a function?

**Expected behavior:** Very brief, direct answers. No follow-up suggestions.

---

## 🔹 Moderate Queries (Expected: Balanced, 2-3 paragraphs)

- Tell me about React hooks
- Explain async/await
- What are CSS Grid and Flexbox?
- How do promises work in JavaScript?
- What's the difference between let and const?

**Expected behavior:** Balanced explanation, appropriate depth. No forced follow-ups.

---

## 🔹 Complex Queries (Expected: Comprehensive + Follow-up guidance)

- Explain how React's architecture works and what design patterns it uses
- How does JavaScript's event loop work and what are the implications for async programming?
- Compare and contrast different state management approaches in React applications
- Walk through the algorithm for sorting arrays and explain the trade-offs
- Analyze the pros and cons of different database architectures for web applications

**Expected behavior:** Comprehensive explanations with examples. May include natural follow-up suggestions (e.g., "Would you like to dive deeper into [specific aspect]?")

---

## 🔹 Intent-Based Tests

### Factual (Simple/Moderate)
- What is the capital of France?
- When was Python first released?

### Explanatory (Complex)
- How does React's reconciliation algorithm work?
- Why do we use virtual DOM?

### Discussion (Complex)
- What's your opinion on React vs Vue?
- Should I use TypeScript for my project?

### Action (Complex)
- Show me how to create a custom React hook
- Write a function that sorts an array

### Memory List (Simple/Moderate)
- What do you remember?
- List memories
- Show memories
- What's saved?
- What information do you have?
- What conversations do you remember?

**Expected behavior:** Lists user's saved memories in a conversational format. If no memories exist, informs the user politely.

---

## 🔹 Edge Cases

- Very short: "Hi"
- Very long: "Can you explain the entire React ecosystem including hooks, context, state management, routing, testing, build tools, and deployment strategies?"
- Multiple questions: "What is React? How does it work? What are hooks?"
- Technical deep-dive: "Explain the architecture of React Fiber and how it improves performance"

---

## Quick Test Sequence

1. **Simple test:** "What is React?"
   - ✅ Should be brief (1-2 sentences)

2. **Moderate test:** "Tell me about React hooks"
   - ✅ Should be balanced (2-3 paragraphs)

3. **Complex test:** "Explain React's architecture and design patterns"
   - ✅ Should be comprehensive
   - ✅ May suggest follow-up naturally

4. **Action test:** "Show me how to create a custom hook"
   - ✅ Should include examples/code
   - ✅ May suggest related topics

5. **Memory list test:** "What do you remember?"
   - ✅ Should list saved memories if they exist
   - ✅ Should inform if no memories are saved
   - ✅ Should format naturally for conversation

---

## What to Check

- ✅ Response length matches query complexity
- ✅ Simple queries = brief answers
- ✅ Complex queries = detailed explanations
- ✅ Follow-up suggestions appear naturally (not formulaic)
- ✅ No rigid templates or forced structures
- ✅ Natural conversation flow maintained

