/**
 * Unlimited Recall Embedding Service
 * Generates and caches embeddings for semantic search
 */

import { createHash } from 'crypto';
import { logger } from './log.js';
import { getRedis, isRedisAvailable } from './redis.js';

const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = parseInt(process.env.EMBEDDING_DIMENSIONS || '512', 10);
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_API_URL = process.env.OPENAI_API_URL || 'https://api.openai.com/v1/embeddings';

// In-memory cache for embeddings (fallback if Redis unavailable)
const embeddingCache = new Map<string, number[]>();
const CACHE_TTL = 3600; // 1 hour in seconds

/**
 * Generate hash for text to use as cache key
 */
function hashText(text: string): string {
  return createHash('sha256').update(text).digest('hex').substring(0, 16);
}

/**
 * Generate embedding for text
 */
export async function generateEmbedding(text: string): Promise<number[] | null> {
  if (!OPENAI_API_KEY) {
    logger.warn('OPENAI_API_KEY not configured, skipping embedding generation');
    return null;
  }

  const cacheKey = `embedding:${hashText(text)}`;

  try {
    // Check cache first (Redis or in-memory)
    const cached = await getCachedEmbedding(cacheKey);
    if (cached) {
      logger.debug({ cacheKey }, 'Embedding cache hit');
      return cached;
    }

    // Generate new embedding
    logger.debug({ text: text.substring(0, 100), model: EMBEDDING_MODEL }, 'Generating embedding');

    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: text,
        dimensions: EMBEDDING_DIMENSIONS
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = await response.json() as {
      data: Array<{ embedding: number[] }>;
      usage: { total_tokens: number };
    };

    const embedding = data.data[0]?.embedding;
    if (!embedding) {
      throw new Error('No embedding returned from API');
    }

    // Cache the result
    await cacheEmbedding(cacheKey, embedding);

    logger.debug({
      cacheKey,
      dimensions: embedding.length,
      tokens: data.usage.total_tokens
    }, 'Generated and cached embedding');

    return embedding;

  } catch (error: any) {
    logger.error({
      error: error.message,
      stack: error.stack,
      text: text.substring(0, 100)
    }, 'Failed to generate embedding');
    return null;
  }
}

/**
 * Get cached embedding (Redis or in-memory)
 */
async function getCachedEmbedding(cacheKey: string): Promise<number[] | null> {
  // Try Redis first
  if (isRedisAvailable()) {
    try {
      const redis = getRedis();
      const cached = await redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (error: any) {
      logger.warn({ error: error.message }, 'Redis cache read failed');
    }
  }

  // Fallback to in-memory cache
  return embeddingCache.get(cacheKey) || null;
}

/**
 * Cache embedding (Redis or in-memory)
 */
async function cacheEmbedding(cacheKey: string, embedding: number[]): Promise<void> {
  // Try Redis first
  if (isRedisAvailable()) {
    try {
      const redis = getRedis();
      await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(embedding));
      return;
    } catch (error: any) {
      logger.warn({ error: error.message }, 'Redis cache write failed');
    }
  }

  // Fallback to in-memory cache
  embeddingCache.set(cacheKey, embedding);

  // Limit in-memory cache size
  if (embeddingCache.size > 1000) {
    // Remove oldest entries (first 100)
    const keysToDelete = Array.from(embeddingCache.keys()).slice(0, 100);
    keysToDelete.forEach(key => embeddingCache.delete(key));
  }
}

/**
 * Calculate cosine similarity between two embeddings
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Embeddings must have same dimensions');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const similarity = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  return similarity;
}

/**
 * Convert Buffer to Float32Array
 */
export function bufferToEmbedding(buffer: Buffer): number[] {
  const float32Array = new Float32Array(
    buffer.buffer,
    buffer.byteOffset,
    buffer.byteLength / Float32Array.BYTES_PER_ELEMENT
  );
  return Array.from(float32Array);
}

/**
 * Batch generate embeddings (more efficient for multiple texts)
 */
export async function generateEmbeddingsBatch(texts: string[]): Promise<(number[] | null)[]> {
  if (!OPENAI_API_KEY) {
    logger.warn('OPENAI_API_KEY not configured, skipping batch embedding generation');
    return texts.map(() => null);
  }

  // Check cache for each text
  const results: (number[] | null)[] = new Array(texts.length).fill(null);
  const uncachedIndices: number[] = [];
  const uncachedTexts: string[] = [];

  for (let i = 0; i < texts.length; i++) {
    const cacheKey = `embedding:${hashText(texts[i])}`;
    const cached = await getCachedEmbedding(cacheKey);

    if (cached) {
      results[i] = cached;
    } else {
      uncachedIndices.push(i);
      uncachedTexts.push(texts[i]);
    }
  }

  if (uncachedTexts.length === 0) {
    return results; // All cached!
  }

  try {
    logger.debug({
      total: texts.length,
      cached: texts.length - uncachedTexts.length,
      uncached: uncachedTexts.length
    }, 'Batch generating embeddings');

    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: uncachedTexts,
        dimensions: EMBEDDING_DIMENSIONS
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = await response.json() as {
      data: Array<{ embedding: number[]; index: number }>;
      usage: { total_tokens: number };
    };

    // Cache and assign results
    for (let i = 0; i < data.data.length; i++) {
      const embedding = data.data[i].embedding;
      const originalIndex = uncachedIndices[i];
      results[originalIndex] = embedding;

      // Cache it
      const cacheKey = `embedding:${hashText(texts[originalIndex])}`;
      await cacheEmbedding(cacheKey, embedding);
    }

    logger.info({
      generated: data.data.length,
      tokens: data.usage.total_tokens
    }, 'Batch embeddings generated successfully');

    return results;

  } catch (error: any) {
    logger.error({
      error: error.message,
      stack: error.stack,
      count: uncachedTexts.length
    }, 'Failed to generate batch embeddings');

    // Return partial results (cached ones will still be there)
    return results;
  }
}
