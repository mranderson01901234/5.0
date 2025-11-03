/**
 * Memory Service Client - Integration with existing memory-service
 */

import { loadConfig } from '../config.js';
import { logger } from '../utils/logger.js';

const config = loadConfig();

export interface Memory {
  id: string;
  userId: string;
  threadId: string;
  content: string;
  priority: number;
  tier: string;
  createdAt: number;
  updatedAt: number;
}

export interface MemoryRecallResponse {
  memories: Memory[];
  count: number;
  elapsedMs: number;
  timedOut: boolean;
}

export class MemoryServiceClient {
  private baseUrl: string;

  constructor() {
    this.baseUrl = config.memoryServiceUrl;
  }

  /**
   * Recall memories from memory-service
   */
  async recall(params: {
    userId?: string;
    threadId?: string;
    maxItems?: number;
    deadlineMs?: number;
  }): Promise<MemoryRecallResponse> {
    try {
      // If no userId, return empty result
      if (!params.userId) {
        logger.debug('No userId provided, returning empty memories');
        return {
          memories: [],
          count: 0,
          elapsedMs: 0,
          timedOut: false,
        };
      }

      logger.debug({ userId: params.userId, threadId: params.threadId }, 'Recalling memories');

      const url = new URL(`${this.baseUrl}/v1/recall`);
      url.searchParams.set('userId', params.userId);
      if (params.threadId) {
        url.searchParams.set('threadId', params.threadId);
      }
      if (params.maxItems) {
        url.searchParams.set('maxItems', params.maxItems.toString());
      }
      if (params.deadlineMs) {
        url.searchParams.set('deadlineMs', params.deadlineMs.toString());
      }

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': params.userId,
          'x-internal-service': 'hybrid-rag',
        },
        signal: AbortSignal.timeout(params.deadlineMs || 1000),
      });

      if (!response.ok) {
        throw new Error(`Memory service returned ${response.status}`);
      }

      const data = await response.json() as MemoryRecallResponse;
      logger.debug({ count: data.count, elapsedMs: data.elapsedMs }, 'Memories recalled');

      return data;
    } catch (error) {
      logger.error({ error }, 'Memory recall failed');
      // Return empty result instead of throwing
      return {
        memories: [],
        count: 0,
        elapsedMs: 0,
        timedOut: true,
      };
    }
  }

  /**
   * Check memory service health
   */
  async health(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(1000),
      });
      return response.ok;
    } catch (error) {
      logger.error({ error }, 'Memory service health check failed');
      return false;
    }
  }
}

