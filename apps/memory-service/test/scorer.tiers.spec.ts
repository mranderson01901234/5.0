/**
 * Tier-aware scorer tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  detectTier,
  calculateTierAwareScore,
  loadTierConfig,
  clearCrossThreadCache,
  type ScoringInput,
  type MemoryTier,
} from '../src/scorer';

describe('Tier Detection', () => {
  beforeEach(() => {
    clearCrossThreadCache();
  });

  it('should detect TIER2 for preference patterns', () => {
    const inputs: ScoringInput[] = [
      {
        content: 'I prefer TypeScript over JavaScript',
        role: 'user',
        timestamp: Date.now(),
        userId: 'user1',
        threadId: 'thread1',
      },
      {
        content: 'My goal is to learn React this month',
        role: 'user',
        timestamp: Date.now(),
        userId: 'user1',
        threadId: 'thread1',
      },
      {
        content: 'I always use async/await instead of promises',
        role: 'user',
        timestamp: Date.now(),
        userId: 'user1',
        threadId: 'thread1',
      },
      {
        content: 'I want to avoid using any in TypeScript',
        role: 'user',
        timestamp: Date.now(),
        userId: 'user1',
        threadId: 'thread1',
      },
    ];

    for (const input of inputs) {
      const tier = detectTier(input);
      expect(tier).toBe('TIER2');
    }
  });

  it('should detect TIER1 for cross-thread content', () => {
    const content = 'This is important context about the project';
    const userId = 'user1';

    // First occurrence in thread1 -> TIER3
    const input1: ScoringInput = {
      content,
      role: 'user',
      timestamp: Date.now(),
      userId,
      threadId: 'thread1',
    };
    expect(detectTier(input1)).toBe('TIER3');

    // Second occurrence in thread2 -> TIER1 (cross-thread)
    const input2: ScoringInput = {
      content,
      role: 'user',
      timestamp: Date.now(),
      userId,
      threadId: 'thread2',
    };
    expect(detectTier(input2)).toBe('TIER1');
  });

  it('should detect TIER3 for general content', () => {
    const input: ScoringInput = {
      content: 'This is a general message without special markers',
      role: 'user',
      timestamp: Date.now(),
      userId: 'user1',
      threadId: 'thread1',
    };

    expect(detectTier(input)).toBe('TIER3');
  });
});

describe('Tier-Aware Scoring', () => {
  it('should apply TIER1 weights (emphasize relevance and recency)', () => {
    const input: ScoringInput = {
      content: 'Important project requirement about API design',
      role: 'user',
      timestamp: Date.now(),
      userId: 'user1',
      threadId: 'thread1',
    };

    const config = loadTierConfig('TIER1');
    const result = calculateTierAwareScore(input, config);

    expect(result.tier).toBeDefined();
    expect(result.score).toBeGreaterThan(0);
    expect(result.factors).toHaveProperty('relevance');
    expect(result.factors).toHaveProperty('importance');
    expect(result.factors).toHaveProperty('recency');
    expect(result.factors).toHaveProperty('coherence');

    // TIER1 emphasizes relevance (0.45) and recency (0.25)
    const manualScore =
      0.45 * result.factors.relevance +
      0.25 * result.factors.importance +
      0.25 * result.factors.recency +
      0.05 * result.factors.coherence;

    expect(result.score).toBeCloseTo(manualScore, 2);
  });

  it('should apply TIER2 weights (emphasize importance)', () => {
    const input: ScoringInput = {
      content: 'I prefer using React hooks instead of class components',
      role: 'user',
      timestamp: Date.now(),
      userId: 'user1',
      threadId: 'thread1',
    };

    const config = loadTierConfig('TIER2');
    const result = calculateTierAwareScore(input, config);

    // TIER2 emphasizes importance (0.45)
    const manualScore =
      0.30 * result.factors.relevance +
      0.45 * result.factors.importance +
      0.15 * result.factors.recency +
      0.10 * result.factors.coherence;

    expect(result.score).toBeCloseTo(manualScore, 2);
  });

  it('should apply TIER3 weights (balanced)', () => {
    const input: ScoringInput = {
      content: 'This is a general discussion about software patterns',
      role: 'user',
      timestamp: Date.now(),
      userId: 'user1',
      threadId: 'thread1',
    };

    const config = loadTierConfig('TIER3');
    const result = calculateTierAwareScore(input, config);

    // TIER3 uses balanced weights
    const manualScore =
      0.40 * result.factors.relevance +
      0.20 * result.factors.importance +
      0.30 * result.factors.recency +
      0.10 * result.factors.coherence;

    expect(result.score).toBeCloseTo(manualScore, 2);
  });
});

describe('Tier Config Loading', () => {
  it('should load TIER1 config', () => {
    const config = loadTierConfig('TIER1');
    expect(config.name).toBe('cross_recent');
    expect(config.saveThreshold).toBe(0.62);
    expect(config.ttlDays).toBe(120);
    expect(config.decayPerWeek).toBe(0.01);
  });

  it('should load TIER2 config', () => {
    const config = loadTierConfig('TIER2');
    expect(config.name).toBe('prefs_goals');
    expect(config.saveThreshold).toBe(0.70);
    expect(config.ttlDays).toBe(365);
    expect(config.decayPerWeek).toBe(0.005);
  });

  it('should load TIER3 config', () => {
    const config = loadTierConfig('TIER3');
    expect(config.name).toBe('general');
    expect(config.saveThreshold).toBe(0.70);
    expect(config.ttlDays).toBe(90);
    expect(config.decayPerWeek).toBe(0.02);
  });
});

describe('Cross-Thread Cache', () => {
  beforeEach(() => {
    clearCrossThreadCache();
  });

  it('should track content across threads for same user', () => {
    const content = 'Project uses microservices architecture';
    const userId = 'user1';

    // First mention in thread1
    detectTier({
      content,
      role: 'user',
      timestamp: Date.now(),
      userId,
      threadId: 'thread1',
    });

    // Second mention in thread2 should be TIER1
    const tier = detectTier({
      content,
      role: 'user',
      timestamp: Date.now(),
      userId,
      threadId: 'thread2',
    });

    expect(tier).toBe('TIER1');
  });

  it('should not track content across different users', () => {
    const content = 'Shared knowledge about React';

    // User1 mentions in thread1
    detectTier({
      content,
      role: 'user',
      timestamp: Date.now(),
      userId: 'user1',
      threadId: 'thread1',
    });

    // User2 mentions in thread2 should still be TIER3
    const tier = detectTier({
      content,
      role: 'user',
      timestamp: Date.now(),
      userId: 'user2',
      threadId: 'thread2',
    });

    expect(tier).toBe('TIER3');
  });

  it('should handle cache clearing', () => {
    const content = 'Test content';
    const userId = 'user1';

    // Add to cache
    detectTier({
      content,
      role: 'user',
      timestamp: Date.now(),
      userId,
      threadId: 'thread1',
    });

    // Clear cache
    clearCrossThreadCache(userId);

    // Should not detect as cross-thread anymore
    const tier = detectTier({
      content,
      role: 'user',
      timestamp: Date.now(),
      userId,
      threadId: 'thread2',
    });

    expect(tier).toBe('TIER3');
  });
});
