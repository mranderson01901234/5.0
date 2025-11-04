import { getDatabase } from './database.js';
import { loadConfig } from './config.js';
import { logger } from './log.js';
import type { Message } from './types.js';
import { preprocessContext } from './ContextPreprocessor.js';
import { MemoryRecallStabilizer } from './MemoryRecallStabilizer.js';
import { getUnlimitedRecallLoader } from './unlimited-recall-loader.js';
import { shouldTriggerRecall } from './unlimited-recall-triggers.js';

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

    // UNLIMITED RECALL: Check if user wants to recall past conversations
    if (userId) {
      const lastUserMessage = messages.filter(m => m.role === 'user').pop();
      if (lastUserMessage && shouldTriggerRecall(lastUserMessage.content, messages)) {
        try {
          const recallLoader = getUnlimitedRecallLoader();
          const recalled = await recallLoader.handleRecall(
            userId,
            threadId,
            lastUserMessage.content,
            { maxTokens: maxInputTokens * 0.5 } // Use up to 50% of budget for recalled conversation
          );

          if (recalled) {
            // Format recalled conversation
            let recallContent = `[Previous conversation: "${recalled.conversationLabel}"]\n\n`;

            if (recalled.summary) {
              recallContent += `Summary: ${recalled.summary}\n\n`;
            }

            if (recalled.messages.length > 0) {
              recallContent += recalled.messages
                .map(m => `${m.role}: ${m.content}`)
                .join('\n\n');
            }

            // Inject as system message
            trimmed.push({
              role: 'system',
              content: recallContent
            });

            tokenCount += recalled.tokenCount;

            logger.info({
              userId,
              threadId,
              strategy: recalled.strategy,
              tokens: recalled.tokenCount,
              conversationLabel: recalled.conversationLabel
            }, 'Injected unlimited recall context');
          }
        } catch (error: any) {
          logger.error({
            error: error.message,
            userId,
            threadId
          }, 'Unlimited recall failed, continuing without it');
        }
      }
    }

    // Fetch and add memories from memory service
    // CRITICAL: Always recall user memories directly (explicit "remember" saves need to be recalled)
    // Hybrid RAG may also return memories, but we want direct recall for explicit saves
    if (userId) {
      const MEMORY_SERVICE_URL = process.env.MEMORY_SERVICE_URL || 'http://localhost:3001';
      const HYBRID_RAG_URL = process.env.HYBRID_RAG_URL || 'http://localhost:3002';
      
      const lastUserMessage = messages.filter(m => m.role === 'user').pop();
      // ENHANCED: Extract query from last user message, handling multi-turn context
      // If the last message is short or a follow-up, include recent context for better relevance
      let userQuery = lastUserMessage?.content || '';
      
      // If query is very short (< 20 chars) or appears to be a follow-up, include context
      if (userQuery.length < 20 || /^(yes|no|ok|sure|thanks|that|it|this|those|these|them|him|her)$/i.test(userQuery.trim())) {
        // Include previous user message for context
        const previousUserMessages = messages.filter(m => m.role === 'user').slice(-2);
        if (previousUserMessages.length > 1) {
          // Combine last 2 user messages for better context
          userQuery = previousUserMessages.map(m => m.content).join(' ').substring(0, 200);
        }
      }
      
      // Clean up query: remove common conversational fillers that don't help with relevance
      userQuery = userQuery
        .replace(/\b(please|can you|could you|would you|will you|thank you|thanks)\b/gi, '')
        .replace(/\b(um|uh|er|ah|hmm|well)\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
      
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
        
      } catch (error: any) {
        // Direct memory recall failed silently
      }
      
      // Try Hybrid RAG if enabled (Phase 1+) - this supplements direct memories
      const useHybridRAG = this.config.flags.hybridRAG && lastUserMessage;
      
      if (useHybridRAG) {
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
              return allResults;
            }
            return [];
          }).catch(() => []);

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

          if (!timedOut && hybridResults.length > 0) {
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
            }
          }

          // CRITICAL FIX: Use directMemories as fallback when Hybrid RAG fails, times out, or returns no results
          // This ensures user's explicit "remember" saves are ALWAYS available
          if ((timedOut || hybridResults.length === 0) && directMemories.length > 0) {
            // Format as raw context first
            const rawMemoryText = directMemories.map((m: any) => `[Memory] ${m.content}`).join('\n');

            // Preprocess into natural narrative
            const preprocessedMemoryText = preprocessContext(rawMemoryText, 'memory');
            const memoryTokens = this.estimateTokens(preprocessedMemoryText);

            if (tokenCount + memoryTokens < maxInputTokens * 0.5) {
              // Store preprocessed version directly (no header needed as it's now narrative)
              trimmed.push({ role: 'system', content: preprocessedMemoryText });
              tokenCount += memoryTokens;
            }
          }
        } catch (error: any) {
          // CRITICAL FIX: Use directMemories as fallback when Hybrid RAG throws an error
          if (directMemories.length > 0) {
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
              }
            } catch (fallbackError: any) {
              // Fallback failed silently
            }
          }
        }
      } else {
        // Hybrid RAG disabled - use direct memories we already fetched
        if (directMemories.length > 0) {
          // Format as raw context first
          const rawMemoryText = directMemories.map((m: any) => `[Memory] ${m.content}`).join('\n');
          
          // Preprocess into natural narrative
          const preprocessedMemoryText = preprocessContext(rawMemoryText, 'memory');
          const memoryTokens = this.estimateTokens(preprocessedMemoryText);
          
          if (tokenCount + memoryTokens < maxInputTokens * 0.5) {
            // Store preprocessed version directly (no header needed as it's now narrative)
            trimmed.push({ role: 'system', content: preprocessedMemoryText });
            tokenCount += memoryTokens;
          }
        }
      }

      // ENHANCED: Fetch and add last 4-5 conversation histories with summaries (increased from 2)
      // Prioritize by recency and importance
      try {
        const conversationsPromise = fetch(`${MEMORY_SERVICE_URL}/v1/conversations?userId=${encodeURIComponent(userId)}&excludeThreadId=${encodeURIComponent(threadId)}&limit=5`, {
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
          logger.debug({ userId, threadId, status: res.status }, 'Conversation history fetch returned non-ok status');
          return [];
        }).catch((error: any) => {
          logger.debug({ userId, threadId, error: error.message }, 'Conversation history fetch failed');
          return [];
        });

        // CRITICAL FIX: Increase timeout from 50ms to 300ms for reliable network requests
        // Network requests typically take 50-200ms, memory service queries may take 100-300ms
        const conversations = await Promise.race([
          conversationsPromise,
          new Promise<Array<{ threadId: string; lastActivity: number }>>((resolve) => setTimeout(() => {
            logger.debug({ userId, threadId }, 'Conversation history fetch timed out after 300ms');
            resolve([]);
          }, 300))
        ]);

        if (conversations.length > 0) {
          logger.debug({ userId, threadId, conversationCount: conversations.length }, 'Conversation history fetched successfully');
          
          // ENHANCED: Get summaries with on-demand generation fallback
          const summaries = await Promise.all(
            conversations.map(async (conv) => {
              const threadSummary = db.prepare('SELECT summary FROM thread_summaries WHERE thread_id = ? AND user_id = ? AND (deleted_at IS NULL OR deleted_at = 0)')
                .get(conv.threadId, userId) as { summary: string } | undefined;
              
              // ENHANCED: On-demand summary generation if missing
              if (!threadSummary) {
                logger.debug({ userId, threadId: conv.threadId }, 'Summary missing, attempting on-demand generation');
                try {
                  // Fetch messages for this conversation
                  const convMessages = db.prepare(
                    'SELECT content, role FROM messages WHERE thread_id = ? AND user_id = ? AND (deleted_at IS NULL OR deleted_at = 0) ORDER BY created_at ASC LIMIT 50'
                  ).all(conv.threadId, userId) as Array<{ content: string; role: string }>;
                  
                  if (convMessages.length > 0) {
                    // ENHANCED: On-demand summary generation with enhanced fallback
                    // Try to call memory service API endpoint for summary generation
                    try {
                      const MEMORY_SERVICE_URL = process.env.MEMORY_SERVICE_URL || 'http://localhost:3001';
                      
                      // Try to generate summary via memory service (if endpoint exists)
                      // For now, use enhanced fallback that creates informative summary from messages
                      const firstUserMsg = convMessages.find(m => m.role === 'user');
                      const lastUserMsg = convMessages.filter(m => m.role === 'user').pop();
                      const assistantMsgs = convMessages.filter(m => m.role === 'assistant');
                      const userMsgCount = convMessages.filter(m => m.role === 'user').length;
                      
                      if (firstUserMsg) {
                        // ENHANCED: Create more informative fallback summary
                        const parts: string[] = [];
                        
                        // Start with first user message (topic)
                        parts.push(firstUserMsg.content.substring(0, 150));
                        
                        // Add conversation length context
                        if (userMsgCount > 1) {
                          parts.push(`(${userMsgCount} exchanges)`);
                        }
                        
                        // Add latest development if different from first message
                        if (lastUserMsg && lastUserMsg !== firstUserMsg && lastUserMsg.content.length > 20) {
                          parts.push(`Latest: ${lastUserMsg.content.substring(0, 100)}`);
                        }
                        
                        // Add key information if assistant provided substantial responses
                        if (assistantMsgs.length > 0) {
                          const lastAssistantMsg = assistantMsgs[assistantMsgs.length - 1];
                          if (lastAssistantMsg.content.length > 50) {
                            // Extract key points from last assistant message (first 80 chars)
                            const keyInfo = lastAssistantMsg.content.substring(0, 80).replace(/\n/g, ' ').trim();
                            if (keyInfo.length > 20) {
                              parts.push(`Outcome: ${keyInfo}`);
                            }
                          }
                        }
                        
                        const fallbackSummary = parts.join(' ').substring(0, 500);
                        
                        // Cache the fallback summary for future use
                        const now = Math.floor(Date.now() / 1000);
                        db.prepare(
                          `INSERT INTO thread_summaries (thread_id, user_id, summary, updated_at)
                           VALUES (?, ?, ?, ?)
                           ON CONFLICT(thread_id) DO UPDATE SET summary = ?, updated_at = ?`
                        ).run(conv.threadId, userId, fallbackSummary, now, fallbackSummary, now);
                        
                        logger.info({ 
                          userId, 
                          threadId: conv.threadId, 
                          summaryLength: fallbackSummary.length,
                          messageCount: convMessages.length,
                          type: 'fallback'
                        }, 'On-demand summary generated (enhanced fallback) and cached');
                        
                        return { threadId: conv.threadId, summary: fallbackSummary };
                      }
                    } catch (error: any) {
                      logger.debug({ userId, threadId: conv.threadId, error: error.message }, 'On-demand summary generation failed');
                    }
                  }
                } catch (error: any) {
                  logger.debug({ userId, threadId: conv.threadId, error: error.message }, 'On-demand summary generation failed');
                }
                return null;
              }
              
              return { threadId: conv.threadId, summary: threadSummary.summary };
            })
          );
          
          // Filter out null results
          const validSummaries = summaries.filter(s => s !== null) as Array<{ threadId: string; summary: string }>;
          
          // Log when summaries are missing - this is a common issue
          if (conversations.length > 0 && validSummaries.length === 0) {
            logger.warn({ 
              userId, 
              threadId, 
              conversationIds: conversations.map(c => c.threadId),
              message: 'Conversation history found but summaries missing - summaries may not be generated yet by audit jobs'
            }, 'Conversation history summaries missing');
          }

          if (validSummaries.length > 0) {
            // ENHANCED: Sort by recency (most recent first) and limit to top 4
            const sortedSummaries = validSummaries
              .sort((a, b) => {
                const convA = conversations.find(c => c.threadId === a.threadId);
                const convB = conversations.find(c => c.threadId === b.threadId);
                return (convB?.lastActivity || 0) - (convA?.lastActivity || 0);
              })
              .slice(0, 4); // Take top 4 most recent

            // Format as raw context first
            const rawConversationHistoryText = sortedSummaries
              .map((s, i) => `[Conversation ${i + 1}]: ${s.summary}`)
              .join('\n');

            // Preprocess into natural narrative
            const preprocessedHistoryText = preprocessContext(rawConversationHistoryText, 'conversation');
            const historyTokens = this.estimateTokens(preprocessedHistoryText);
            const maxHistoryTokens = 400; // ENHANCED: Increased from 300 to 400 for more context

            // Relaxed token constraint: changed from 0.6 (60% remaining) to 0.5 (50% remaining)
            if (historyTokens <= maxHistoryTokens && tokenCount + historyTokens < maxInputTokens * 0.5) {
              // Store preprocessed version directly (no header needed as it's now narrative)
              trimmed.push({ role: 'system', content: preprocessedHistoryText });
              tokenCount += historyTokens;
              logger.info({ 
                userId, 
                threadId, 
                summaryCount: sortedSummaries.length, 
                tokensAdded: historyTokens,
                conversationIds: sortedSummaries.map(s => s.threadId)
              }, 'Conversation history added to context');
            } else {
              logger.debug({ 
                userId, 
                threadId, 
                historyTokens, 
                maxHistoryTokens,
                tokenCount, 
                maxInputTokens, 
                availableTokens: maxInputTokens * 0.5 - tokenCount,
                reason: historyTokens > maxHistoryTokens ? 'exceeds maxHistoryTokens' : 'would exceed token budget'
              }, 'Conversation history skipped - token limit constraint');
            }
          }
        } else {
          logger.debug({ userId, threadId }, 'No previous conversations found for history');
        }
      } catch (error: any) {
        // CRITICAL FIX: Log errors instead of silently failing - conversation history is important for context
        logger.warn({ userId, threadId, error: error.message, stack: error.stack }, 'Conversation history fetch failed with exception');
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

