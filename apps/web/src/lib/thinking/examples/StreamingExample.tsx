/**
 * Streaming integration example - Shows thinking alongside streaming response
 */

import React, { useState } from 'react';
import { ThinkingInline } from '../../../components/thinking/ThinkingDisplay';
import { useThinkingStream } from '../../../hooks/useThinking';
import '../../../components/thinking/ThinkingDisplay.css';

export function StreamingThinkingExample() {
  const [query, setQuery] = useState('');
  const [streamedResponse, setStreamedResponse] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);

  const thinking = useThinkingStream();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setStreamedResponse('');
    setIsStreaming(true);

    // Start thinking stream
    const thinkingPromise = thinking.startStream(query);

    // Simulate streaming response (replace with actual streaming API)
    const simulateStreaming = async () => {
      const fullResponse = `Here's a detailed response to your query: "${query}"\n\nThis demonstrates how thinking can run alongside streaming content. The thinking display shows what the LLM is processing while the response streams in character by character.`;

      for (let i = 0; i < fullResponse.length; i++) {
        await new Promise(resolve => setTimeout(resolve, 20));
        setStreamedResponse(fullResponse.slice(0, i + 1));
      }
    };

    // Wait for both to complete
    await Promise.all([thinkingPromise, simulateStreaming()]);
    setIsStreaming(false);
  };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '20px' }}>
      <h2>Streaming with Thinking Example</h2>

      <form onSubmit={handleSubmit} style={{ marginBottom: '20px' }}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ask a question..."
          style={{
            width: '100%',
            padding: '12px',
            fontSize: '16px',
            border: '1px solid #ccc',
            borderRadius: '8px'
          }}
        />
        <button
          type="submit"
          disabled={isStreaming}
          style={{
            marginTop: '10px',
            padding: '10px 20px',
            fontSize: '16px',
            backgroundColor: isStreaming ? '#ccc' : '#2563eb',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: isStreaming ? 'not-allowed' : 'pointer'
          }}
        >
          {isStreaming ? 'Streaming...' : 'Submit'}
        </button>
      </form>

      {thinking.currentStep && (
        <ThinkingInline
          steps={[thinking.currentStep]}
          currentStepIndex={0}
        />
      )}

      {streamedResponse && (
        <div style={{
          marginTop: '20px',
          padding: '16px',
          backgroundColor: '#f9fafb',
          borderRadius: '8px',
          whiteSpace: 'pre-wrap',
          minHeight: '100px'
        }}>
          {streamedResponse}
          {isStreaming && <span style={{ animation: 'pulse 1s infinite' }}>▊</span>}
        </div>
      )}
    </div>
  );
}
