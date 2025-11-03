/**
 * Memory RAG Layer - Retrieves from conversation history and stored memories
 */

import { MemoryServiceClient } from '../communication/memoryServiceClient.js';
import { MemoryResult } from '../types/responses.js';
import { HybridRAGRequest } from '../types/requests.js';
import { logger } from '../utils/logger.js';

export class MemoryRAGLayer {
  private memoryService: MemoryServiceClient;

  constructor(memoryService: MemoryServiceClient) {
    this.memoryService = memoryService;
  }

  /**
   * Retrieve memories using hybrid approach
   */
  async retrieve(request: HybridRAGRequest): Promise<MemoryResult[]> {
    try {
      logger.debug({ userId: request.userId, threadId: request.threadId }, 'Memory RAG retrieval');

      // Phase 1: Currently using keyword-based recall from memory-service
      // Future: Will add semantic search when vector layer has memory embeddings
      
      const response = await this.memoryService.recall({
        userId: request.userId,
        threadId: request.threadId,
        maxItems: request.options?.maxResults || 10,
        deadlineMs: 200,
      });

      if (response.timedOut) {
        logger.warn('Memory recall timed out');
        return [];
      }

      // Convert to MemoryResult format
      const memoryResults: MemoryResult[] = response.memories.map(m => ({
        id: m.id,
        content: m.content,
        relevanceScore: m.priority,
        createdAt: m.createdAt,
        source: {
          userId: m.userId,
          threadId: m.threadId,
          priority: m.priority,
          tier: m.tier,
        },
      }));

      logger.debug({ count: memoryResults.length }, 'Memory RAG retrieval complete');

      return memoryResults;
    } catch (error) {
      logger.error({ error }, 'Memory RAG retrieval failed');
      return [];
    }
  }

  /**
   * Hybrid retrieval - keyword + semantic
   * For Phase 1: Only keyword until embeddings are generated
   */
  async hybridRetrieve(request: HybridRAGRequest): Promise<MemoryResult[]> {
    // TODO: In Phase 2, merge keyword and semantic results
    return this.retrieve(request);
  }
}

