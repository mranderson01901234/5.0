/**
 * Research capsule cache with Redis backend
 * Cache keys: CAPS:v2:${topicHash}:${ttlClass}:${recency}:${sha64(normQuery)}
 */

import { createHash } from 'crypto';
import type { ResearchCapsule, TTLClass } from './types.js';
import { get, set, exists } from '../redis.js';
import { pino } from 'pino';

const logger = pino({ name: 'research-cache' });

// TTL mapping (in seconds)
const TTL_MAP: Record<TTLClass, { min: number; max: number }> = {
  'news/current': { min: 30 * 60, max: 60 * 60 }, // 30-60 minutes
  'pricing': { min: 24 * 60 * 60, max: 24 * 60 * 60 }, // 24 hours
  'releases': { min: 72 * 60 * 60, max: 72 * 60 * 60 }, // 72 hours
  'docs': { min: 7 * 24 * 60 * 60, max: 7 * 24 * 60 * 60 }, // 7 days
  'general': { min: 30 * 24 * 60 * 60, max: 30 * 24 * 60 * 60 }, // 30 days
};

// Negative cache TTL (when <3 usable hosts)
const NEGATIVE_CACHE_TTL = 5 * 60; // 5 minutes

/**
 * Generate cache key from research job parameters
 */
export function generateCacheKey(
  topic: string,
  ttlClass: TTLClass,
  recency: string,
  normQuery: string
): string {
  const topicHash = createHash('sha256').update(topic).digest('hex').substring(0, 16);
  const queryHash = createHash('sha256').update(normQuery).digest('base64url').substring(0, 16);
  
  return `CAPS:v2:${topicHash}:${ttlClass}:${recency}:${queryHash}`;
}

/**
 * Get cached capsule
 */
export async function getCachedCapsule(
  topic: string,
  ttlClass: TTLClass,
  recency: string,
  normQuery: string
): Promise<ResearchCapsule | null> {
  const key = generateCacheKey(topic, ttlClass, recency, normQuery);
  
  try {
    const cached = await get(key);
    if (cached) {
      const capsule = JSON.parse(cached) as ResearchCapsule;
      // Check if expired
      if (capsule.expiresAt && new Date(capsule.expiresAt) > new Date()) {
        logger.debug({ key }, 'Cache hit');
        return capsule;
      }
      // Expired, delete it
      logger.debug({ key }, 'Cached capsule expired');
    }
  } catch (error) {
    logger.warn({ error, key }, 'Failed to get cached capsule');
  }

  return null;
}

/**
 * Store capsule in cache
 */
export async function cacheCapsule(
  capsule: ResearchCapsule,
  ttlClass: TTLClass,
  recencyHint: string,
  normQuery: string
): Promise<boolean> {
  const ttlRange = TTL_MAP[ttlClass];
  // Use average of min/max for TTL
  const ttlSeconds = Math.floor((ttlRange.min + ttlRange.max) / 2);

  // FIXED: Use actual recencyHint and normQuery to match cache retrieval key
  const key = generateCacheKey(capsule.topic, ttlClass as TTLClass, recencyHint, normQuery);
  
  try {
    await set(key, JSON.stringify(capsule), ttlSeconds);
    logger.debug({ key, ttlSeconds }, 'Capsule cached');
    return true;
  } catch (error) {
    logger.warn({ error, key }, 'Failed to cache capsule');
    return false;
  }
}

/**
 * Store negative cache entry (<3 usable hosts)
 */
export async function cacheNegative(
  topic: string,
  ttlClass: TTLClass,
  recency: string,
  normQuery: string
): Promise<boolean> {
  const key = generateCacheKey(topic, ttlClass, recency, normQuery);
  const negativeKey = `${key}:negative`;
  
  try {
    await set(negativeKey, '1', NEGATIVE_CACHE_TTL);
    logger.debug({ key }, 'Negative cache stored');
    return true;
  } catch (error) {
    logger.warn({ error, key }, 'Failed to store negative cache');
    return false;
  }
}

/**
 * Check if negative cache exists
 */
export async function hasNegativeCache(
  topic: string,
  ttlClass: TTLClass,
  recency: string,
  normQuery: string
): Promise<boolean> {
  const key = generateCacheKey(topic, ttlClass, recency, normQuery);
  const negativeKey = `${key}:negative`;
  
  return await exists(negativeKey);
}

