/**
 * Embedding Processor
 * Processes ingested content in batches to generate and store embeddings
 */

import type { Database as DatabaseType } from 'better-sqlite3';
import { EmbeddingEngine } from './engine.js';
import { WorldKnowledgeVectorStore, type VectorPoint } from './qdrant.js';
import { pino } from 'pino';
import { randomUUID } from 'crypto';

const logger = pino({ name: 'embedding-processor' });

export interface EmbeddingJob {
  batchSize: number;
  maxAge?: number; // Only process items newer than this (ms)
}

export interface EmbeddingStats {
  processed: number;
  failed: number;
  skipped: number;
  totalTokens: number;
  duration: number;
}

export class EmbeddingProcessor {
  private db: DatabaseType;
  private engine: EmbeddingEngine;
  private vectorStore: WorldKnowledgeVectorStore;
  private enabled: boolean;

  constructor(db: DatabaseType) {
    this.db = db;
    this.enabled = process.env.INGESTION_EMBEDDING_ENABLED === 'true';

    if (this.enabled) {
      this.engine = new EmbeddingEngine();
      this.vectorStore = new WorldKnowledgeVectorStore();
      logger.info('Embedding processor enabled');
    } else {
      logger.warn('Embedding processor disabled (INGESTION_EMBEDDING_ENABLED not set)');
      // Create dummy instances to avoid null checks
      this.engine = null as any;
      this.vectorStore = null as any;
    }
  }

  /**
   * Initialize vector store (create collection if needed)
   */
  async initialize(): Promise<void> {
    if (!this.enabled) {
      return;
    }

    await this.vectorStore.initialize();
    logger.info('Embedding processor initialized');
  }

  /**
   * Process pending embeddings in batch
   */
  async processPendingEmbeddings(options: EmbeddingJob = { batchSize: 100 }): Promise<EmbeddingStats> {
    if (!this.enabled) {
      logger.debug('Embeddings disabled, skipping');
      return {
        processed: 0,
        failed: 0,
        skipped: 0,
        totalTokens: 0,
        duration: 0,
      };
    }

    const startTime = Date.now();
    let processed = 0;
    let failed = 0;
    let skipped = 0;
    let totalTokens = 0;

    try {
      // Get pending items (no vector_id and active)
      const query = `
        SELECT id, title, summary, content, url, source_type, category, published_date, priority, ingested_at, metadata
        FROM ingested_content
        WHERE vector_id IS NULL
          AND status = 'active'
          ${options.maxAge ? `AND ingested_at > ${Date.now() - options.maxAge}` : ''}
        ORDER BY priority DESC, published_date DESC
        LIMIT ?
      `;

      const pending = this.db.prepare(query).all(options.batchSize) as Array<{
        id: string;
        title: string;
        summary: string;
        content: string;
        url: string;
        source_type: string;
        category: string;
        published_date: number;
        priority: number;
        ingested_at: number;
        metadata: string;
      }>;

      if (pending.length === 0) {
        logger.debug('No pending embeddings to process');
        return { processed, failed, skipped, totalTokens, duration: Date.now() - startTime };
      }

      logger.info({ count: pending.length }, 'Processing pending embeddings');

      // Prepare texts for embedding
      const embeddingItems = pending.map(item => ({
        id: item.id,
        text: this.engine.prepareText(item.title, item.summary, item.content),
      }));

      // Generate embeddings in batch
      const embeddings = await this.engine.embedBatch(embeddingItems);

      // Prepare vector points
      const vectorPoints: VectorPoint[] = embeddings.map((emb, index) => {
        const item = pending[index];
        // Use timestamp + index for unique integer ID (Qdrant requirement)
        const vectorId = Date.now() * 1000 + index;

        return {
          id: vectorId.toString(), // Store as string in DB for consistency
          vector: emb.embedding,
          payload: {
            content_id: item.id,
            title: item.title,
            summary: item.summary,
            url: item.url,
            source_type: item.source_type,
            category: item.category,
            published_date: item.published_date,
            priority: item.priority,
            ingested_at: item.ingested_at,
            metadata: item.metadata ? JSON.parse(item.metadata) : {},
          },
        };
      });

      // Upsert to Qdrant
      await this.vectorStore.upsertBatch(vectorPoints);

      // Update database with vector_ids
      const updateStmt = this.db.prepare(`
        UPDATE ingested_content
        SET vector_id = ?,
            embedded_at = ?,
            embedding_model = ?
        WHERE id = ?
      `);

      const updateBatch = this.db.transaction((vectors: typeof vectorPoints) => {
        for (const vector of vectors) {
          updateStmt.run(
            vector.id,
            Date.now(),
            this.engine.getModel(),
            vector.payload.content_id
          );
        }
      });

      updateBatch(vectorPoints);

      processed = vectorPoints.length;
      totalTokens = embeddings.reduce((sum, emb) => sum + emb.tokens, 0);

      logger.info({ processed, totalTokens, duration: Date.now() - startTime }, 'Embeddings processed successfully');
    } catch (error: any) {
      logger.error({ error: error.message, stack: error.stack }, 'Failed to process embeddings');
      failed = options.batchSize;
    }

    return {
      processed,
      failed,
      skipped,
      totalTokens,
      duration: Date.now() - startTime,
    };
  }

  /**
   * Re-embed specific content items (for updates or errors)
   */
  async reEmbedContent(contentIds: string[]): Promise<void> {
    if (!this.enabled) {
      return;
    }

    logger.info({ count: contentIds.length }, 'Re-embedding content');

    // Clear existing vector_id
    const clearStmt = this.db.prepare(`UPDATE ingested_content SET vector_id = NULL WHERE id = ?`);
    for (const id of contentIds) {
      clearStmt.run(id);
    }

    // Process normally
    await this.processPendingEmbeddings({ batchSize: contentIds.length });
  }

  /**
   * Get embedding statistics
   */
  getStats(): { pending: number; embedded: number; total: number } {
    const pending = this.db.prepare(`
      SELECT COUNT(*) as count FROM ingested_content
      WHERE vector_id IS NULL AND status = 'active'
    `).get() as { count: number };

    const embedded = this.db.prepare(`
      SELECT COUNT(*) as count FROM ingested_content
      WHERE vector_id IS NOT NULL AND status = 'active'
    `).get() as { count: number };

    const total = this.db.prepare(`
      SELECT COUNT(*) as count FROM ingested_content
      WHERE status = 'active'
    `).get() as { count: number };

    return {
      pending: pending.count,
      embedded: embedded.count,
      total: total.count,
    };
  }

  /**
   * Check if embeddings are enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }
}
