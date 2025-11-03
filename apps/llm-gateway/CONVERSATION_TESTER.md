# Conversation Flow Tester

A comprehensive test suite for validating your LLM Gateway's sophisticated features including memory recall, context integration, model routing, and conversational quality.

## Features

The Conversation Flow Tester validates:

1. **Memory Recall** - Tests cross-conversation memory retrieval
2. **Model Routing** - Validates smart routing to appropriate models (GPT-4 Mini, Claude Sonnet, Gemini Flash)
3. **Web Search Integration** - Checks search triggering and result synthesis
4. **Context Handling** - Verifies large context processing and continuity
5. **Conversational Quality** - Ensures natural tone and appropriate length
6. **Memory Preprocessing** - Validates memory summarization quality

## Test Scenarios

### 1. Formulaic Response Pattern Test ⚠️
- **Target Issue**: Rigid response structure making responses feel robotic
- Simple question: "What's 2+2?"
- Expected: Should NOT start with "Continuing our discussion", "You asked about", etc.
- Validates: Simple questions don't get formulaic context acknowledgment

### 2. Memory Integration Naturalness Test
- **Target Issue**: Memory context not being integrated naturally
- User says: "I'm learning Spanish"
- Follow-up: "What language tips do you have?"
- Expected: Should recall Spanish naturally WITHOUT saying "You mentioned studying Spanish earlier"
- Validates: Memory integrated conversationally, not robotically announced

### 3. Context Source Confusion Test
- **Target Issue**: Model confused about different context sources
- Query: "What are the latest React features in 2025?"
- Expected: Should NOT treat web search results as user mentions
- Validates: Web search results vs user memory properly distinguished

### 4. Conversational Continuity Test
- **Target Issue**: Testing if continuity instructions work properly
- Multi-turn: Building expense tracking app → Components → State management
- Expected: Maintains context without formulaic references
- Validates: Natural context flow without robotic transitions

### 5. Response Length Appropriateness Test
- **Target Issue**: Testing adaptive response length
- Simple: "What's useState?" → max 200 chars
- Complex: "Philosophical implications of AI consciousness" → min 300 chars
- Validates: Response length matches query complexity

### 6. Memory Recall Across Conversations
- User shares information (learning Spanish, favorite color is blue)
- Follow-up asks for recall
- Expected: System recalls Spanish from previous turn
- Validates: Cross-turn memory works

### 7. Complex Reasoning Query Routing
- Query: Philosophical analysis of AI consciousness
- Expected: Routes to Claude Sonnet for complex reasoning
- Validates: Substantial response length (>500 chars)

### 8. Web Search Integration
- Query: Latest AI safety research in 2025
- Expected: Web search performed, current information returned
- Validates: No "knowledge cutoff" responses

## Usage

### From Terminal

```bash
# Run all conversation tests
cd apps/llm-gateway
pnpm test:conversation

# With custom configuration
GATEWAY_URL=http://localhost:8787 \
TEST_API_KEY=your-key \
TEST_USER_ID=test-user \
pnpm test:conversation
```

### From Node.js

```typescript
import { runTests } from './src/ConversationFlowTester.js';

const summary = await runTests(
  'http://localhost:8787',
  'your-api-key',
  'test-user-id'
);

console.log(`Success rate: ${summary.successRate}%`);
console.log(`Passed: ${summary.passed}/${summary.totalTests}`);
```

## Output

The tester provides:

1. **Real-time progress** - Shows each test as it runs
2. **Detailed failures** - Lists specific issues for failed tests
3. **Summary statistics** - Overall success rate and counts
4. **Recommendations** - Actionable suggestions for improvements

### Example Output

```
🧪 Starting Conversation Flow Tests for Your Architecture

Testing: Memory Recall Across Conversations
✅ PASSED (1234ms)

Testing: Complex Reasoning Query Routing
✅ PASSED (5678ms)

Testing: Web Search Integration
❌ FAILED (2345ms): Expected web search but none performed

📊 Test Summary:
Success Rate: 83.3%
Passed: 5/6

💡 Recommendations:
- Check web search configuration and API keys
```

## Environment Variables

- `GATEWAY_URL` - Base URL for LLM Gateway (default: `http://localhost:8787`)
- `TEST_API_KEY` - API key for authentication (default: `test-key`)
- `TEST_USER_ID` - User ID for testing (default: `test-user`)

## Architecture

The tester:

1. **Initiates conversations** - Sends messages via `/v1/chat/stream`
2. **Processes SSE streams** - Extracts content and metadata
3. **Validates responses** - Checks against expected behaviors
4. **Generates reports** - Provides actionable feedback

## Customization

### Adding New Test Scenarios

```typescript
const myTest: ConversationTest = {
  name: "My Custom Test",
  userId: "test-user",
  scenario: {
    turns: [
      {
        user: "Your test prompt here",
        expectedInResponse: ["expected", "keywords"],
        expectWebSearch: true
      }
    ]
  },
  expectedBehaviors: [
    {
      type: 'accuracy',
      description: 'Should provide accurate information',
      validator: (response, metadata) => response.length > 100
    }
  ]
};
```

### Custom Validators

```typescript
const customValidator = (response: string, metadata: any) => {
  // Your validation logic
  return response.includes('expected');
};
```

## Limitations

1. **Model Information** - Currently not available in SSE stream, validated via behavior
2. **Memory Service** - Requires memory service to be running and configured
3. **Web Search** - Requires search configuration and API keys
4. **Rate Limiting** - Includes delays between tests to avoid rate limits

## Integration

### CI/CD

```yaml
# .github/workflows/tests.yml
- name: Run Conversation Tests
  run: |
    pnpm --filter @llm-gateway/app test:conversation
  env:
    GATEWAY_URL: http://localhost:8787
    TEST_API_KEY: ${{ secrets.TEST_API_KEY }}
```

### Local Development

```bash
# Terminal 1: Start gateway
pnpm dev:gateway

# Terminal 2: Start memory service
# (if needed)

# Terminal 3: Run tests
pnpm --filter @llm-gateway/app test:conversation
```

## Troubleshooting

### "API error: 401"
- Check `TEST_API_KEY` matches your gateway configuration
- Verify authentication middleware is configured

### "Expected web search but none performed"
- Check `WEB_SEARCH_ENABLED` in gateway config
- Verify search API keys are configured
- Review query analysis logic in `QueryAnalyzer.ts`

### "Expected memory recall but none occurred"
- Ensure memory service is running
- Check memory service DB path configuration
- Verify user ID matches between tests

### Tests timing out
- Increase timeouts in test configuration
- Check gateway performance and resource limits
- Review network connectivity

## Future Enhancements

- [ ] Model routing validation with actual model info
- [ ] Integration with actual memory service DB
- [ ] Parallel test execution
- [ ] Visual test dashboard
- [ ] Performance benchmarking
- [ ] Regression test detection

## Contributing

When adding new test scenarios:

1. Follow existing test structure
2. Include clear descriptions
3. Add appropriate validators
4. Update this documentation
5. Run existing tests to ensure no regressions

## License

See main repository license.

