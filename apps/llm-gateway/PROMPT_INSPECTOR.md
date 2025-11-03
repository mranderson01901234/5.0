# Prompt Inspector

A diagnostic tool for analyzing your current system prompts, understanding how context preprocessing works, and identifying potential issues with prompt structure.

## Features

The Prompt Inspector provides:

1. **Base Prompt Analysis** - Shows the current base system prompt and its characteristics
2. **Sample Prompt Build** - Demonstrates how prompts are constructed with instructions and context
3. **Preprocessing Test** - Shows how raw context is transformed into natural narrative
4. **Quality Checks** - Validates conversational tone, memory integration, and structure
5. **Keyword Preservation** - Verifies important information isn't lost in preprocessing
6. **Actionable Recommendations** - Suggests improvements based on analysis

## Usage

### From Terminal

```bash
# Run prompt inspection
cd apps/llm-gateway
pnpm inspect:prompt

# Or from root
pnpm inspect:prompt
```

### Example Output

```
🔍 Current Prompt Analysis

=== BASE PROMPT ===
You are a sophisticated conversational AI assistant...

Length: 1234 characters

=== SAMPLE PROMPT BUILD ===
Built prompt structure:

--- Message 1 (system) ---
You are a sophisticated conversational AI assistant...

--- Message 2 (system) ---
IMPORTANT:
Be conversational and helpful

Provide detailed explanations when needed

--- Message 3 (system) ---
You mentioned learning React earlier. You prefer practical examples.

There's information about React, specifically about...

=== ANALYSIS ===
Total prompt length: 2456 characters
Estimated tokens: ~614
Conversational tone: ✅
Memory integration guidance: ✅
Uses system role: ✅

=== RECOMMENDATIONS ===
✅ Prompt inspection complete!

🔄 CONTEXT PREPROCESSING TEST

=== RAW MEMORY ===
[Memory] user is learning Spanish
[Memory] user's favorite color is blue
...

=== PREPROCESSED MEMORY ===
You mentioned learning Spanish earlier. You mentioned your favorite color being blue.
...

🔑 Keyword Preservation:
Memory keywords preserved: ✅
RAG keywords preserved: ✅
```

## What It Validates

### 1. Base Prompt
- Length and token estimation
- Presence of conversational language
- Memory integration instructions
- Overall structure

### 2. Preprocessing Quality
- **Memory Context**: `[Memory] user studied X` → natural narrative
- **RAG Context**: Structured info → readable references
- **Keyword Preservation**: Important terms aren't lost
- **Length Changes**: How preprocessing affects token usage

### 3. Prompt Structure
- System message organization
- Instruction priority handling
- Context integration
- Message count and length

### 4. Recommendations
- Missing conversational elements
- Overlong prompts
- Missing memory guidance
- Preprocessing issues

## Use Cases

### Debugging Poor Responses

```bash
# Check if prompt structure is causing issues
pnpm inspect:prompt

# Look for:
# - Overly long prompts
# - Missing conversational tone
# - Poor preprocessing
```

### Testing Preprocessing Changes

```bash
# After modifying ContextPreprocessor.ts
pnpm inspect:prompt

# Verify:
# - Keywords are preserved
# - Natural language flow
# - No information loss
```

### Optimizing Token Usage

```bash
# See current prompt size
pnpm inspect:prompt

# Estimated tokens shown for:
# - Base prompt
# - Sample built prompt
# - Each message component
```

### Validating New Features

```bash
# Before adding new instructions
pnpm inspect:prompt

# Check:
# - Prompt complexity
# - Instruction priority
# - System message count
```

## Understanding the Output

### Good Signs ✅

- **Conversational tone**: Uses "you", "your", natural language
- **Memory integration**: Includes guidance on using context
- **Keywords preserved**: Important terms survive preprocessing
- **Reasonable length**: Under 2000 chars per system message

### Warning Signs ⚠️

- **Too long**: Over 2000 chars might confuse some models
- **Robotic**: Lacks conversational indicators
- **Lost keywords**: Preprocessing removes important info
- **No memory guidance**: Missing instructions on context use

### Critical Issues ❌

- **Missing system role**: No system messages created
- **Zero length**: Empty prompts
- **Keyword loss**: Core information removed

## Integration

### CI/CD

```yaml
# .github/workflows/checks.yml
- name: Inspect Prompts
  run: pnpm inspect:prompt
  # Should complete without warnings
```

### Local Development

```bash
# Terminal 1: Make prompt changes
vim apps/llm-gateway/src/PromptBuilder.ts

# Terminal 2: Test impact
pnpm inspect:prompt

# Review output for issues
```

### Before Deploying

```bash
# Quick validation before release
pnpm inspect:prompt && echo "✅ Prompts look good!"
```

## Customization

### Adding More Checks

Edit `PromptInspector.ts`:

```typescript
// Add custom validation
const hasEthicsGuidance = fullPromptText.includes('ethics') || 
                         fullPromptText.includes('responsible');
console.log(`Ethics guidance: ${hasEthicsGuidance ? '✅' : '❌'}`);
```

### Testing Custom Contexts

Modify the test data in `testContextPreprocessing()`:

```typescript
const rawMemory = `Your custom memory format here`;
const preprocessed = preprocessContext(rawMemory, 'memory');
console.log('Custom preprocessing:', preprocessed);
```

### Analyzing Specific Scenarios

Create focused tests:

```typescript
function testSpecificScenario() {
  const builder = new PromptBuilder();
  // Your specific setup
  const built = builder.build();
  console.log('Your specific output:', built);
}
```

## Troubleshooting

### "Cannot find module 'PromptBuilder'"
- Ensure you're in the `apps/llm-gateway` directory
- Run `pnpm install` if needed

### "No output for preprocessing"
- Check `ContextPreprocessor.ts` is working
- Verify context types match: 'memory', 'rag', etc.

### "All checks fail"
- Review `PromptBuilder.getDefaultBasePrompt()`
- Check recent changes to prompt structure

### Different results each run
- Ensure consistent base prompt
- Check for dynamic content generation

## Advanced Usage

### Programmatic Access

```typescript
import { inspectCurrentPrompts, testContextPreprocessing } from './PromptInspector.js';

// Custom analysis
await inspectCurrentPrompts();
testContextPreprocessing();

// Access individual components
import { PromptBuilder } from './PromptBuilder.js';
const builder = new PromptBuilder();
const base = PromptBuilder.getDefaultBasePrompt();
console.log('Base prompt:', base);
```

### Comparing Versions

```bash
# Save current output
pnpm inspect:prompt > baseline.txt

# Make changes
vim src/PromptBuilder.ts

# Compare
pnpm inspect:prompt > new-output.txt
diff baseline.txt new-output.txt
```

### Performance Analysis

The inspector helps identify:

- **Token waste**: Unnecessary repetition
- **Over-preprocessing**: Context lost in transformation
- **Complexity**: Too many system messages
- **Length**: Exceeding model limits

## Best Practices

1. **Run regularly** - Check prompts after significant changes
2. **Review recommendations** - Don't ignore warnings
3. **Test preprocessing** - Verify context transformation quality
4. **Monitor keywords** - Ensure important info preserved
5. **Compare before/after** - Track impact of changes

## Related Tools

- **ConversationFlowTester** - Tests actual response quality
- **PromptBuilder.test.ts** - Unit tests for prompt building
- **ContextPreprocessor.test.ts** - Unit tests for preprocessing

## License

See main repository license.

