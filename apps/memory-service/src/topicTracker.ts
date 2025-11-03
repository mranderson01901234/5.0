/**
 * Topic stability tracking per thread
 * Tracks topics across batches to determine if research should trigger
 */

import { pino } from 'pino';
import type { TTLClass } from './topicExtractor.js';

const logger = pino({ name: 'topicTracker' });

export interface TopicHistory {
  topic: string;
  ttlClass: TTLClass;
  entities: string[];
  firstSeen: number;
  lastSeen: number;
  lastVerified: number | null; // Timestamp when research last verified this topic
  batchCount: number; // Number of batches where this topic appeared
}

interface ThreadTopicHistory {
  threadId: string;
  topics: Map<string, TopicHistory>; // topic -> history
  lastBatchTime: number;
}

// TTL mapping (in milliseconds)
const TTL_MAP: Record<TTLClass, number> = {
  'news/current': 60 * 60 * 1000, // 1 hour
  'pricing': 24 * 60 * 60 * 1000, // 24 hours
  'releases': 72 * 60 * 60 * 1000, // 72 hours
  'docs': 7 * 24 * 60 * 60 * 1000, // 7 days
  'general': 30 * 24 * 60 * 60 * 1000, // 30 days
};

export class TopicTracker {
  private histories: Map<string, ThreadTopicHistory> = new Map();

  /**
   * Record a topic seen in a batch
   */
  recordTopic(
    threadId: string,
    topic: string,
    ttlClass: TTLClass,
    entities: string[]
  ): void {
    const key = `${threadId}`;
    let threadHistory = this.histories.get(key);

    if (!threadHistory) {
      threadHistory = {
        threadId,
        topics: new Map(),
        lastBatchTime: Date.now(),
      };
      this.histories.set(key, threadHistory);
    }

    const topicKey = topic.toLowerCase().substring(0, 100); // Normalize topic key
    const existing = threadHistory.topics.get(topicKey);

    if (existing) {
      // Update existing topic
      existing.lastSeen = Date.now();
      existing.batchCount += 1;
      existing.entities = Array.from(new Set([...existing.entities, ...entities])); // Merge entities
      if (existing.ttlClass !== ttlClass) {
        // Use more specific TTL class if changed
        existing.ttlClass = ttlClass;
      }
    } else {
      // New topic
      threadHistory.topics.set(topicKey, {
        topic,
        ttlClass,
        entities,
        firstSeen: Date.now(),
        lastSeen: Date.now(),
        lastVerified: null,
        batchCount: 1,
      });
    }

    threadHistory.lastBatchTime = Date.now();

    logger.debug({ threadId, topic: topicKey, batchCount: threadHistory.topics.get(topicKey)?.batchCount }, 'Topic recorded');
  }

  /**
   * Check if topic is stable (seen in ≥2 batches)
   */
  isTopicStable(threadId: string, topic: string): boolean {
    const key = `${threadId}`;
    const threadHistory = this.histories.get(key);
    if (!threadHistory) {
      return false;
    }

    const topicKey = topic.toLowerCase().substring(0, 100);
    const history = threadHistory.topics.get(topicKey);
    
    return history !== undefined && history.batchCount >= 2;
  }

  /**
   * Check if topic is stale (lastVerified older than TTL)
   */
  isTopicStale(threadId: string, topic: string): boolean {
    const key = `${threadId}`;
    const threadHistory = this.histories.get(key);
    if (!threadHistory) {
      return true; // Never seen = stale
    }

    const topicKey = topic.toLowerCase().substring(0, 100);
    const history = threadHistory.topics.get(topicKey);
    
    if (!history) {
      return true; // Unknown topic = stale
    }

    // If never verified, consider stale if old enough
    if (history.lastVerified === null) {
      const age = Date.now() - history.firstSeen;
      const ttl = TTL_MAP[history.ttlClass];
      return age >= ttl;
    }

    // Check if lastVerified is older than TTL
    const timeSinceVerified = Date.now() - history.lastVerified;
    const ttl = TTL_MAP[history.ttlClass];
    
    return timeSinceVerified >= ttl;
  }

  /**
   * Mark topic as verified (research completed)
   */
  markTopicVerified(threadId: string, topic: string): void {
    const key = `${threadId}`;
    const threadHistory = this.histories.get(key);
    if (!threadHistory) {
      return;
    }

    const topicKey = topic.toLowerCase().substring(0, 100);
    const history = threadHistory.topics.get(topicKey);
    
    if (history) {
      history.lastVerified = Date.now();
      logger.debug({ threadId, topic: topicKey }, 'Topic marked as verified');
    }
  }

  /**
   * Get topic history for a thread
   */
  getTopicHistory(threadId: string, topic: string): TopicHistory | null {
    const key = `${threadId}`;
    const threadHistory = this.histories.get(key);
    if (!threadHistory) {
      return null;
    }

    const topicKey = topic.toLowerCase().substring(0, 100);
    return threadHistory.topics.get(topicKey) || null;
  }

  /**
   * Cleanup old thread histories (no activity for 24h)
   */
  cleanup(maxAge: number = 24 * 60 * 60 * 1000): number {
    const now = Date.now();
    let removed = 0;

    for (const [key, threadHistory] of this.histories.entries()) {
      if (now - threadHistory.lastBatchTime > maxAge) {
        this.histories.delete(key);
        removed++;
      }
    }

    if (removed > 0) {
      logger.info({ removed, remaining: this.histories.size }, 'Topic tracker cleanup complete');
    }

    return removed;
  }

  /**
   * Get metrics
   */
  getMetrics() {
    let totalTopics = 0;
    for (const history of this.histories.values()) {
      totalTopics += history.topics.size;
    }

    return {
      activeThreads: this.histories.size,
      totalTopics,
    };
  }
}

