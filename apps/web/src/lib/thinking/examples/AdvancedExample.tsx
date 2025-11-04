/**
 * Advanced integration example - Full-featured chat with thinking customization
 */

import React, { useState, useEffect } from 'react';
import { ThinkingDisplay } from '../../../components/thinking/ThinkingDisplay';
import { useThinking } from '../../../hooks/useThinking';
import { getThinkingStorage } from '../ThinkingStorage';
import '../../../components/thinking/ThinkingDisplay.css';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  thinking?: {
    steps: any[];
    category: string;
  };
}

export function AdvancedThinkingExample() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [query, setQuery] = useState('');
  const [detailLevel, setDetailLevel] = useState<'minimal' | 'normal' | 'detailed'>('normal');
  const [storageStats, setStorageStats] = useState<any>(null);

  const thinking = useThinking();

  // Load storage stats
  useEffect(() => {
    const loadStats = async () => {
      const storage = getThinkingStorage();
      const stats = await storage.getStats();
      setStorageStats(stats);
    };
    loadStats();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    // Add user message
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: query
    };
    setMessages(prev => [...prev, userMessage]);

    // Start thinking
    thinking.startThinking(query);

    // Simulate API response
    setTimeout(() => {
      thinking.stopThinking();

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `Response to: "${query}"\n\nCategory: ${thinking.context?.category}\nComplexity: ${thinking.context?.complexity}\nKeywords: ${thinking.context?.keywords.join(', ')}`,
        thinking: {
          steps: thinking.steps,
          category: thinking.context?.category || 'general'
        }
      };

      setMessages(prev => [...prev, assistantMessage]);
      thinking.reset();
    }, thinking.estimateTime(query));

    setQuery('');
  };

  const handleClearStorage = async () => {
    const storage = getThinkingStorage();
    await storage.clearAll();
    const stats = await storage.getStats();
    setStorageStats(stats);
  };

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2>Advanced Thinking System</h2>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <label style={{ fontSize: '14px' }}>
            Detail Level:
            <select
              value={detailLevel}
              onChange={(e) => setDetailLevel(e.target.value as any)}
              style={{ marginLeft: '8px', padding: '4px 8px' }}
            >
              <option value="minimal">Minimal</option>
              <option value="normal">Normal</option>
              <option value="detailed">Detailed</option>
            </select>
          </label>
        </div>
      </div>

      {/* Storage Stats */}
      {storageStats && (
        <div style={{
          padding: '12px',
          backgroundColor: '#f0f9ff',
          borderRadius: '8px',
          marginBottom: '20px',
          fontSize: '14px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <strong>Storage:</strong> {storageStats.patternCount} patterns, {storageStats.cacheSize} cached queries
            {storageStats.storageEstimate && (
              <span> | {Math.round((storageStats.storageEstimate.usage || 0) / 1024)} KB used</span>
            )}
          </div>
          <button
            onClick={handleClearStorage}
            style={{
              padding: '4px 12px',
              fontSize: '12px',
              backgroundColor: '#ef4444',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Clear Storage
          </button>
        </div>
      )}

      {/* Chat Messages */}
      <div style={{
        border: '1px solid #e5e7eb',
        borderRadius: '8px',
        padding: '16px',
        marginBottom: '20px',
        maxHeight: '500px',
        overflowY: 'auto',
        backgroundColor: '#fafafa'
      }}>
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', color: '#9ca3af', padding: '40px' }}>
            No messages yet. Start a conversation!
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            style={{
              marginBottom: '16px',
              padding: '12px',
              backgroundColor: message.role === 'user' ? '#dbeafe' : 'white',
              borderRadius: '8px'
            }}
          >
            <div style={{ fontWeight: 'bold', marginBottom: '8px', textTransform: 'capitalize' }}>
              {message.role}
            </div>
            <div style={{ whiteSpace: 'pre-wrap' }}>{message.content}</div>

            {message.thinking && (
              <div style={{ marginTop: '12px' }}>
                <ThinkingDisplay
                  steps={message.thinking.steps}
                  isComplete={true}
                  showDetailLevel={detailLevel}
                />
              </div>
            )}
          </div>
        ))}

        {/* Active thinking */}
        {thinking.isThinking && (
          <div style={{
            marginBottom: '16px',
            padding: '12px',
            backgroundColor: 'white',
            borderRadius: '8px'
          }}>
            <ThinkingDisplay
              steps={thinking.steps}
              isComplete={thinking.isComplete}
              showDetailLevel={detailLevel}
            />
          </div>
        )}
      </div>

      {/* Input Form */}
      <form onSubmit={handleSubmit}>
        <div style={{ display: 'flex', gap: '10px' }}>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Try: 'write a function to sort an array' or 'explain quantum computing'..."
            style={{
              flex: 1,
              padding: '12px',
              fontSize: '16px',
              border: '1px solid #d1d5db',
              borderRadius: '8px'
            }}
            disabled={thinking.isThinking}
          />
          <button
            type="submit"
            disabled={thinking.isThinking || !query.trim()}
            style={{
              padding: '12px 24px',
              fontSize: '16px',
              backgroundColor: thinking.isThinking || !query.trim() ? '#d1d5db' : '#2563eb',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: thinking.isThinking || !query.trim() ? 'not-allowed' : 'pointer',
              fontWeight: 'bold'
            }}
          >
            Send
          </button>
        </div>
      </form>

      {/* Example Queries */}
      <div style={{ marginTop: '20px' }}>
        <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px' }}>
          Try these example queries:
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {[
            'Write a function to reverse a string',
            'Explain how React hooks work',
            'Debug this TypeError: Cannot read property of undefined',
            'Design a REST API for a blog',
            'Optimize this slow database query'
          ].map((example) => (
            <button
              key={example}
              onClick={() => setQuery(example)}
              style={{
                padding: '6px 12px',
                fontSize: '13px',
                backgroundColor: '#f3f4f6',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
            >
              {example}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
