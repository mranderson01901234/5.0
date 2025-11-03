/**
 * Embedding Cache - Redis + Local caching
 */

import Redis from 'ioredis';
import { loadConfig } from '../config.js';
import { logger } from '../utils/logger.js';

const config = loadConfig();

export class EmbeddingCache {
  private redis?: Redis;
  private localCache: Map<string, { embedding: number[]; timestamp: number }>;
  private localCacheMaxSize: number = 1000;

  constructor() {
    this.localCache = new Map();
    
    // Initialize Redis connection (non-blocking)
    this.initializeRedis().catch(error => {
      logger.warn({ error }, 'Redis not available, using local cache only');
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
        connectTimeout: 2000, // 2 second timeout
      });

      await Promise.race([
        this.redis.connect(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Redis connection timeout')), 2000))
      ]);
      logger.info('Redis connection established');
    } catch (error) {
      logger.warn({ error }, 'Redis connection failed');
    }
  }

  /**
   * Get embedding from cache
   */
  async get(text: string): Promise<number[] | null> {
    try {
      // Try local cache first
      const local = this.localCache.get(text);
      if (local) {
        return local.embedding;
      }

      // Try Redis cache
      if (this.redis && this.redis.status === 'ready') {
        const cached = await this.redis.get(`embedding:${text}`);
        if (cached) {
          const embedding = JSON.parse(cached);
          
          // Store in local cache too
          this.localCache.set(text, { embedding, timestamp: Date.now() });
          this.evictLocalCache();
          
          return embedding;
        }
      }

      return null;
    } catch (error) {
      logger.error({ error }, 'Cache get failed');
      return null;
    }
  }

  /**
   * Set embedding in cache
   */
  async set(text: string, embedding: number[]): Promise<void> {
    try {
      // Store in local cache
      this.localCache.set(text, { embedding, timestamp: Date.now() });
      this.evictLocalCache();

      // Store in Redis
      if (this.redis && this.redis.status === 'ready') {
        await this.redis.setex(
          `embedding:${text}`,
          config.cache.embeddingTTL,
          JSON.stringify(embedding)
        );
      }
    } catch (error) {
      logger.error({ error }, 'Cache set failed');
    }
  }

  /**
   * Batch get embeddings
   */
  async batchGet(texts: string[]): Promise<Map<string, number[]>> {
    const results = new Map<string, number[]>();
    
    const uncached: string[] = [];
    
    // Check local cache
    for (const text of texts) {
      const cached = await this.get(text);
      if (cached) {
        results.set(text, cached);
      } else {
        uncached.push(text);
      }
    }

    return results;
  }

  /**
   * Evict local cache if too large
   */
  private evictLocalCache(): void {
    if (this.localCache.size > this.localCacheMaxSize) {
      // Remove oldest entries
      const entries = Array.from(this.localCache.entries());
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
      
      const toRemove = entries.slice(0, this.localCacheMaxSize - 500);
      toRemove.forEach(([key]) => this.localCache.delete(key));
    }
  }

  /**
   * Clear all caches
   */
  async clear(): Promise<void> {
    this.localCache.clear();
    
    if (this.redis && this.redis.status === 'ready') {
      const keys = await this.redis.keys('embedding:*');
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    }
  }

  /**
   * Health check
   */
  async health(): Promise<boolean> {
    if (this.redis && this.redis.status === 'ready') {
      try {
        await this.redis.ping();
        return true;
      } catch {
        return false;
      }
    }
    return true; // Local cache always works
  }
}

