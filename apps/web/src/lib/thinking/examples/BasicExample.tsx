/**
 * Basic integration example - Simple chat with thinking display
 */

import React, { useState } from 'react';
import { ThinkingDisplay } from '../../../components/thinking/ThinkingDisplay';
import { useThinking } from '../../../hooks/useThinking';
import '../../../components/thinking/ThinkingDisplay.css';

export function BasicThinkingExample() {
  const [query, setQuery] = useState('');
  const [response, setResponse] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  const thinking = useThinking();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    // Start thinking animation
    thinking.startThinking(query);
    setIsGenerating(true);
    setResponse('');

    // Simulate API call (replace with actual API call)
    setTimeout(() => {
      thinking.stopThinking();
      setResponse(`Response to: "${query}"\n\nThis is where your actual LLM response would appear.`);
      setIsGenerating(false);
    }, thinking.estimateTime(query));
  };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '20px' }}>
      <h2>Basic Thinking Narrator Example</h2>

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
          disabled={isGenerating}
          style={{
            marginTop: '10px',
            padding: '10px 20px',
            fontSize: '16px',
            backgroundColor: isGenerating ? '#ccc' : '#2563eb',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: isGenerating ? 'not-allowed' : 'pointer'
          }}
        >
          {isGenerating ? 'Generating...' : 'Submit'}
        </button>
      </form>

      {thinking.isThinking && (
        <ThinkingDisplay
          steps={thinking.steps}
          isComplete={thinking.isComplete}
          showDetailLevel="normal"
        />
      )}

      {response && (
        <div style={{
          marginTop: '20px',
          padding: '16px',
          backgroundColor: '#f9fafb',
          borderRadius: '8px',
          whiteSpace: 'pre-wrap'
        }}>
          {response}
        </div>
      )}
    </div>
  );
}
