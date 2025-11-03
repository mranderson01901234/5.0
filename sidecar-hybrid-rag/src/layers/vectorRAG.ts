/**
 * Vector RAG Layer - Semantic Similarity Search
 */

import { VectorStore } from '../storage/vectorStore.js';
import { EmbeddingEngine } from '../storage/embeddingEngine.js';
import { VectorResult } from '../types/responses.js';
import { HybridRAGRequest } from '../types/requests.js';
import { logger } from '../utils/logger.js';

export class VectorRAGLayer {
  private vectorStore: VectorStore;
  private embeddingEngine: EmbeddingEngine;

  constructor(vectorStore: VectorStore, embeddingEngine: EmbeddingEngine) {
    this.vectorStore = vectorStore;
    this.embeddingEngine = embeddingEngine;
  }

  /**
   * Semantic retrieval using vector similarity
   */
  async retrieve(request: HybridRAGRequest): Promise<VectorResult[]> {
    try {
      logger.debug({ userId: request.userId, query: request.query }, 'Vector RAG retrieval');

      // Generate query embedding
      const queryEmbedding = await this.embeddingEngine.embed(request.query);

      // Build filters (world_knowledge doesn't store userId, so filtering is disabled)
      const filters: Record<string, any> = {};
      // TODO: When vector embeddings include userId, re-enable filtering:
      // if (request.userId) {
      //   filters.userId = request.userId;
      // }
      if (request.threadId) {
        filters.threadId = request.threadId;
      }

      // Vector similarity search
      const results = await this.vectorStore.search({
        userId: request.userId,
        queryVector: queryEmbedding,
        topK: request.options?.maxResults || 10,
        minSimilarity: request.options?.minConfidence || 0.6, // Lowered threshold since general knowledge
        filters: Object.keys(filters).length > 0 ? filters : undefined,
      });

      // Convert to VectorResult
      const vectorResults: VectorResult[] = results.map(r => ({
        content: r.content,
        source: r.metadata,
        similarity: r.score,
        embeddingId: r.id,
        retrievedAt: Date.now(),
      }));

      logger.debug({ count: vectorResults.length }, 'Vector RAG retrieval complete');

      return vectorResults;
    } catch (error) {
      logger.error({ error }, 'Vector RAG retrieval failed');
      // Return empty results instead of throwing to allow graceful degradation
      return [];
    }
  }

  /**
   * Hybrid search (vector + keyword) - for future enhancement
   */
  async hybridSearch(request: HybridRAGRequest): Promise<VectorResult[]> {
    // TODO: Implement RRF fusion
    return this.retrieve(request);
  }

  /**
   * Multi-query expansion - for future enhancement
   */
  async expandedSearch(
    _originalQuery: string,
    expansions: string[]
  ): Promise<VectorResult[]> {
    // TODO: Implement multi-query expansion
    logger.debug({ expansions }, 'Expanded search not yet implemented');
    return [];
  }
}

