/**
 * Background worker for processing embedding queue
 * Runs periodically to generate embeddings for memories in the queue
 */

import { pino } from 'pino';
import type { DatabaseConnection } from './db.js';
import { processEmbeddingQueue } from './embedding-service.js';

const logger = pino({ name: 'embedding-worker' });

const PROCESSING_INTERVAL_MS = parseInt(process.env.EMBEDDING_WORKER_INTERVAL_MS || '30000', 10); // 30 seconds default
const EMBEDDING_BATCH_SIZE = parseInt(process.env.EMBEDDING_BATCH_SIZE || '100', 10);

let workerInterval: NodeJS.Timeout | null = null;
let isProcessing = false;

/**
 * Start the embedding worker
 */
export function startEmbeddingWorker(db: DatabaseConnection): void {
  if (workerInterval) {
    logger.warn('Embedding worker already running');
    return;
  }

  if (!process.env.OPENAI_API_KEY) {
    logger.info('OpenAI API key not configured, embedding worker disabled');
    return;
  }

  logger.info({ intervalMs: PROCESSING_INTERVAL_MS, batchSize: EMBEDDING_BATCH_SIZE }, 'Starting embedding worker');

  // Process queue immediately on start
  processQueueOnce(db);

  // Then process every interval
  workerInterval = setInterval(() => {
    processQueueOnce(db);
  }, PROCESSING_INTERVAL_MS);
}

/**
 * Stop the embedding worker
 */
export function stopEmbeddingWorker(): void {
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
    logger.info('Embedding worker stopped');
  }
}

/**
 * Process the embedding queue once
 */
async function processQueueOnce(db: DatabaseConnection): Promise<void> {
  if (isProcessing) {
    logger.debug('Embedding queue processing already in progress, skipping');
    return;
  }

  isProcessing = true;

  try {
    const processedCount = await processEmbeddingQueue(db, EMBEDDING_BATCH_SIZE);
    if (processedCount > 0) {
      logger.debug({ processedCount }, 'Embedding queue processed');
    }
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to process embedding queue');
  } finally {
    isProcessing = false;
  }
}

/**
 * Manually trigger queue processing (for testing/admin)
 */
export async function triggerQueueProcessing(db: DatabaseConnection): Promise<number> {
  return await processEmbeddingQueue(db, EMBEDDING_BATCH_SIZE);
}

