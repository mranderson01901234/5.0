import { getDatabase } from './database.js';
import { loadConfig } from './config.js';
import { logger } from './log.js';
import type { Message } from './types.js';
import { preprocessContext } from './ContextPreprocessor.js';
import { MemoryRecallStabilizer } from './MemoryRecallStabilizer.js';

export class ContextTrimmer {
  private config = loadConfig();

  async trim(
    threadId: string,
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
    userId?: string
  ): Promise<{
    trimmed: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
    trimmedTokens: number;
  }> {
    const db = getDatabase();
    // CRITICAL: Filter by userId to prevent cross-user data leakage
    const allMessages = userId
      ? db
          .prepare('SELECT * FROM messages WHERE thread_id = ? AND user_id = ? AND (deleted_at IS NULL OR deleted_at = 0) ORDER BY created_at DESC')
          .all(threadId, userId) as Message[]
      : db
          .prepare('SELECT * FROM messages WHERE thread_id = ? AND (deleted_at IS NULL OR deleted_at = 0) ORDER BY created_at DESC')
          .all(threadId) as Message[];

    // CRITICAL: Filter by userId to prevent cross-user data leakage
    const summary = userId
      ? db
          .prepare('SELECT summary FROM thread_summaries WHERE thread_id = ? AND user_id = ? AND (deleted_at IS NULL OR deleted_at = 0)')
          .get(threadId, userId) as { summary: string } | undefined
      : db
          .prepare('SELECT summary FROM thread_summaries WHERE thread_id = ? AND (deleted_at IS NULL OR deleted_at = 0)')
          .get(threadId) as { summary: string } | undefined;

    const keepLast = this.config.router.keepLastTurns;
    const maxInputTokens = this.config.router.maxInputTokens;

    // Start with last K turns
    const recentMessages = allMessages.slice(0, keepLast * 2).reverse();
    let trimmed: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [];
    let tokenCount = 0;

    // Fetch and add memories from memory service
    // CRITICAL: Always recall user memories directly (explicit "remember" saves need to be recalled)
    // Hybrid RAG may also return memories, but we want direct recall for explicit saves
    if (userId) {
      const MEMORY_SERVICE_URL = process.env.MEMORY_SERVICE_URL || 'http://localhost:3001';
      const HYBRID_RAG_URL = process.env.HYBRID_RAG_URL || 'http://localhost:3002';
      
      const lastUserMessage = messages.filter(m => m.role === 'user').pop();
      const userQuery = lastUserMessage?.content || '';
      
      // Always recall memories directly (for explicit "remember" saves)
      // This ensures user's explicit memories are always available
      // ENHANCED: Use MemoryRecallStabilizer with retry logic and better error handling
      let directMemories: any[] = [];
      try {
        // Use MemoryRecallStabilizer for enhanced reliability with retries and timeout handling
        directMemories = await MemoryRecallStabilizer.recallMemoriesWithRetry(
          userId,
          threadId,
          userQuery,
          {
            maxRetries: 2,
            timeoutMs: 300, // Increased from 200ms for better reliability
            fallbackToCache: true
          }
        );
        
        // Log successful recall
        if (directMemories.length > 0) {
          logger.info({ 
            userId,
            threadId,
            memoryCount: directMemories.length,
            tier1Count: directMemories.filter((m: any) => m.tier === 'TIER1').length,
            hasQuery: !!userQuery,
          }, 'Memory recall completed (with stabilizer)');
        }

        if (directMemories.length > 0) {
          logger.debug({ 
            userId, 
            threadId, 
            memoryCount: directMemories.length,
            tier1Count: directMemories.filter((m: any) => m.tier === 'TIER1').length,
            memories: directMemories.map((m: any) => `${m.tier}: ${m.content.substring(0, 50)}...`)
          }, 'Direct memories retrieved for context');
        }
      } catch (error: any) {
        logger.debug({ userId, threadId, error: error.message }, 'Direct memory recall failed (non-critical)');
      }
      
      // Try Hybrid RAG if enabled (Phase 1+) - this supplements direct memories
      const useHybridRAG = this.config.flags.hybridRAG && lastUserMessage;
      
      if (useHybridRAG) {
        logger.debug({ userId, threadId, queryLength: lastUserMessage?.content?.length }, 'Attempting Hybrid RAG');
        try {
          const hybridRAGPromise = fetch(`${HYBRID_RAG_URL}/v1/rag/hybrid`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId,
              threadId,
              query: lastUserMessage.content,
              context: { recentMessages: messages.slice(-5) },
              options: { maxResults: 5 },
            }),
          }).then(async (res) => {
            if (res.ok) {
              const data = await res.json() as { memories?: any[]; vectorResults?: any[]; webResults?: any[] };
              // Merge direct memories (explicit saves) with Hybrid RAG results
              // Direct memories take priority - they're user's explicit "remember" saves
              const directMemoryResults = directMemories.map((m: any) => ({ content: m.content, type: 'memory', tier: m.tier }));
              const hybridMemoryResults = (data.memories || []).map((m: any) => ({ content: m.content, type: 'memory', tier: m.tier || 'TIER3' }));
              
              // Deduplicate: prefer direct memories over Hybrid RAG memories (direct are more explicit)
              const memoryMap = new Map<string, any>();
              [...directMemoryResults, ...hybridMemoryResults].forEach(m => {
                const key = m.content.substring(0, 100).toLowerCase();
                if (!memoryMap.has(key) || m.tier === 'TIER1') {
                  memoryMap.set(key, m);
                }
              });
              
              // Merge deduplicated memories with vector and web results
              const allResults = [
                ...Array.from(memoryMap.values()),
                ...(data.vectorResults || []).map((v: any) => ({ content: v.content, type: 'vector' })),
                ...(data.webResults || []).map((w: any) => ({ content: w.content, type: 'web', source: w.source?.host || 'web' })),
              ];
              logger.debug({ 
                userId, 
                threadId, 
                resultCount: allResults.length,
                memories: data.memories?.length || 0,
                vectors: data.vectorResults?.length || 0,
                webResults: data.webResults?.length || 0
              }, 'Hybrid RAG completed');
              return allResults;
            }
            logger.warn({ userId, threadId, status: res.status }, 'Hybrid RAG returned non-ok status');
            return [];
          }).catch((error: any) => {
            logger.debug({ userId, threadId, error: error.message }, 'Hybrid RAG failed');
            return [];
          });

          // Race with timeout (6 seconds to allow for RAG processing)
          let timedOut = false;
          const timeoutPromise = new Promise<any[]>((resolve) => {
            setTimeout(() => {
              timedOut = true;
              resolve([]);
            }, 6000);
          });
          
          const hybridResults = await Promise.race([
            hybridRAGPromise,
            timeoutPromise
          ]);

          if (timedOut) {
            logger.warn({ userId, threadId }, 'Hybrid RAG request timed out after 6s - falling back to direct memories');
          } else if (hybridResults.length > 0) {
            // Format as raw context first (for token counting and preprocessing)
            const rawMemoryText = hybridResults.map((r: any) => `[${r.type}] ${r.content}`).join('\n');
            const rawMemoryTokens = this.estimateTokens(rawMemoryText);

            // Preprocess into natural narrative
            const preprocessedMemoryText = preprocessContext(rawMemoryText, 'rag');
            const preprocessedTokens = this.estimateTokens(preprocessedMemoryText);

            // Use preprocessed version for token counting (it's usually shorter)
            const memoryTokens = preprocessedTokens;

            if (tokenCount + memoryTokens < maxInputTokens * 0.5) {
              // Store preprocessed version directly (no header needed as it's now narrative)
              trimmed.push({ role: 'system', content: preprocessedMemoryText });
              tokenCount += memoryTokens;
              logger.info({
                userId,
                threadId,
                resultCount: hybridResults.length,
                tokensAdded: memoryTokens,
                types: [...new Set(hybridResults.map((r: any) => r.type))]
              }, 'Hybrid RAG results added to context (preprocessed)');
            } else {
              logger.debug({ userId, threadId, tokensNeeded: memoryTokens, available: maxInputTokens * 0.5 - tokenCount }, 'Hybrid RAG results skipped - would exceed token limit');
            }
          } else {
            logger.debug({ userId, threadId }, 'Hybrid RAG returned no results - falling back to direct memories');
          }

          // CRITICAL FIX: Use directMemories as fallback when Hybrid RAG fails, times out, or returns no results
          // This ensures user's explicit "remember" saves are ALWAYS available
          if ((timedOut || hybridResults.length === 0) && directMemories.length > 0) {
            logger.info({ userId, threadId, memoryCount: directMemories.length }, 'Using direct memories as fallback');

            // Format as raw context first
            const rawMemoryText = directMemories.map((m: any) => `[Memory] ${m.content}`).join('\n');

            // Preprocess into natural narrative
            const preprocessedMemoryText = preprocessContext(rawMemoryText, 'memory');
            const memoryTokens = this.estimateTokens(preprocessedMemoryText);

            if (tokenCount + memoryTokens < maxInputTokens * 0.5) {
              // Store preprocessed version directly (no header needed as it's now narrative)
              trimmed.push({ role: 'system', content: preprocessedMemoryText });
              tokenCount += memoryTokens;
              logger.info({ userId, threadId, memoryTokensAdded: memoryTokens }, 'Direct memories added to context as fallback');
            } else {
              logger.warn({ userId, threadId, memoryTokens, available: maxInputTokens * 0.5 - tokenCount }, 'Direct memories skipped - would exceed token limit');
            }
          }
        } catch (error: any) {
          logger.warn({ userId, threadId, error: error.message }, 'Hybrid RAG error - falling back to direct memories');

          // CRITICAL FIX: Use directMemories as fallback when Hybrid RAG throws an error
          if (directMemories.length > 0) {
            logger.info({ userId, threadId, memoryCount: directMemories.length }, 'Using direct memories after Hybrid RAG error');

            try {
              // Format as raw context first
              const rawMemoryText = directMemories.map((m: any) => `[Memory] ${m.content}`).join('\n');

              // Preprocess into natural narrative
              const preprocessedMemoryText = preprocessContext(rawMemoryText, 'memory');
              const memoryTokens = this.estimateTokens(preprocessedMemoryText);

              if (tokenCount + memoryTokens < maxInputTokens * 0.5) {
                // Store preprocessed version directly (no header needed as it's now narrative)
                trimmed.push({ role: 'system', content: preprocessedMemoryText });
                tokenCount += memoryTokens;
                logger.info({ userId, threadId, memoryTokensAdded: memoryTokens }, 'Direct memories added to context after error');
              } else {
                logger.warn({ userId, threadId, memoryTokens, available: maxInputTokens * 0.5 - tokenCount }, 'Direct memories skipped - would exceed token limit');
              }
            } catch (fallbackError: any) {
              logger.error({ userId, threadId, error: fallbackError.message }, 'Failed to add direct memories as fallback');
            }
          }
        }
      } else {
        // Hybrid RAG disabled - use direct memories we already fetched
        if (directMemories.length > 0) {
          logger.debug({ userId, threadId, memoryCount: directMemories.length, memories: directMemories.map((m: any) => m.content) }, 'Using direct memories (Hybrid RAG disabled)');
          
          // Format as raw context first
          const rawMemoryText = directMemories.map((m: any) => `[Memory] ${m.content}`).join('\n');
          
          // Preprocess into natural narrative
          const preprocessedMemoryText = preprocessContext(rawMemoryText, 'memory');
          const memoryTokens = this.estimateTokens(preprocessedMemoryText);
          
          logger.debug({ userId, threadId, preprocessedLength: preprocessedMemoryText.length, preview: preprocessedMemoryText.substring(0, 200) }, 'Memories preprocessed');
          
          if (tokenCount + memoryTokens < maxInputTokens * 0.5) {
            // Store preprocessed version directly (no header needed as it's now narrative)
            trimmed.push({ role: 'system', content: preprocessedMemoryText });
            tokenCount += memoryTokens;
            logger.debug({ userId, threadId, memoryTokensAdded: memoryTokens }, 'Direct memories added to context');
          } else {
            logger.warn({ userId, threadId, memoryTokens, available: maxInputTokens * 0.5 - tokenCount }, 'Memories skipped - would exceed token limit');
          }
        } else {
          logger.debug({ userId, threadId }, 'No direct memories retrieved');
        }
      }

      // Fetch and add last 2 conversation histories with summaries
      try {
        const conversationsPromise = fetch(`${MEMORY_SERVICE_URL}/v1/conversations?userId=${encodeURIComponent(userId)}&excludeThreadId=${encodeURIComponent(threadId)}&limit=2`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'x-user-id': userId,
            'x-internal-service': 'gateway',
          },
        }).then(async (res) => {
          if (res.ok) {
            const data = await res.json() as { conversations?: Array<{ threadId: string; lastActivity: number }> };
            return data.conversations || [];
          }
          return [];
        }).catch(() => []);

        const conversations = await Promise.race([
          conversationsPromise,
          new Promise<Array<{ threadId: string; lastActivity: number }>>((resolve) => setTimeout(() => resolve([]), 50))
        ]);

        if (conversations.length > 0) {
          // Get summaries from gateway DB - CRITICAL: Filter by userId
          const summaries = conversations
            .map(conv => {
              const threadSummary = db.prepare('SELECT summary FROM thread_summaries WHERE thread_id = ? AND user_id = ?')
                .get(conv.threadId, userId) as { summary: string } | undefined;
              return threadSummary ? { threadId: conv.threadId, summary: threadSummary.summary } : null;
            })
            .filter(s => s !== null) as Array<{ threadId: string; summary: string }>;

          if (summaries.length > 0) {
            // Format as raw context first
            const rawConversationHistoryText = summaries
              .map((s, i) => `[Conversation ${i + 1}]: ${s.summary}`)
              .join('\n');

            // Preprocess into natural narrative
            const preprocessedHistoryText = preprocessContext(rawConversationHistoryText, 'conversation');
            const historyTokens = this.estimateTokens(preprocessedHistoryText);
            const maxHistoryTokens = 200; // Cap at 200 tokens for conversation history

            if (historyTokens <= maxHistoryTokens && tokenCount + historyTokens < maxInputTokens * 0.6) {
              // Store preprocessed version directly (no header needed as it's now narrative)
              trimmed.push({ role: 'system', content: preprocessedHistoryText });
              tokenCount += historyTokens;
            }
          }
        }
      } catch (error: any) {
        // Silently fail - conversation history is advisory only
      }
    }

    // Add summary if exists (Tier-0 only)
    if (summary) {
      // Preprocess summary into natural narrative
      const rawSummaryText = `Previous conversation summary: ${summary.summary}`;
      const preprocessedSummaryText = preprocessContext(rawSummaryText, 'summary');
      const summaryTokens = this.estimateTokens(preprocessedSummaryText);
      
      trimmed.push({ role: 'system', content: preprocessedSummaryText });
      tokenCount += summaryTokens;
    }

    // Add recent messages
    for (const msg of recentMessages) {
      const msgTokens = this.estimateTokens(msg.content);
      if (tokenCount + msgTokens > maxInputTokens) {
        break;
      }
      trimmed.push({ role: msg.role, content: msg.content });
      tokenCount += msgTokens;
    }

    // If still under limit, add new messages
    for (const msg of messages) {
      const msgTokens = this.estimateTokens(msg.content);
      if (tokenCount + msgTokens > maxInputTokens) {
        break;
      }
      trimmed.push(msg);
      tokenCount += msgTokens;
    }

    const totalOriginalTokens = allMessages.reduce((sum, m) => sum + this.estimateTokens(m.content), 0);
    const trimmedTokens = totalOriginalTokens - tokenCount;

    return { trimmed, trimmedTokens };
  }

  private estimateTokens(text: string): number {
    // Rough estimate: ~4 chars per token
    return Math.ceil(text.length / 4);
  }
}

