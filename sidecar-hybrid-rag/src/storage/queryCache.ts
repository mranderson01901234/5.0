/**
 * Query Cache - Cache RAG query results
 */

import Redis from 'ioredis';
import { loadConfig } from '../config.js';
import { logger } from '../utils/logger.js';
import type { HybridRAGResponse } from '../types/responses.js';

const config = loadConfig();

export class QueryCache {
  private redis?: Redis;

  constructor() {
    this.initializeRedis().catch(error => {
      logger.warn({ error }, 'Redis not available for query cache');
    });
  }

  /**
   * Initialize Redis connection
   */
  private async initializeRedis(): Promise<void> {
    try {
      this.redis = new Redis(config.redisUrl, {
        maxRetriesPerRequest: 3,
        retryStrategy: (times) => {
          if (times > 3) return null;
          return Math.min(times * 50, 2000);
        },
        lazyConnect: true,
      });

      await this.redis.connect();
      logger.info('Query cache Redis connected');
    } catch (error) {
      logger.warn({ error }, 'Query cache Redis failed');
    }
  }

  /**
   * Generate cache key from query
   */
  private getCacheKey(userId: string, query: string): string {
    // Normalize query
    const normalized = query.toLowerCase().trim().replace(/\s+/g, ' ');
    return `query:${userId}:${normalized}`;
  }

  /**
   * Get cached result
   */
  async get(userId: string, query: string): Promise<HybridRAGResponse | null> {
    if (!this.redis || this.redis.status !== 'ready') return null;

    try {
      const key = this.getCacheKey(userId, query);
      const cached = await this.redis.get(key);
      
      if (cached) {
        logger.debug('Query cache hit');
        return JSON.parse(cached);
      }

      return null;
    } catch (error) {
      logger.error({ error }, 'Query cache get failed');
      return null;
    }
  }

  /**
   * Set cached result
   */
  async set(userId: string, query: string, result: HybridRAGResponse): Promise<void> {
    if (!this.redis || this.redis.status !== 'ready') return;

    try {
      const key = this.getCacheKey(userId, query);
      await this.redis.setex(
        key,
        config.cache.queryTTL,
        JSON.stringify(result)
      );
      logger.debug('Query cached');
    } catch (error) {
      logger.error({ error }, 'Query cache set failed');
    }
  }

  /**
   * Invalidate cache for user
   */
  async invalidateUser(userId: string): Promise<void> {
    if (!this.redis || this.redis.status !== 'ready') return;

    try {
      const keys = await this.redis.keys(`query:${userId}:*`);
      if (keys.length > 0) {
        await this.redis.del(...keys);
        logger.debug({ count: keys.length }, 'User cache invalidated');
      }
    } catch (error) {
      logger.error({ error }, 'Cache invalidation failed');
    }
  }

  /**
   * Clear all caches
   */
  async clear(): Promise<void> {
    if (!this.redis || this.redis.status !== 'ready') return;

    try {
      const keys = await this.redis.keys('query:*');
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    } catch (error) {
      logger.error({ error }, 'Cache clear failed');
    }
  }
}

