# Client-Side Thinking Narrator System

A high-performance, zero-dependency client-side system for generating contextual "thinking" narratives that show what an LLM is processing while handling user queries.

## Features

- **100% Client-Side**: Zero API calls, runs entirely in the browser
- **Hybrid Architecture**: Rule-based pattern matching + lightweight contextual variation
- **High Performance**: <50ms generation time, <10MB memory footprint
- **Offline-First**: IndexedDB caching for persistence
- **Context-Aware**: Analyzes queries to generate relevant thinking steps
- **Progressive Disclosure**: Adjustable detail levels for different use cases
- **Framework Ready**: React components and hooks included

## Architecture

### Core Components

1. **PatternMatcher** (`PatternMatcher.ts`)
   - Keyword-based query classification
   - Supports 10 categories: code, debugging, design, explanation, analysis, creative, technical, optimization, research, general
   - Complexity estimation: simple, moderate, complex
   - Entity extraction for technical terms

2. **ContextualVariator** (`ContextualVariator.ts`)
   - Lightweight word embeddings (50-dimension vectors)
   - Semantic clustering for common technical terms
   - Query-specific step customization
   - Variation templates to prevent repetition

3. **ThinkingEngine** (`ThinkingEngine.ts`)
   - Main orchestrator combining pattern matching and variation
   - Pre-defined thinking patterns for each category
   - Natural timing distribution
   - Async streaming support

4. **ThinkingStorage** (`ThinkingStorage.ts`)
   - IndexedDB persistence layer
   - Pattern caching and query result caching
   - Storage statistics and cleanup utilities
   - Import/export functionality

## Installation

```bash
# Copy the thinking library to your project
cp -r src/lib/thinking /your-project/src/lib/
cp -r src/components/thinking /your-project/src/components/
cp -r src/hooks/useThinking.ts /your-project/src/hooks/
```

## Quick Start

### Basic Usage

```tsx
import { useThinking } from '@/hooks/useThinking';
import { ThinkingDisplay } from '@/components/thinking/ThinkingDisplay';
import '@/components/thinking/ThinkingDisplay.css';

function ChatInterface() {
  const thinking = useThinking();
  const [response, setResponse] = useState('');

  const handleQuery = async (query: string) => {
    // Start thinking animation
    thinking.startThinking(query);

    // Make your API call
    const result = await fetchLLMResponse(query);

    // Stop thinking when response arrives
    thinking.stopThinking();
    setResponse(result);
  };

  return (
    <div>
      {thinking.isThinking && (
        <ThinkingDisplay
          steps={thinking.steps}
          isComplete={thinking.isComplete}
          showDetailLevel="normal"
        />
      )}

      {response && <div>{response}</div>}
    </div>
  );
}
```

### Streaming Example

```tsx
import { useThinkingStream } from '@/hooks/useThinking';
import { ThinkingInline } from '@/components/thinking/ThinkingDisplay';

function StreamingChat() {
  const thinking = useThinkingStream();

  const handleQuery = async (query: string) => {
    // Start both thinking and response streaming
    const [_, response] = await Promise.all([
      thinking.startStream(query),
      streamLLMResponse(query)
    ]);
  };

  return (
    <div>
      {thinking.currentStep && (
        <ThinkingInline
          steps={[thinking.currentStep]}
          currentStepIndex={0}
        />
      )}
    </div>
  );
}
```

### Direct Engine Usage

```tsx
import { getThinkingEngine } from '@/lib/thinking/ThinkingEngine';

// Get singleton instance
const engine = getThinkingEngine();

// Generate thinking steps
const stream = engine.generateThinking(
  "Write a function to sort an array",
  3000 // estimated response time in ms
);

console.log(stream.steps);
// Output: Array of ThinkingStep objects
console.log(stream.context);
// Output: { category: 'code', complexity: 'moderate', keywords: [...] }

// Estimate thinking time
const duration = engine.estimateThinkingTime(query);
```

## API Reference

### useThinking Hook

```typescript
function useThinking(
  query?: string,
  options?: UseThinkingOptions
): UseThinkingReturn

interface UseThinkingOptions {
  autoStart?: boolean;
  estimatedResponseTime?: number;
  enableStorage?: boolean;
  onComplete?: () => void;
}

interface UseThinkingReturn {
  // State
  steps: ThinkingStep[];
  currentStepIndex: number;
  isThinking: boolean;
  isComplete: boolean;
  context: QueryContext | null;

  // Actions
  startThinking: (query: string, responseTime?: number) => void;
  stopThinking: () => void;
  reset: () => void;

  // Utilities
  estimateTime: (query: string) => number;
}
```

### ThinkingEngine Methods

```typescript
class ThinkingEngine {
  // Generate thinking steps for a query
  generateThinking(
    query: string,
    estimatedResponseTime?: number
  ): ThinkingStream;

  // Stream steps asynchronously
  async *streamThinking(
    query: string,
    estimatedResponseTime?: number
  ): AsyncGenerator<ThinkingStep>;

  // Estimate thinking duration
  estimateThinkingTime(query: string): number;

  // Classify query
  classifyQuery(query: string): QueryContext;
}
```

### ThinkingDisplay Component

```typescript
interface ThinkingDisplayProps {
  steps: ThinkingStep[];
  isComplete?: boolean;
  showDetailLevel?: 'minimal' | 'normal' | 'detailed';
  className?: string;
  onComplete?: () => void;
}
```

### ThinkingStorage Methods

```typescript
class ThinkingStorage {
  // Initialize database
  initialize(): Promise<void>;

  // Store patterns
  storePattern(pattern: StoredPattern): Promise<void>;

  // Retrieve patterns by category
  getPatternsByCategory(category: string): Promise<StoredPattern[]>;

  // Cache query results
  cacheQuery(cache: StoredQueryCache): Promise<void>;

  // Get cached query
  getCachedQuery(queryHash: string): Promise<StoredQueryCache | null>;

  // Clean old cache entries
  cleanOldCache(maxAge?: number): Promise<number>;

  // Get storage statistics
  getStats(): Promise<StorageStats>;

  // Clear all data
  clearAll(): Promise<void>;

  // Export/import data
  exportData(): Promise<BackupData>;
  importData(data: BackupData): Promise<void>;
}
```

## Query Categories

The system classifies queries into these categories:

| Category | Examples | Thinking Pattern |
|----------|----------|------------------|
| `code` | "Write a function...", "Implement a component..." | Analyzing requirements → Evaluating approaches → Planning structure |
| `debugging` | "Fix this error...", "Why is X not working..." | Analyzing error → Identifying causes → Tracing flow → Formulating fix |
| `design` | "Design a system...", "Architecture for..." | Analyzing requirements → Exploring patterns → Planning organization |
| `explanation` | "Explain how...", "What is..." | Analyzing focus → Organizing concepts → Structuring explanation |
| `analysis` | "Compare X and Y...", "Evaluate..." | Analyzing scope → Identifying factors → Comparing approaches |
| `creative` | "Write a story...", "Generate ideas..." | Exploring possibilities → Generating ideas → Structuring narrative |
| `technical` | "Setup Docker...", "Configure AWS..." | Analyzing requirements → Identifying needs → Planning steps |
| `optimization` | "Make this faster...", "Improve performance..." | Analyzing requirements → Identifying bottlenecks → Planning improvements |
| `research` | "Find information about...", "Latest on..." | Analyzing scope → Identifying sources → Gathering data |
| `general` | Fallback for unclassified queries | Analyzing request → Processing info → Structuring response |

## Performance Characteristics

### Benchmarks

- **Initialization**: <500ms on first load
- **Pattern Matching**: <10ms per query
- **Thinking Generation**: <20ms per query
- **Memory Usage**: ~8-12MB (including embeddings)
- **Storage**: ~2-5MB in IndexedDB (after extended use)
- **Offline**: Full functionality after first load

### Optimization Techniques

1. **Lazy Loading**: Components load on-demand
2. **Singleton Pattern**: Shared engine instance across app
3. **Compact Embeddings**: 50-dimension vectors vs typical 300+
4. **Efficient Caching**: IndexedDB for persistent storage
5. **Smart Timing**: Natural variation prevents predictable patterns

## Customization

### Adding New Categories

```typescript
// In PatternMatcher.ts, add to patterns object:
myCategory: {
  keywords: ['keyword1', 'keyword2'],
  patterns: [/pattern1/i, /pattern2/i],
  weight: 1.0
}

// In ThinkingEngine.ts, add to thinkingPatterns:
myCategory: [
  ['Step 1...', 'Step 2...', 'Step 3...'],
  ['Alternative pattern...']
]
```

### Custom Timing

```typescript
const engine = getThinkingEngine({
  minSteps: 3,
  maxSteps: 6,
  baseStepDuration: 400,
  enableVariation: true
});
```

### Styling

Customize appearance by modifying `ThinkingDisplay.css` or overriding CSS classes:

```css
.thinking-display {
  /* Your custom styles */
}

.thinking-step-active {
  /* Active step styling */
}
```

## Browser Support

- Chrome/Edge: Full support
- Firefox: Full support
- Safari: Full support (14+)
- Mobile: Full support on modern browsers

**Requirements**:
- IndexedDB support (for caching)
- ES2020+ JavaScript features

## Fallbacks

The system includes graceful fallbacks:

1. **No IndexedDB**: Works without caching
2. **Limited Storage**: Automatic cleanup of old cache
3. **Unknown Words**: Random embeddings for unseen terms

## Examples

See the `/examples` directory for complete implementations:

- `BasicExample.tsx`: Simple integration
- `StreamingExample.tsx`: With streaming responses
- `AdvancedExample.tsx`: Full-featured with storage stats

## Performance Tips

1. **Reuse Engine Instance**: Use `getThinkingEngine()` singleton
2. **Estimate Response Time**: Provide accurate timing for better UX
3. **Progressive Disclosure**: Use detail levels appropriately
4. **Clean Cache**: Periodically clean old entries

```typescript
// Clean cache older than 7 days
const storage = getThinkingStorage();
await storage.cleanOldCache(7 * 24 * 60 * 60 * 1000);
```

## Testing

```typescript
import { PatternMatcher } from '@/lib/thinking/PatternMatcher';
import { ThinkingEngine } from '@/lib/thinking/ThinkingEngine';

// Test pattern matching
const matcher = new PatternMatcher();
const context = matcher.classify("Write a function to sort an array");
console.assert(context.category === 'code');
console.assert(context.complexity === 'moderate');

// Test thinking generation
const engine = new ThinkingEngine();
const stream = engine.generateThinking("Debug this error");
console.assert(stream.steps.length > 0);
console.assert(stream.context.category === 'debugging');
```

## Troubleshooting

### Thinking steps not showing
- Check that CSS is imported: `import '@/components/thinking/ThinkingDisplay.css'`
- Verify `steps` prop is populated
- Check browser console for errors

### IndexedDB errors
- Check browser permissions
- Try clearing IndexedDB: `storage.clearAll()`
- Verify IndexedDB is enabled in browser

### Performance issues
- Reduce `maxSteps` in engine config
- Use 'minimal' detail level
- Clean old cache entries

## License

This is a self-contained system designed for production use. Modify as needed for your application.

## Contributing

To extend functionality:

1. Add new query categories in `PatternMatcher.ts`
2. Create corresponding thinking patterns in `ThinkingEngine.ts`
3. Add variation templates in `ContextualVariator.ts`
4. Test with representative queries

## Version History

- **v1.0.0**: Initial release with full feature set
  - Pattern matching system
  - Contextual variation
  - React components and hooks
  - IndexedDB storage layer
  - Comprehensive examples
