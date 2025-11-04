# Integration Guide

## Quick Integration into Existing Chat App

### Step 1: Import Required Components

```tsx
import { useThinking } from '@/hooks/useThinking';
import { ThinkingDisplay } from '@/components/thinking/ThinkingDisplay';
import '@/components/thinking/ThinkingDisplay.css';
```

### Step 2: Add Hook to Chat Component

```tsx
function ChatComponent() {
  const [messages, setMessages] = useState([]);
  const thinking = useThinking();

  const handleSendMessage = async (userQuery: string) => {
    // Add user message
    addMessage({ role: 'user', content: userQuery });

    // Start thinking animation
    thinking.startThinking(userQuery);

    try {
      // Your existing API call
      const response = await fetch('/api/chat', {
        method: 'POST',
        body: JSON.stringify({ message: userQuery })
      });

      const data = await response.json();

      // Stop thinking when response arrives
      thinking.stopThinking();

      // Add assistant message
      addMessage({ role: 'assistant', content: data.response });
    } catch (error) {
      thinking.stopThinking();
      // Handle error
    }
  };

  return (
    <div>
      {/* Messages */}
      {messages.map(msg => <Message key={msg.id} {...msg} />)}

      {/* Thinking display */}
      {thinking.isThinking && (
        <ThinkingDisplay
          steps={thinking.steps}
          isComplete={thinking.isComplete}
          showDetailLevel="normal"
        />
      )}

      {/* Input */}
      <ChatInput onSend={handleSendMessage} />
    </div>
  );
}
```

### Step 3: For Streaming Responses

```tsx
import { useThinkingStream } from '@/hooks/useThinking';
import { ThinkingInline } from '@/components/thinking/ThinkingDisplay';

function StreamingChat() {
  const [currentMessage, setCurrentMessage] = useState('');
  const thinking = useThinkingStream();

  const handleSendMessage = async (query: string) => {
    setCurrentMessage('');

    // Start thinking stream in parallel with API stream
    thinking.startStream(query);

    // Stream from your API
    const response = await fetch('/api/stream', {
      method: 'POST',
      body: JSON.stringify({ message: query })
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        thinking.stopStream();
        break;
      }

      const chunk = decoder.decode(value);
      setCurrentMessage(prev => prev + chunk);
    }
  };

  return (
    <div>
      {/* Thinking inline display */}
      {thinking.currentStep && (
        <ThinkingInline
          steps={[thinking.currentStep]}
          currentStepIndex={0}
        />
      )}

      {/* Streaming message */}
      {currentMessage && <Message content={currentMessage} />}
    </div>
  );
}
```

## Integration Patterns

### Pattern 1: Pre-Response Thinking

Show thinking before the response arrives:

```tsx
const handleQuery = async (query: string) => {
  thinking.startThinking(query);
  const response = await apiCall(query);
  thinking.stopThinking();
  showResponse(response);
};
```

### Pattern 2: Parallel Thinking + Streaming

Show thinking alongside streaming content:

```tsx
const handleQuery = async (query: string) => {
  // Both run in parallel
  await Promise.all([
    thinking.startStream(query),
    streamApiResponse(query)
  ]);
};
```

### Pattern 3: Thinking with Estimated Time

Sync thinking duration with expected response time:

```tsx
const handleQuery = async (query: string) => {
  const estimatedTime = estimateResponseTime(query); // e.g., 3000ms

  thinking.startThinking(query, estimatedTime);
  const response = await apiCall(query);
  thinking.stopThinking();
};
```

### Pattern 4: Progressive Message History

Save thinking steps with each message:

```tsx
interface Message {
  role: 'user' | 'assistant';
  content: string;
  thinking?: {
    steps: ThinkingStep[];
    category: string;
  };
}

const handleQuery = async (query: string) => {
  thinking.startThinking(query);
  const response = await apiCall(query);
  thinking.stopThinking();

  // Save with thinking metadata
  const message: Message = {
    role: 'assistant',
    content: response,
    thinking: {
      steps: thinking.steps,
      category: thinking.context?.category || 'general'
    }
  };

  addMessage(message);
};
```

## Advanced Integration

### With React Query

```tsx
import { useMutation } from '@tanstack/react-query';
import { useThinking } from '@/hooks/useThinking';

function ChatWithReactQuery() {
  const thinking = useThinking();

  const chatMutation = useMutation({
    mutationFn: async (query: string) => {
      thinking.startThinking(query);
      return await apiCall(query);
    },
    onSuccess: () => {
      thinking.stopThinking();
    },
    onError: () => {
      thinking.stopThinking();
    }
  });

  return (
    <div>
      {thinking.isThinking && (
        <ThinkingDisplay steps={thinking.steps} />
      )}
    </div>
  );
}
```

### With Zustand Store

```tsx
import create from 'zustand';
import { ThinkingStep } from '@/lib/thinking';

interface ChatStore {
  thinkingSteps: ThinkingStep[];
  isThinking: boolean;
  startThinking: (query: string) => void;
  stopThinking: () => void;
}

const useChatStore = create<ChatStore>((set) => ({
  thinkingSteps: [],
  isThinking: false,

  startThinking: (query) => {
    const engine = getThinkingEngine();
    const stream = engine.generateThinking(query);

    set({
      thinkingSteps: stream.steps,
      isThinking: true
    });
  },

  stopThinking: () => {
    set({ isThinking: false });
  }
}));

// In component
function Chat() {
  const { thinkingSteps, isThinking } = useChatStore();

  return (
    <ThinkingDisplay
      steps={thinkingSteps}
      isComplete={!isThinking}
    />
  );
}
```

### With WebSocket Streaming

```tsx
function WebSocketChat() {
  const thinking = useThinkingStream();
  const [message, setMessage] = useState('');

  useEffect(() => {
    const ws = new WebSocket('wss://api.example.com/chat');

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === 'start') {
        thinking.startStream(data.query);
      } else if (data.type === 'chunk') {
        setMessage(prev => prev + data.content);
      } else if (data.type === 'end') {
        thinking.stopStream();
      }
    };

    return () => ws.close();
  }, []);

  return (
    <div>
      {thinking.currentStep && (
        <ThinkingInline steps={[thinking.currentStep]} />
      )}
      <Message content={message} />
    </div>
  );
}
```

## Styling Integration

### Custom Theme

```css
/* Override default styles */
.thinking-display {
  background: var(--thinking-bg);
  border-color: var(--thinking-border);
}

.thinking-step-active .thinking-step-indicator {
  color: var(--primary-color);
}

/* Dark mode customization */
[data-theme="dark"] .thinking-display {
  background: rgba(255, 255, 255, 0.03);
  border-color: rgba(255, 255, 255, 0.1);
}
```

### Tailwind CSS

```tsx
<ThinkingDisplay
  steps={thinking.steps}
  className="bg-gray-50 dark:bg-gray-900 rounded-lg shadow-sm"
/>
```

### CSS Modules

```tsx
import styles from './Chat.module.css';

<ThinkingDisplay
  steps={thinking.steps}
  className={styles.thinking}
/>
```

## Performance Tips

### 1. Memoize Thinking Component

```tsx
import { memo } from 'react';

const MemoizedThinking = memo(ThinkingDisplay, (prev, next) => {
  return prev.isComplete === next.isComplete &&
         prev.steps.length === next.steps.length;
});
```

### 2. Lazy Load

```tsx
const ThinkingDisplay = lazy(() =>
  import('@/components/thinking/ThinkingDisplay')
);

<Suspense fallback={<ThinkingLoader />}>
  <ThinkingDisplay steps={thinking.steps} />
</Suspense>
```

### 3. Debounce Rapid Queries

```tsx
import { useDebouncedCallback } from 'use-debounce';

const debouncedThinking = useDebouncedCallback(
  (query) => thinking.startThinking(query),
  300
);
```

## Testing

### Unit Test Example

```tsx
import { render, screen } from '@testing-library/react';
import { ThinkingDisplay } from '@/components/thinking/ThinkingDisplay';

describe('ThinkingDisplay', () => {
  it('shows thinking steps', () => {
    const steps = [
      { text: 'Analyzing query...', duration: 400, depth: 0 },
      { text: 'Processing...', duration: 500, depth: 0 }
    ];

    render(<ThinkingDisplay steps={steps} />);

    expect(screen.getByText(/Analyzing query/)).toBeInTheDocument();
  });
});
```

### Integration Test

```tsx
import { renderHook, act } from '@testing-library/react';
import { useThinking } from '@/hooks/useThinking';

describe('useThinking', () => {
  it('generates thinking steps', () => {
    const { result } = renderHook(() => useThinking());

    act(() => {
      result.current.startThinking('Write a function');
    });

    expect(result.current.isThinking).toBe(true);
    expect(result.current.steps.length).toBeGreaterThan(0);
  });
});
```

## Troubleshooting

### Thinking not appearing
1. Verify CSS is imported
2. Check `isThinking` state
3. Ensure `steps` array is populated

### Multiple thinking displays
Use unique keys when rendering in lists:
```tsx
{messages.map(msg => (
  <ThinkingDisplay key={msg.id} steps={msg.thinking?.steps} />
))}
```

### Performance issues
1. Use `showDetailLevel="minimal"` on mobile
2. Implement memoization
3. Lazy load component

## Next Steps

1. ✅ Import components and hooks
2. ✅ Add to chat handler
3. ✅ Test with real queries
4. ✅ Customize styling
5. ✅ Monitor performance
6. ✅ Add error handling
7. ✅ Implement caching (optional)

## Support

For issues or questions, see:
- `README.md` - Full documentation
- `PERFORMANCE.md` - Performance guide
- `examples/` - Complete examples
- `benchmark.ts` - Testing tools
