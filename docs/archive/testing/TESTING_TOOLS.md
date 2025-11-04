# Testing Tools

Two powerful diagnostic tools for validating and improving your LLM Gateway system.

## 🧪 ConversationFlowTester

Tests real conversations to validate memory recall, model routing, web search, and conversational quality.

### Quick Start

```bash
# Run all conversation tests
pnpm test:conversation

# With custom config
GATEWAY_URL=http://localhost:8787 \
TEST_API_KEY=your-key \
TEST_USER_ID=test-user \
pnpm test:conversation
```

### What It Tests

- **Formulaic Responses** ⚠️ - Detects robotic, formulaic patterns
- **Memory Integration** - Natural vs robotic memory usage
- **Context Source Confusion** - Memory vs web search distinction
- **Conversational Continuity** - Natural context flow
- **Response Length** - Adaptive length matching complexity
- **Memory Recall** - Cross-conversation memory retrieval
- **Model Routing** - Smart routing to appropriate models  
- **Web Search** - Search triggering and result synthesis
- **Preprocessing Quality** - Memory summarization

### Output

```
🧪 Starting Conversation Flow Tests

Testing: Memory Recall Across Conversations
✅ PASSED (1234ms)

Testing: Web Search Integration  
❌ FAILED: Expected web search but none performed

📊 Test Summary:
Success Rate: 83.3%
Passed: 5/6

💡 Recommendations:
- Check web search configuration and API keys
```

📖 [Full Documentation](./apps/llm-gateway/CONVERSATION_TESTER.md)

---

## 🔍 PromptInspector

Analyzes your system prompts, context preprocessing, and prompt structure.

### Quick Start

```bash
# Inspect current prompts
pnpm inspect:prompt
```

### What It Analyzes

- **Base Prompt** - Structure, length, conversational tone
- **Preprocessing** - How raw context becomes natural narrative
- **Keyword Preservation** - Important info retained
- **Quality Checks** - Conversational tone, memory guidance
- **Recommendations** - Actionable improvements

### Output

```
🔍 Current Prompt Analysis

=== BASE PROMPT ===
You are a knowledgeable conversational partner...

Length: 1623 characters

=== SAMPLE PROMPT BUILD ===
--- Message 1 (system) ---
...

=== ANALYSIS ===
Conversational tone: ✅
Memory integration guidance: ✅

✅ Prompt inspection complete!

🔄 CONTEXT PREPROCESSING TEST

=== RAW MEMORY ===
[Memory] user is learning Spanish

=== PREPROCESSED MEMORY ===
you are learning Spanish

🔑 Keyword Preservation:
Memory keywords preserved: ✅
```

📖 [Full Documentation](./apps/llm-gateway/PROMPT_INSPECTOR.md)

---

## Workflow

### Before Making Changes

```bash
# 1. Check current prompts
pnpm inspect:prompt

# 2. Run conversation tests
pnpm test:conversation

# 3. Note baseline results
# - Prompt quality metrics
# - Test pass rates
# - Any recommendations
```

### After Making Changes

```bash
# 1. Inspect modified prompts
pnpm inspect:prompt

# 2. Verify preprocessing still works
# - Check keyword preservation
# - Review natural language quality

# 3. Run tests
pnpm test:conversation

# 4. Compare results
# - Better or worse?
# - Any regressions?
```

### Debugging Issues

```bash
# Poor response quality?
pnpm inspect:prompt  # Check prompt structure
pnpm test:conversation  # See which tests fail

# Memory not working?
pnpm test:conversation  # Run memory recall tests
# Check recommendations

# Web search not triggering?
pnpm test:conversation  # Web search test
# Verify API keys and config
```

## CI/CD Integration

```yaml
# .github/workflows/tests.yml
name: Tests

on: [push, pull_request]

jobs:
  prompts:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - run: pnpm install
      - run: pnpm inspect:prompt
        # Should complete without warnings

  conversations:
    runs-on: ubuntu-latest
    needs: prompts
    services:
      gateway:
        # Your gateway service setup
    steps:
      - uses: actions/checkout@v3
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - run: pnpm install
      - run: pnpm test:conversation
        env:
          GATEWAY_URL: http://localhost:8787
          TEST_API_KEY: ${{ secrets.TEST_API_KEY }}
        # Should maintain reasonable pass rate
```

## Quick Reference

| Tool | Command | When to Use |
|------|---------|-------------|
| Prompt Inspector | `pnpm inspect:prompt` | Before/after prompt changes |
| Conversation Tester | `pnpm test:conversation` | Validate system behavior |
| Both | Run both | Full validation suite |

## Environment Variables

### ConversationFlowTester

- `GATEWAY_URL` - Gateway base URL (default: `http://localhost:8787`)
- `TEST_API_KEY` - API key for auth (default: `test-key`)
- `TEST_USER_ID` - User ID for testing (default: `test-user`)

### PromptInspector

- No environment variables needed
- Reads directly from code

## Troubleshooting

### ConversationFlowTester

| Issue | Solution |
|-------|----------|
| "API error: 401" | Check `TEST_API_KEY` |
| Web search tests fail | Verify search enabled in config |
| Memory tests fail | Ensure memory service running |
| Timeouts | Increase timeout limits |

### PromptInspector

| Issue | Solution |
|-------|----------|
| Import errors | Run `pnpm install` |
| No preprocessing output | Check `ContextPreprocessor.ts` |
| All checks fail | Review `PromptBuilder.ts` |

## Contributing

When adding new tests or checks:

1. **ConversationFlowTester**: Add to `testScenarios` array in `ConversationFlowTester.ts`
2. **PromptInspector**: Add checks to `inspectCurrentPrompts()` or `testContextPreprocessing()`
3. Document changes in respective `.md` files
4. Update this quick reference if needed

## See Also

- [ConversationFlowTester Docs](./apps/llm-gateway/CONVERSATION_TESTER.md)
- [PromptInspector Docs](./apps/llm-gateway/PROMPT_INSPECTOR.md)
- [Critical Bugs Report](./CRITICAL_BUGS_FOUND.md)

