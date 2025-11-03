/**
 * Embedding generation service using OpenAI embeddings API
 * Handles generation, caching, and queue management for memory embeddings
 */

import { pino } from 'pino';
import type { DatabaseConnection } from './db.js';
import { getRedis, set, get } from './redis.js';
import { createHash } from 'crypto';
import { randomBytes } from 'crypto';

const logger = pino({ name: 'embedding-service' });

const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = parseInt(process.env.EMBEDDING_DIMENSIONS || '512', 10);
const EMBEDDING_BATCH_SIZE = parseInt(process.env.EMBEDDING_BATCH_SIZE || '100', 10);
const MAX_RETRIES = 3;

/**
 * Generate a hash key for text content (for caching)
 */
function hashText(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/**
 * Generate embedding for a single text using OpenAI API
 */
export async function generateEmbedding(text: string): Promise<number[] | null> {
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!openaiKey) {
    logger.debug('No OPENAI_API_KEY, embedding generation disabled');
    return null;
  }

  // Check cache first
  const cacheKey = `embedding:${hashText(text)}`;
  const cached = await get(cacheKey);
  if (cached) {
    try {
      const embedding = JSON.parse(cached) as number[];
      logger.debug({ cacheKey: cacheKey.substring(0, 16) }, 'Embedding cache hit');
      return embedding;
    } catch (e) {
      logger.warn({ error: (e as Error).message }, 'Failed to parse cached embedding');
    }
  }

  try {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: text,
        dimensions: EMBEDDING_DIMENSIONS,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.warn({ status: response.status, error: errorText }, 'OpenAI embedding API failed');
      return null;
    }

    const data = await response.json() as { data?: Array<{ embedding?: number[] }> };
    const embedding = data.data?.[0]?.embedding;

    if (!embedding || embedding.length !== EMBEDDING_DIMENSIONS) {
      logger.warn({ dimensions: embedding?.length, expected: EMBEDDING_DIMENSIONS }, 'Invalid embedding dimensions');
      return null;
    }

    // Cache the embedding for 1 hour
    await set(cacheKey, JSON.stringify(embedding), 3600);

    return embedding;

  } catch (error: any) {
    logger.warn({ error: error.message }, 'Embedding generation error');
    return null;
  }
}

/**
 * Generate embeddings for multiple texts in batch (more efficient)
 */
export async function generateEmbeddingsBatch(texts: string[]): Promise<Array<number[] | null>> {
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!openaiKey) {
    logger.debug('No OPENAI_API_KEY, batch embedding generation disabled');
    return texts.map(() => null);
  }

  // Check cache for all texts
  const cacheKeys = texts.map(t => `embedding:${hashText(t)}`);
  const cachedResults = await Promise.all(cacheKeys.map(key => get(key)));
  
  const uncachedIndices: number[] = [];
  const results: Array<number[] | null> = [];

  for (let i = 0; i < cachedResults.length; i++) {
    if (cachedResults[i]) {
      try {
        results[i] = JSON.parse(cachedResults[i]!) as number[];
      } catch {
        uncachedIndices.push(i);
        results[i] = null;
      }
    } else {
      uncachedIndices.push(i);
      results[i] = null;
    }
  }

  if (uncachedIndices.length === 0) {
    logger.debug({ count: texts.length }, 'All embeddings from cache');
    return results;
  }

  // Generate embeddings for uncached texts
  const uncachedTexts = uncachedIndices.map(idx => texts[idx]);

  try {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: uncachedTexts,
        dimensions: EMBEDDING_DIMENSIONS,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.warn({ status: response.status, error: errorText, count: uncachedTexts.length }, 'OpenAI batch embedding API failed');
      return results; // Return cached results only
    }

    const data = await response.json() as { data?: Array<{ embedding?: number[]; index?: number }> };
    const embeddings = data.data || [];

    // Map embeddings back to their indices and cache them
    for (const item of embeddings) {
      const originalIndex = uncachedIndices[item.index || 0];
      const embedding = item.embedding;

      if (embedding && embedding.length === EMBEDDING_DIMENSIONS) {
        results[originalIndex] = embedding;
        
        // Cache the embedding
        const text = texts[originalIndex];
        const cacheKey = `embedding:${hashText(text)}`;
        await set(cacheKey, JSON.stringify(embedding), 3600);
      }
    }

    logger.debug({ total: texts.length, cached: texts.length - uncachedIndices.length, generated: embeddings.length }, 'Batch embedding generation completed');

  } catch (error: any) {
    logger.warn({ error: error.message, count: uncachedTexts.length }, 'Batch embedding generation error');
  }

  return results;
}

/**
 * Get or generate embedding for a memory (check DB first, then generate)
 */
export async function getOrGenerateEmbedding(
  db: DatabaseConnection,
  memoryId: string,
  content: string
): Promise<number[] | null> {
  // Check if embedding exists in database
  const existing = db.prepare(`
    SELECT embedding FROM memories 
    WHERE id = ? AND embedding IS NOT NULL
  `).get(memoryId) as { embedding?: Buffer } | undefined;

  if (existing?.embedding) {
    try {
      const embedding = JSON.parse(existing.embedding.toString()) as number[];
      logger.debug({ memoryId }, 'Embedding found in database');
      return embedding;
    } catch (e) {
      logger.warn({ memoryId, error: (e as Error).message }, 'Failed to parse database embedding');
    }
  }

  // Generate new embedding
  const embedding = await generateEmbedding(content);
  
  if (embedding) {
    // Store in database
    try {
      const embeddingBlob = Buffer.from(JSON.stringify(embedding));
      db.prepare(`
        UPDATE memories 
        SET embedding = ?, embedding_updated_at = ?
        WHERE id = ?
      `).run(embeddingBlob, Date.now(), memoryId);
      logger.debug({ memoryId }, 'Embedding saved to database');
    } catch (e: any) {
      logger.warn({ memoryId, error: e.message }, 'Failed to save embedding to database');
    }
  } else {
    // Add to queue for background processing
    await addToEmbeddingQueue(db, memoryId, content);
  }

  return embedding;
}

/**
 * Add memory to embedding queue for background processing
 */
export async function addToEmbeddingQueue(
  db: DatabaseConnection,
  memoryId: string,
  content: string
): Promise<void> {
  try {
    // Check if already in queue
    const existing = db.prepare(`
      SELECT id FROM embedding_queue 
      WHERE memoryId = ? AND processedAt IS NULL
    `).get(memoryId) as { id?: string } | undefined;

    if (existing) {
      logger.debug({ memoryId }, 'Memory already in embedding queue');
      return;
    }

    const queueId = randomBytes(16).toString('hex');
    db.prepare(`
      INSERT INTO embedding_queue (id, memoryId, content, createdAt)
      VALUES (?, ?, ?, ?)
    `).run(queueId, memoryId, content, Date.now());

    logger.debug({ memoryId, queueId }, 'Added to embedding queue');
  } catch (e: any) {
    logger.warn({ memoryId, error: e.message }, 'Failed to add to embedding queue');
  }
}

/**
 * Process pending items from embedding queue
 */
export async function processEmbeddingQueue(
  db: DatabaseConnection,
  batchSize: number = EMBEDDING_BATCH_SIZE
): Promise<number> {
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!openaiKey) {
    return 0;
  }

  // Get pending items
  const pendingItems = db.prepare(`
    SELECT id, memoryId, content, retryCount
    FROM embedding_queue
    WHERE processedAt IS NULL
    ORDER BY createdAt ASC
    LIMIT ?
  `).all(batchSize) as Array<{
    id: string;
    memoryId: string;
    content: string;
    retryCount: number;
  }>;

  if (pendingItems.length === 0) {
    return 0;
  }

  logger.debug({ count: pendingItems.length }, 'Processing embedding queue');

  // Batch generate embeddings
  const texts = pendingItems.map(item => item.content);
  const embeddings = await generateEmbeddingsBatch(texts);

  // Update database with generated embeddings
  let successCount = 0;
  const now = Date.now();

  for (let i = 0; i < pendingItems.length; i++) {
    const item = pendingItems[i];
    const embedding = embeddings[i];

    if (embedding) {
      try {
        // Save embedding to memory
        const embeddingBlob = Buffer.from(JSON.stringify(embedding));
        db.prepare(`
          UPDATE memories 
          SET embedding = ?, embedding_updated_at = ?
          WHERE id = ?
        `).run(embeddingBlob, now, item.memoryId);

        // Mark queue item as processed
        db.prepare(`
          UPDATE embedding_queue 
          SET processedAt = ?
          WHERE id = ?
        `).run(now, item.id);

        successCount++;
      } catch (e: any) {
        logger.warn({ memoryId: item.memoryId, error: e.message }, 'Failed to save embedding from queue');
        
        // Mark as failed (with retry count)
        if (item.retryCount < MAX_RETRIES) {
          db.prepare(`
            UPDATE embedding_queue 
            SET retryCount = ?, error = ?
            WHERE id = ?
          `).run(item.retryCount + 1, e.message.substring(0, 200), item.id);
        } else {
          // Max retries reached, mark as processed to avoid retrying forever
          db.prepare(`
            UPDATE embedding_queue 
            SET processedAt = ?, error = ?
            WHERE id = ?
          `).run(now, `Max retries (${MAX_RETRIES}) exceeded: ${e.message.substring(0, 150)}`, item.id);
        }
      }
    } else {
      // Generation failed - increment retry count or mark as processed
      if (item.retryCount < MAX_RETRIES) {
        db.prepare(`
          UPDATE embedding_queue 
          SET retryCount = ?, error = ?
          WHERE id = ?
        `).run(item.retryCount + 1, 'Embedding generation returned null', item.id);
      } else {
        db.prepare(`
          UPDATE embedding_queue 
          SET processedAt = ?, error = ?
          WHERE id = ?
        `).run(now, `Max retries (${MAX_RETRIES}) exceeded: Embedding generation failed`, item.id);
      }
    }
  }

  logger.info({ total: pendingItems.length, success: successCount, failed: pendingItems.length - successCount }, 'Embedding queue processing completed');

  return successCount;
}

/**
 * Get memories without embeddings (for migration)
 */
export function getMemoriesWithoutEmbeddings(
  db: DatabaseConnection,
  limit: number = 50,
  offset: number = 0
): Array<{ id: string; content: string }> {
  return db.prepare(`
    SELECT id, content
    FROM memories
    WHERE (embedding IS NULL OR embedding = '') 
      AND deletedAt IS NULL
      AND LENGTH(content) > 10
    ORDER BY updatedAt DESC
    LIMIT ? OFFSET ?
  `).all(limit, offset) as Array<{ id: string; content: string }>;
}

