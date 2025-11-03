/**
 * Qdrant Vector Store for World Knowledge
 * Stores embeddings of ingested content
 */

import { QdrantClient } from '@qdrant/qdrant-js';
import { pino } from 'pino';
import type { EmbeddingResult } from './engine.js';

const logger = pino({ name: 'qdrant-client' });

export interface VectorPoint {
  id: string; // Will be converted to integer for Qdrant
  vector: number[];
  payload: {
    content_id: string;
    title: string;
    summary: string;
    url: string;
    source_type: string;
    category: string;
    published_date: number;
    priority: number;
    ingested_at: number;
    metadata?: Record<string, any>;
  };
}

export class WorldKnowledgeVectorStore {
  private client: QdrantClient;
  private collection: string;
  private initialized: boolean = false;

  constructor() {
    const url = process.env.QDRANT_URL || 'http://localhost:6333';
    const apiKey = process.env.QDRANT_API_KEY;

    this.client = new QdrantClient({
      url,
      apiKey: apiKey || undefined,
    });

    this.collection = process.env.QDRANT_WORLD_KNOWLEDGE_COLLECTION || 'world_knowledge';

    logger.info({ url, collection: this.collection }, 'Qdrant client initialized');
  }

  /**
   * Initialize collection (create if doesn't exist)
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      const collections = await this.client.getCollections();
      const exists = collections.collections.some(
        c => c.name === this.collection
      );

      if (!exists) {
        logger.info({ collection: this.collection }, 'Creating world knowledge collection');

        await this.client.createCollection(this.collection, {
          vectors: {
            size: 1536, // text-embedding-3-small dimensions
            distance: 'Cosine',
          },
          optimizers_config: {
            default_segment_number: 2,
          },
          replication_factor: 1,
        });

        // Create payload indexes for filtering
        await this.client.createPayloadIndex(this.collection, {
          field_name: 'category',
          field_schema: 'keyword',
        });

        await this.client.createPayloadIndex(this.collection, {
          field_name: 'source_type',
          field_schema: 'keyword',
        });

        await this.client.createPayloadIndex(this.collection, {
          field_name: 'published_date',
          field_schema: 'integer',
        });

        logger.info('World knowledge collection created with indexes');
      } else {
        logger.debug({ collection: this.collection }, 'Collection already exists');
      }

      this.initialized = true;
    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to initialize collection');
      throw error;
    }
  }

  /**
   * Upsert vectors in batch
   */
  async upsertBatch(points: VectorPoint[]): Promise<void> {
    await this.initialize();

    if (points.length === 0) {
      logger.warn('No points to upsert');
      return;
    }

    try {
      logger.debug({ count: points.length }, 'Upserting vectors to Qdrant');

      // Convert string IDs to integers for Qdrant
      const qdrantPoints = points.map(p => ({
        id: parseInt(p.id, 10),
        vector: p.vector,
        payload: p.payload,
      }));

      await this.client.upsert(this.collection, {
        wait: true,
        points: qdrantPoints,
      });

      logger.info({ count: points.length }, 'Vectors upserted successfully');
    } catch (error: any) {
      logger.error({ error: error.message, count: points.length }, 'Failed to upsert vectors');
      throw error;
    }
  }

  /**
   * Delete vectors by IDs
   */
  async delete(ids: string[]): Promise<void> {
    await this.initialize();

    if (ids.length === 0) {
      return;
    }

    try {
      logger.debug({ count: ids.length }, 'Deleting vectors from Qdrant');

      await this.client.delete(this.collection, {
        wait: true,
        points: ids,
      });

      logger.info({ count: ids.length }, 'Vectors deleted successfully');
    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to delete vectors');
      throw error;
    }
  }

  /**
   * Search vectors by similarity
   */
  async search(queryVector: number[], limit: number = 10, filter?: Record<string, any>): Promise<Array<{ id: string; score: number; payload: any }>> {
    await this.initialize();

    try {
      const response = await this.client.search(this.collection, {
        vector: queryVector,
        limit,
        filter: filter ? this.buildFilter(filter) : undefined,
        with_payload: true,
      });

      return response.map(item => ({
        id: item.id.toString(),
        score: item.score,
        payload: item.payload || {},
      }));
    } catch (error: any) {
      logger.error({ error: error.message }, 'Search failed');
      throw error;
    }
  }

  /**
   * Build Qdrant filter from simple object
   */
  private buildFilter(filter: Record<string, any>): any {
    const must: any[] = [];

    for (const [key, value] of Object.entries(filter)) {
      must.push({
        key,
        match: { value },
      });
    }

    return { must };
  }

  /**
   * Get collection info
   */
  async getCollectionInfo(): Promise<any> {
    await this.initialize();

    try {
      return await this.client.getCollection(this.collection);
    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to get collection info');
      throw error;
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.client.getCollections();
      return true;
    } catch (error) {
      logger.error({ error }, 'Health check failed');
      return false;
    }
  }
}
