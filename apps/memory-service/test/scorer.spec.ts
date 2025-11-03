import { describe, it, expect } from 'vitest';
import { calculateQualityScore, getDetailedScore } from '../src/scorer.js';

describe('Quality Scorer', () => {
  it('should score user preferences highly', () => {
    const score = calculateQualityScore({
      content: 'I always prefer TypeScript over JavaScript for all projects',
      role: 'user',
      timestamp: Date.now(),
    });

    expect(score).toBeGreaterThan(0.65); // Above threshold
  });

  it('should score generic small talk lowly', () => {
    const score = calculateQualityScore({
      content: 'ok',
      role: 'user',
      timestamp: Date.now(),
    });

    expect(score).toBeLessThan(0.65); // Below threshold
  });

  it('should score important decisions highly', () => {
    const score = calculateQualityScore({
      content: 'This is a critical requirement: we must use PostgreSQL',
      role: 'user',
      timestamp: Date.now(),
    });

    expect(score).toBeGreaterThan(0.65);
  });

  it('should score questions reasonably', () => {
    const score = calculateQualityScore({
      content: 'What is the best approach for handling authentication?',
      role: 'user',
      timestamp: Date.now(),
    });

    expect(score).toBeGreaterThan(0.5); // Should be significant
  });

  it('should score recent messages higher than old ones', () => {
    const now = Date.now();
    const threadStart = now - 10 * 60 * 1000; // 10 minutes ago

    const recentScore = calculateQualityScore({
      content: 'I prefer using React hooks',
      role: 'user',
      timestamp: now - 1000, // 1 second ago
      threadStartTime: threadStart,
    });

    const oldScore = calculateQualityScore({
      content: 'I prefer using React hooks',
      role: 'user',
      timestamp: now - 9 * 60 * 1000, // 9 minutes ago
      threadStartTime: threadStart,
    });

    expect(recentScore).toBeGreaterThan(oldScore);
  });

  it('should provide detailed breakdown', () => {
    const result = getDetailedScore({
      content: 'I always prefer TypeScript and never use JavaScript',
      role: 'user',
      timestamp: Date.now(),
    });

    expect(result.factors).toHaveProperty('relevance');
    expect(result.factors).toHaveProperty('importance');
    expect(result.factors).toHaveProperty('recency');
    expect(result.factors).toHaveProperty('coherence');
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThanOrEqual(1);
  });

  it('should score entity-rich content highly', () => {
    const score = calculateQualityScore({
      content: 'Check out https://example.com and email me at test@example.com',
      role: 'user',
      timestamp: Date.now(),
    });

    expect(score).toBeGreaterThan(0.5); // Entities boost relevance
  });

  it('should score coherent, well-structured content higher', () => {
    const goodScore = calculateQualityScore({
      content: 'I prefer using TypeScript because it provides better type safety. This is important for large projects.',
      role: 'user',
      timestamp: Date.now(),
    });

    const badScore = calculateQualityScore({
      content: 'typescript yeah',
      role: 'user',
      timestamp: Date.now(),
    });

    expect(goodScore).toBeGreaterThan(badScore);
  });

  it('should weight user messages higher than assistant', () => {
    const userScore = calculateQualityScore({
      content: 'I like using React',
      role: 'user',
      timestamp: Date.now(),
    });

    const assistantScore = calculateQualityScore({
      content: 'I like using React',
      role: 'assistant',
      timestamp: Date.now(),
    });

    expect(userScore).toBeGreaterThan(assistantScore);
  });
});
