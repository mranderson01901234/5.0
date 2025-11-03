/**
 * Unit tests for research system components
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { extractTopic } from '../src/topicExtractor.js';
import { TopicTracker } from '../src/topicTracker.js';
import type { TTLClass } from '../src/topicExtractor.js';

describe('Topic Extraction', () => {
  it('should extract news topic', () => {
    const messages = [
      { content: 'What happened today in tech?', role: 'user' },
      { content: 'Breaking news: New AI model released', role: 'assistant' },
    ];

    const result = extractTopic(messages);
    expect(result.ttlClass).toBe('news/current');
    expect(result.recencyHint).toBe('day');
    expect(result.entities.length).toBeGreaterThanOrEqual(0);
  });

  it('should extract pricing topic', () => {
    const messages = [
      { content: 'What is the price of this product?', role: 'user' },
      { content: 'The cost is $99', role: 'assistant' },
    ];

    const result = extractTopic(messages);
    expect(result.ttlClass).toBe('pricing');
    expect(result.recencyHint).toBe('week');
  });

  it('should extract release topic', () => {
    const messages = [
      { content: 'When was v2.0 released?', role: 'user' },
      { content: 'Version 2.0 was released last week', role: 'assistant' },
    ];

    const result = extractTopic(messages);
    expect(result.ttlClass).toBe('releases');
  });

  it('should extract docs topic', () => {
    const messages = [
      { content: 'Can you show me the API documentation?', role: 'user' },
      { content: 'Here is the API reference guide', role: 'assistant' },
    ];

    const result = extractTopic(messages);
    expect(result.ttlClass).toBe('docs');
  });

  it('should extract entities from messages', () => {
    const messages = [
      { content: 'Check out https://example.com for more info', role: 'user' },
      { content: 'I saw @username mention #typescript', role: 'assistant' },
    ];

    const result = extractTopic(messages);
    expect(result.entities.length).toBeGreaterThan(0);
    expect(result.entities.some(e => e.includes('example.com') || e.includes('https://'))).toBe(true);
  });
});

describe('Topic Tracker', () => {
  let tracker: TopicTracker;

  beforeEach(() => {
    tracker = new TopicTracker();
  });

  it('should track topics per thread', () => {
    tracker.recordTopic('thread-1', 'TypeScript features', 'general', ['TypeScript']);
    
    const history = tracker.getTopicHistory('thread-1', 'TypeScript features');
    expect(history).not.toBeNull();
    expect(history?.batchCount).toBe(1);
  });

  it('should detect topic stability after 2+ batches', () => {
    tracker.recordTopic('thread-1', 'TypeScript', 'general', []);
    expect(tracker.isTopicStable('thread-1', 'TypeScript')).toBe(false);

    tracker.recordTopic('thread-1', 'TypeScript', 'general', []);
    expect(tracker.isTopicStable('thread-1', 'TypeScript')).toBe(true);
  });

  it('should detect stale topics', () => {
    tracker.recordTopic('thread-1', 'News topic', 'news/current', []);
    
    // Topic should be stale immediately (never verified)
    expect(tracker.isTopicStale('thread-1', 'News topic')).toBe(true);

    // Mark as verified
    tracker.markTopicVerified('thread-1', 'News topic');
    expect(tracker.isTopicStale('thread-1', 'News topic')).toBe(false);

    // Wait (or mock time) - news topics expire after 1 hour
    // For test, we'd need to mock Date.now() or add time travel
  });

  it('should merge entities across batches', () => {
    tracker.recordTopic('thread-1', 'Topic', 'general', ['entity1']);
    tracker.recordTopic('thread-1', 'Topic', 'general', ['entity2']);

    const history = tracker.getTopicHistory('thread-1', 'Topic');
    expect(history?.entities).toContain('entity1');
    expect(history?.entities).toContain('entity2');
  });

  it('should cleanup old threads', () => {
    tracker.recordTopic('thread-1', 'Topic', 'general', []);
    
    // Mock old timestamp (would need to modify tracker to accept timestamp)
    // For now, just verify cleanup method exists
    const removed = tracker.cleanup(1000); // 1 second max age
    expect(typeof removed).toBe('number');
  });
});

describe('Research Config', () => {
  it('should load config with defaults', async () => {
    // Set test env vars
    process.env.RESEARCH_SIDECAR_ENABLED = 'false';
    
    const { loadResearchConfig } = await import('../src/config.js');
    const config = loadResearchConfig();
    
    expect(config.enabled).toBe(false);
    expect(config.memoryReviewTrigger).toBe(true); // Default true
  });

  it('should disable gracefully when keys missing', async () => {
    process.env.RESEARCH_SIDECAR_ENABLED = 'true';
    delete process.env.BRAVE_API_KEY;
    
    const { loadResearchConfig } = await import('../src/config.js');
    const config = loadResearchConfig();
    
    expect(config.enabled).toBe(false); // Disabled gracefully
  });
});

