/**
 * Redis client with graceful fallback
 */
/**
 * Initialize Redis connection
 * Returns false if Redis is unavailable or not configured
 */
export declare function initializeRedis(): Promise<boolean>;
/**
 * Get Redis client (may be null if unavailable)
 */
export declare function getRedis(): Redis | null;
/**
 * Check if Redis is available
 */
export declare function isRedisAvailable(): boolean;
/**
 * Publish to Redis channel (non-blocking, graceful failure)
 */
export declare function publish(channel: string, message: string): Promise<boolean>;
/**
 * Get value from Redis (non-blocking, graceful failure)
 */
export declare function get(key: string): Promise<string | null>;
/**
 * Set value in Redis (non-blocking, graceful failure)
 */
export declare function set(key: string, value: string, ttlSeconds?: number): Promise<boolean>;
/**
 * Check if key exists in Redis
 */
export declare function exists(key: string): Promise<boolean>;
/**
 * Delete key from Redis (non-blocking, graceful failure)
 */
export declare function del(key: string): Promise<boolean>;
/**
 * Close Redis connection gracefully
 */
export declare function closeRedis(): Promise<void>;
//# sourceMappingURL=redis.d.ts.map