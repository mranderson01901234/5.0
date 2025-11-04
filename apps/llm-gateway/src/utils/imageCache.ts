import { createHash } from 'crypto';
import { getDatabase } from '../database.js';
import { logger } from '../log.js';
import { ImageGenOptions } from './imagen.js';

export interface CacheEntry {
  images: Array<{ mime: string; dataUrl: string }>;
  prompt: string;
  options: string;
  createdAt: number;
  hitCount: number;
}

export interface CacheStats {
  memoryHits: number;
  memoryMisses: number;
  dbHits: number;
  dbMisses: number;
  totalSaved: number; // Estimated cost saved in USD
  globalCacheHits: number; // Cross-user cache hits
  perUserCacheHits: number; // Same-user cache hits
}

// In-memory cache (L1)
const memoryCache = new Map<string, CacheEntry>();
const MEMORY_CACHE_MAX_SIZE = 100;
const MEMORY_CACHE_TTL = 60 * 60 * 1000; // 1 hour

// Database cache (L2)
const DB_CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

// Statistics
const cacheStats: CacheStats = {
  memoryHits: 0,
  memoryMisses: 0,
  dbHits: 0,
  dbMisses: 0,
  totalSaved: 0,
  globalCacheHits: 0,
  perUserCacheHits: 0,
};

// Patterns that indicate a personalized/private prompt
const PERSONAL_INDICATORS = [
  /\bmy\b/i,                              // "my dog", "my house"
  /\bour\b/i,                             // "our family", "our wedding"
  /\bI\b/,                                // "I want", "I need"
  /\bme\b/i,                              // "show me", "for me"
  /\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/,       // "John Smith", "Mary Johnson"
  /\b(?:portrait of|picture of|photo of)\s+[A-Z]/i,  // "portrait of Alice"
  /\bself\b/i,                            // "myself", "selfie"
  /\bpersonal\b/i,                        // "personal photo"
  /\bfamily\b/i,                          // "family portrait"
  /\bwedding\b/i,                         // "wedding photo"
  /\bbaby\b/i,                            // "my baby"
  /\bchild\b/i,                           // "my child"
];

/**
 * Determines if a prompt is personal/private (should use per-user cache)
 * vs generic (can use global cache)
 */
function isPersonalPrompt(prompt: string): boolean {
  return PERSONAL_INDICATORS.some(pattern => pattern.test(prompt));
}

/**
 * Generates cache key with hybrid strategy:
 * - Personal prompts: Include userId (per-user cache)
 * - Generic prompts: No userId (global cache)
 */
function generateCacheKey(prompt: string, opts?: ImageGenOptions, userId?: string): string {
  const normalizedPrompt = normalizePrompt(prompt);
  const hash = createHash('sha256');

  // Add userId only for personal prompts
  const isPersonal = userId && isPersonalPrompt(prompt);
  if (isPersonal) {
    hash.update(userId);
    logger.debug({ prompt: prompt.substring(0, 30), userId: userId.substring(0, 8) }, 'Using per-user cache');
  } else {
    logger.debug({ prompt: prompt.substring(0, 30) }, 'Using global cache');
  }

  hash.update(normalizedPrompt);
  hash.update(JSON.stringify(sortObjectKeys(opts || {})));
  return hash.digest('hex');
}

function normalizePrompt(prompt: string): string {
  return prompt
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s]/g, ''); // Remove special characters for better cache hits
}

function sortObjectKeys(obj: any): any {
  if (typeof obj !== 'object' || obj === null) return obj;
  if (Array.isArray(obj)) return obj.map(sortObjectKeys);

  const sorted: any = {};
  Object.keys(obj).sort().forEach(key => {
    sorted[key] = sortObjectKeys(obj[key]);
  });
  return sorted;
}

export async function getCachedImage(
  prompt: string,
  opts?: ImageGenOptions,
  userId?: string
): Promise<Array<{ mime: string; dataUrl: string }> | null> {
  const key = generateCacheKey(prompt, opts, userId);
  const isPersonal = userId && isPersonalPrompt(prompt);

  // Check L1 cache (memory)
  const memoryEntry = memoryCache.get(key);
  if (memoryEntry) {
    const age = Date.now() - memoryEntry.createdAt;
    if (age < MEMORY_CACHE_TTL) {
      memoryEntry.hitCount++;
      cacheStats.memoryHits++;
      cacheStats.totalSaved += estimateImageCost(opts);

      // Track global vs per-user hits
      if (isPersonal) {
        cacheStats.perUserCacheHits++;
      } else {
        cacheStats.globalCacheHits++;
      }

      logger.debug({
        key: key.substring(0, 8),
        hitCount: memoryEntry.hitCount,
        cacheType: isPersonal ? 'per-user' : 'global'
      }, 'L1 cache hit');
      return memoryEntry.images;
    }
    memoryCache.delete(key);
  }
  cacheStats.memoryMisses++;

  // Check L2 cache (database)
  try {
    const db = getDatabase();
    const cached = db.prepare(`
      SELECT images, created_at, hit_count, prompt, options
      FROM image_cache
      WHERE cache_key = ? AND created_at > ?
    `).get(key, Date.now() - DB_CACHE_TTL) as {
      images: string;
      created_at: number;
      hit_count: number;
      prompt: string;
      options: string;
    } | undefined;

    if (cached) {
      const images = JSON.parse(cached.images);

      // Update hit count in database
      db.prepare(`
        UPDATE image_cache
        SET hit_count = hit_count + 1, last_accessed = ?
        WHERE cache_key = ?
      `).run(Date.now(), key);

      // Promote to L1 cache
      memoryCache.set(key, {
        images,
        prompt: cached.prompt,
        options: cached.options,
        createdAt: cached.created_at,
        hitCount: cached.hit_count + 1,
      });

      // Manage L1 cache size (LRU eviction)
      if (memoryCache.size > MEMORY_CACHE_MAX_SIZE) {
        const oldestKey = Array.from(memoryCache.entries())
          .sort((a, b) => a[1].createdAt - b[1].createdAt)[0][0];
        memoryCache.delete(oldestKey);
      }

      cacheStats.dbHits++;
      cacheStats.totalSaved += estimateImageCost(opts);

      // Track global vs per-user hits
      if (isPersonal) {
        cacheStats.perUserCacheHits++;
      } else {
        cacheStats.globalCacheHits++;
      }

      logger.debug({
        key: key.substring(0, 8),
        hitCount: cached.hit_count + 1,
        cacheType: isPersonal ? 'per-user' : 'global'
      }, 'L2 cache hit');
      return images;
    }
  } catch (error) {
    logger.warn({ error }, 'Failed to check L2 cache');
  }

  cacheStats.dbMisses++;
  return null;
}

export async function setCachedImage(
  prompt: string,
  opts: ImageGenOptions | undefined,
  images: Array<{ mime: string; dataUrl: string }>,
  userId?: string
): Promise<void> {
  const key = generateCacheKey(prompt, opts, userId);
  const normalizedPrompt = normalizePrompt(prompt);
  const now = Date.now();

  // Update L1 cache
  memoryCache.set(key, {
    images,
    prompt: normalizedPrompt,
    options: JSON.stringify(opts || {}),
    createdAt: now,
    hitCount: 0,
  });

  // Manage L1 cache size
  if (memoryCache.size > MEMORY_CACHE_MAX_SIZE) {
    const oldestKey = Array.from(memoryCache.entries())
      .sort((a, b) => a[1].createdAt - b[1].createdAt)[0][0];
    memoryCache.delete(oldestKey);
  }

  // Update L2 cache
  try {
    const db = getDatabase();
    db.prepare(`
      INSERT OR REPLACE INTO image_cache (
        cache_key, prompt, options, images, created_at, last_accessed, hit_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      key,
      normalizedPrompt,
      JSON.stringify(opts || {}),
      JSON.stringify(images),
      now,
      now,
      0
    );

    logger.debug({ key: key.substring(0, 8) }, 'Image cached');
  } catch (error) {
    logger.warn({ error }, 'Failed to cache image in database');
  }
}

function estimateImageCost(opts?: ImageGenOptions): number {
  // Estimate cost based on model and sample count (Imagen 4 pricing)
  const sampleCount = opts?.sampleCount || 1;

  switch (opts?.model) {
    case 'imagen-4.0-generate-001': return 0.04 * sampleCount; // STANDARD
    case 'imagen-4.0-fast-generate-001': return 0.04 * sampleCount; // FAST
    case 'imagen-4.0-ultra-generate-001': return 0.06 * sampleCount; // ULTRA
    default: return 0.04 * sampleCount; // Default to STANDARD
  }
}

export function getCacheStats(): CacheStats & { hitRate: number; totalRequests: number } {
  const totalRequests = cacheStats.memoryHits + cacheStats.memoryMisses;
  const totalHits = cacheStats.memoryHits + cacheStats.dbHits;
  const hitRate = totalRequests > 0 ? totalHits / totalRequests : 0;

  return {
    ...cacheStats,
    hitRate,
    totalRequests,
  };
}

export function clearCache(): void {
  memoryCache.clear();
  try {
    const db = getDatabase();
    db.prepare('DELETE FROM image_cache').run();
    logger.info('Cache cleared');
  } catch (error) {
    logger.warn({ error }, 'Failed to clear database cache');
  }
}

// Cleanup old cache entries (run periodically)
export function cleanupCache(): void {
  try {
    const db = getDatabase();
    const result = db.prepare(`
      DELETE FROM image_cache
      WHERE created_at < ?
    `).run(Date.now() - DB_CACHE_TTL);

    if (result.changes > 0) {
      logger.info({ deletedRows: result.changes }, 'Cache cleanup completed');
    }
  } catch (error) {
    logger.warn({ error }, 'Cache cleanup failed');
  }
}

// Run cleanup every 6 hours
setInterval(cleanupCache, 6 * 60 * 60 * 1000);
