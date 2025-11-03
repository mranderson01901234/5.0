/**
 * Memory Recall Stability Improvements
 * Addresses intermittent memory recall failures and timing issues
 */

import { logger } from './log.js';

export class MemoryRecallStabilizer {

  /**
   * Enhanced memory recall with retry logic and better error handling
   */
  static async recallMemoriesWithRetry(
    userId: string,
    threadId: string,
    query: string,
    options: {
      maxRetries?: number;
      timeoutMs?: number;
      fallbackToCache?: boolean;
    } = {}
  ): Promise<any[]> {
    
    const {
      maxRetries = 2,
      timeoutMs = 300, // Increased from 200ms
      fallbackToCache = true
    } = options;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const memories = await Promise.race([
          this.performMemoryRecall(userId, threadId, query),
          this.createTimeout(timeoutMs, `Memory recall timeout after ${timeoutMs}ms`)
        ]);

        if (memories && memories.length > 0) {
          return memories;
        }

        // If no memories but no error, try once more with relaxed criteria
        if (attempt === 0) {
          logger.debug({ userId, threadId, attempt: attempt + 1 }, 'No memories found on first attempt, retrying with relaxed criteria...');
          continue;
        }

      } catch (error: any) {
        logger.debug({ userId, threadId, attempt: attempt + 1, error: error.message }, 'Memory recall attempt failed');
        
        if (attempt === maxRetries) {
          if (fallbackToCache) {
            return this.getFallbackMemories(userId, query);
          }
          throw error;
        }
        
        // Wait before retry
        await this.sleep(50 * (attempt + 1)); // Increasing delay
      }
    }

    return [];
  }

  /**
   * Create a timeout promise
   */
  private static createTimeout(ms: number, message: string): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error(message)), ms);
    });
  }

  /**
   * Sleep helper
   */
  private static sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Perform the actual memory recall using memory service
   */
  private static async performMemoryRecall(userId: string, threadId: string, query: string): Promise<any[]> {
    const MEMORY_SERVICE_URL = process.env.MEMORY_SERVICE_URL || 'http://localhost:3001';
    
    // Use the same endpoint format as ContextTrimmer
    const url = `${MEMORY_SERVICE_URL}/v1/recall?userId=${encodeURIComponent(userId)}&maxItems=10&deadlineMs=${300}${query ? `&query=${encodeURIComponent(query)}` : ''}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId,
        'x-internal-service': 'gateway',
      },
    });

    if (!response.ok) {
      throw new Error(`Memory service error: ${response.status}`);
    }

    const data = await response.json() as { memories?: any[]; elapsedMs?: number; searchType?: string; count?: number };
    const memories = data.memories || [];
    
    // Prioritize TIER1 memories (explicit saves) - put them first
    const tier1Memories = memories.filter((m: any) => m.tier === 'TIER1');
    const otherMemories = memories.filter((m: any) => m.tier !== 'TIER1');
    return [...tier1Memories, ...otherMemories].slice(0, 10);
  }

  /**
   * Fallback memories when main recall fails
   */
  private static getFallbackMemories(userId: string, query: string): any[] {
    // Return empty array to fail gracefully
    logger.debug({ userId, query: query.substring(0, 50) }, 'Using fallback memories (empty)');
    return [];
  }

  /**
   * Memory recall diagnostics
   */
  static async diagnoseMemoryRecall(userId: string, threadId: string): Promise<DiagnosticResult> {
    const diagnostics: DiagnosticResult = {
      serviceReachable: false,
      averageLatency: 0,
      successRate: 0,
      commonErrors: [],
      recommendations: []
    };

    const testQueries = ['test memory', 'learning', 'project', 'recent conversation'];
    const results: Array<{ success: boolean; latency: number; error?: string }> = [];

    for (const query of testQueries) {
      const startTime = Date.now();
      try {
        await this.performMemoryRecall(userId, threadId, query);
        results.push({ success: true, latency: Date.now() - startTime });
      } catch (error: any) {
        results.push({ 
          success: false, 
          latency: Date.now() - startTime, 
          error: error.message 
        });
      }
    }

    // Calculate metrics
    const successfulResults = results.filter(r => r.success);
    diagnostics.serviceReachable = successfulResults.length > 0;
    diagnostics.successRate = successfulResults.length / results.length;
    diagnostics.averageLatency = successfulResults.length > 0 
      ? successfulResults.reduce((sum, r) => sum + r.latency, 0) / successfulResults.length
      : 0;

    // Collect common errors
    diagnostics.commonErrors = [...new Set(results
      .filter(r => !r.success && r.error)
      .map(r => r.error!)
    )];

    // Generate recommendations
    if (diagnostics.successRate < 0.8) {
      diagnostics.recommendations.push('Consider increasing memory recall timeout');
    }
    if (diagnostics.averageLatency > 200) {
      diagnostics.recommendations.push('Memory service latency is high - investigate database performance');
    }
    if (diagnostics.commonErrors.includes('timeout')) {
      diagnostics.recommendations.push('Add retry logic for timeout errors');
    }

    return diagnostics;
  }
}

interface DiagnosticResult {
  serviceReachable: boolean;
  averageLatency: number;
  successRate: number;
  commonErrors: string[];
  recommendations: string[];
}

