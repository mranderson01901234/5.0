/**
 * Redis client with graceful fallback
 */
import Redis from 'ioredis';
import { pino } from 'pino';
import { getResearchConfig } from './config.js';
const logger = pino({ name: 'redis' });
let redisClient = null;
let redisAvailable = false;
/**
 * Initialize Redis connection
 * Returns false if Redis is unavailable or not configured
 */
export async function initializeRedis() {
    const config = getResearchConfig();
    if (!config.enabled) {
        logger.debug('Redis not initialized: research sidecar disabled');
        return false;
    }
    try {
        redisClient = new Redis(config.redisUrl, {
            maxRetriesPerRequest: 3,
            retryStrategy: (times) => {
                if (times > 3) {
                    logger.warn('Redis connection failed after 3 retries. Research will be disabled.');
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
            logger.info('Redis connected');
            redisAvailable = true;
        });
        redisClient.on('close', () => {
            logger.warn('Redis connection closed');
            redisAvailable = false;
        });
        await redisClient.connect();
        redisAvailable = true;
        return true;
    }
    catch (error) {
        logger.warn({ error }, 'Failed to connect to Redis. Research will be disabled.');
        redisAvailable = false;
        redisClient = null;
        return false;
    }
}
/**
 * Get Redis client (may be null if unavailable)
 */
export function getRedis() {
    return redisAvailable && redisClient ? redisClient : null;
}
/**
 * Check if Redis is available
 */
export function isRedisAvailable() {
    return redisAvailable && redisClient !== null;
}
/**
 * Publish to Redis channel (non-blocking, graceful failure)
 */
export async function publish(channel, message) {
    const client = getRedis();
    if (!client) {
        logger.debug({ channel }, 'Redis not available, skipping publish');
        return false;
    }
    try {
        await client.publish(channel, message);
        return true;
    }
    catch (error) {
        logger.warn({ error, channel }, 'Failed to publish to Redis');
        return false;
    }
}
/**
 * Get value from Redis (non-blocking, graceful failure)
 */
export async function get(key) {
    const client = getRedis();
    if (!client) {
        return null;
    }
    try {
        return await client.get(key);
    }
    catch (error) {
        logger.warn({ error, key }, 'Failed to get from Redis');
        return null;
    }
}
/**
 * Set value in Redis (non-blocking, graceful failure)
 */
export async function set(key, value, ttlSeconds) {
    const client = getRedis();
    if (!client) {
        return false;
    }
    try {
        if (ttlSeconds !== undefined) {
            await client.setex(key, ttlSeconds, value);
        }
        else {
            await client.set(key, value);
        }
        return true;
    }
    catch (error) {
        logger.warn({ error, key }, 'Failed to set in Redis');
        return false;
    }
}
/**
 * Check if key exists in Redis
 */
export async function exists(key) {
    const client = getRedis();
    if (!client) {
        return false;
    }
    try {
        const result = await client.exists(key);
        return result === 1;
    }
    catch (error) {
        logger.warn({ error, key }, 'Failed to check existence in Redis');
        return false;
    }
}
/**
 * Delete key from Redis (non-blocking, graceful failure)
 */
export async function del(key) {
    const client = getRedis();
    if (!client) {
        return false;
    }
    try {
        await client.del(key);
        return true;
    }
    catch (error) {
        logger.warn({ error, key }, 'Failed to delete from Redis');
        return false;
    }
}
/**
 * Close Redis connection gracefully
 */
export async function closeRedis() {
    if (redisClient) {
        try {
            await redisClient.quit();
            logger.info('Redis connection closed');
        }
        catch (error) {
            logger.warn({ error }, 'Error closing Redis connection');
        }
        redisClient = null;
        redisAvailable = false;
    }
}
//# sourceMappingURL=redis.js.map