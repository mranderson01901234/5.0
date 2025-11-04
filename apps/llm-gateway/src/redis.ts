/**
 * Redis client for BullMQ job queue
 */

import Redis from 'ioredis';
import { logger } from './log.js';

let redisClient: Redis | null = null;
let redisAvailable = false;

/**
 * Initialize Redis connection for BullMQ
 * Returns false if Redis is unavailable or not configured
 */
export async function initializeRedis(): Promise<boolean> {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

  try {
    redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        if (times > 3) {
          logger.warn('Redis connection failed after 3 retries. Export queue will be disabled.');
          redisAvailable = false;
          return null; // Stop retrying
        }
        return Math.min(times * 50, 2000);
      },
      lazyConnect: true,
    });

    redisClient.on('error', (error) => {
      logger.error({ error }, 'Redis error');
      redisAvailable = false;
    });

    redisClient.on('connect', () => {
      logger.info('Redis connected for export queue');
      redisAvailable = true;
    });

    redisClient.on('close', () => {
      logger.warn('Redis connection closed');
      redisAvailable = false;
    });

    await redisClient.connect();
    redisAvailable = true;
    return true;
  } catch (error) {
    logger.warn({ error }, 'Failed to connect to Redis. Export queue will be disabled.');
    redisAvailable = false;
    redisClient = null;
    return false;
  }
}

/**
 * Get Redis client (may be null if unavailable)
 */
export function getRedis(): Redis | null {
  return redisAvailable && redisClient ? redisClient : null;
}

/**
 * Check if Redis is available
 */
export function isRedisAvailable(): boolean {
  return redisAvailable;
}

/**
 * Close Redis connection
 */
export async function closeRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    redisAvailable = false;
  }
}

