/**
 * Vector Store - Qdrant Integration
 */

import { QdrantClient } from '@qdrant/qdrant-js';
import { loadConfig } from '../config.js';
import { logger } from '../utils/logger.js';

const config = loadConfig();

export interface VectorSearchOptions {
  userId: string;
  queryVector: number[];
  topK: number;
  minSimilarity: number;
  filters?: Record<string, any>;
}

export interface VectorSearchResult {
  id: string;
  content: string;
  metadata: Record<string, any>;
  score: number;
}

export class VectorStore {
  private client: QdrantClient;
  private collection: string;

  constructor() {
    this.client = new QdrantClient({
      url: config.vectorDb.url,
      apiKey: config.vectorDb.apiKey,
    });
    this.collection = config.vectorDb.collection;
  }

  /**
   * Initialize collection if it doesn't exist
   */
  async initialize(): Promise<void> {
    try {
      const collections = await this.client.getCollections();
      const exists = collections.collections.some(
        c => c.name === this.collection
      );

      if (!exists) {
        logger.info({ collection: this.collection }, 'Creating collection');
        await this.client.createCollection(this.collection, {
          vectors: {
            size: 1536, // text-embedding-3-small dimensions
            distance: 'Cosine',
          },
        });
        logger.info('Collection created');
      } else {
        logger.debug({ collection: this.collection }, 'Collection exists');
      }
    } catch (error) {
      logger.error({ error }, 'Failed to initialize collection');
      throw error;
    }
  }

  /**
   * Search using vector similarity
   */
  async search(options: VectorSearchOptions): Promise<VectorSearchResult[]> {
    try {
      logger.debug({ topK: options.topK }, 'Vector search');

      const response = await this.client.search(this.collection, {
        vector: options.queryVector,
        limit: options.topK,
        score_threshold: options.minSimilarity,
        filter: options.filters && Object.keys(options.filters).length > 0
          ? {
              must: Object.entries(options.filters).map(([key, value]) => ({
                key: {
                  key,
                  match: { value },
                },
              })),
            }
          : undefined,
      });

      const results: VectorSearchResult[] = response.map(item => ({
        id: item.id.toString(),
        content: (item.payload?.title as string) || (item.payload?.content as string) || '',
        metadata: item.payload || {},
        score: item.score,
      }));

      logger.debug({ count: results.length }, 'Vector search completed');
      return results;
    } catch (error) {
      logger.error({ error }, 'Vector search failed');
      throw error;
    }
  }

  /**
   * Upsert vectors
   */
  async upsert(vectors: Array<{
    id: string;
    vector: number[];
    payload: Record<string, any>;
  }>): Promise<void> {
    try {
      logger.debug({ count: vectors.length }, 'Upserting vectors');

      const points = vectors.map(v => ({
        id: v.id,
        vector: v.vector,
        payload: v.payload,
      }));

      await this.client.upsert(this.collection, {
        wait: true,
        points,
      });

      logger.debug('Vectors upserted');
    } catch (error) {
      logger.error({ error }, 'Failed to upsert vectors');
      throw error;
    }
  }

  /**
   * Delete vectors by IDs
   */
  async delete(ids: string[]): Promise<void> {
    try {
      logger.debug({ count: ids.length }, 'Deleting vectors');

      await this.client.delete(this.collection, {
        wait: true,
        points: ids,
      });

      logger.debug('Vectors deleted');
    } catch (error) {
      logger.error({ error }, 'Failed to delete vectors');
      throw error;
    }
  }

  /**
   * Check health
   */
  async health(): Promise<boolean> {
    try {
      await this.client.getCollections();
      return true;
    } catch (error) {
      logger.error({ error }, 'Health check failed');
      return false;
    }
  }
}

