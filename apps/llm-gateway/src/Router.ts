import { loadConfig } from './config.js';
import type { IProvider, MessageWithAttachments } from './types.js';
import { logger } from './log.js';
import { getDatabase } from './database.js';

export class Router {
  private config = loadConfig();
  private db = getDatabase();
  
  private modelRouter = {
    'cost-optimized': {
      provider: 'openai' as const,
      model: 'gpt-4o-mini'
    },
    'context-heavy': {
      provider: 'google' as const,
      model: 'gemini-2.0-flash-exp'
    },
    'reasoning-heavy': {
      provider: 'anthropic' as const,
      model: 'claude-3-5-sonnet-20241022'  // Latest Claude Sonnet
    },
    'multimodal': {
      provider: 'google' as const,
      model: 'gemini-2.0-flash-exp'
    },
    'fallback': {
      provider: 'openai' as const,
      model: 'gpt-4o-mini'
    }
  };

  /**
   * Select optimal model based on query characteristics
   * Returns provider and model name that works best for this use case
   */
  selectOptimalModel(
    query: string,
    queryAnalysis?: { complexity: string; intent?: string },
    contextSize?: number
  ): { provider: string; model: string } {
    // Large context? Use Gemini Flash (1M tokens)
    if (contextSize && contextSize > 50000) {
      logger.debug({ contextSize, selected: 'context-heavy' }, 'Large context detected, selecting Gemini 2.0 Flash');
      return this.modelRouter['context-heavy'];
    }
    
    // Complex reasoning? Use Claude Sonnet
    if (queryAnalysis?.complexity === 'complex') {
      logger.debug({ complexity: queryAnalysis.complexity, selected: 'reasoning-heavy' }, 'Complex reasoning detected, selecting Claude 3.5 Sonnet');
      return this.modelRouter['reasoning-heavy'];
    }
    
    // Web search needed? Already handled by web search - use cost-optimized for synthesis
    if (queryAnalysis?.intent === 'needs_web_search') {
      logger.debug({ intent: queryAnalysis.intent, selected: 'cost-optimized' }, 'Web search intent, using cost-optimized for synthesis');
      return this.modelRouter['cost-optimized'];
    }
    
    // Default: cost-optimized
    logger.debug({ selected: 'cost-optimized' }, 'Defaulting to cost-optimized model');
    return this.modelRouter['cost-optimized'];
  }

  shouldUseFR(threadId: string | undefined, userId?: string): Promise<boolean> {
    if (!this.config.flags.fr) {
      return Promise.resolve(false);
    }

    if (!threadId) {
      return Promise.resolve(true); // First turn
    }

    // Check if last user action was >10s ago
    // CRITICAL: Filter by userId to prevent cross-user data leakage
    const lastMessage = userId
      ? this.db
          .prepare(
            'SELECT created_at FROM messages WHERE thread_id = ? AND user_id = ? AND role = ? ORDER BY created_at DESC LIMIT 1'
          )
          .get(threadId, userId, 'user') as { created_at: number } | undefined
      : this.db
          .prepare(
            'SELECT created_at FROM messages WHERE thread_id = ? AND role = ? ORDER BY created_at DESC LIMIT 1'
          )
          .get(threadId, 'user') as { created_at: number } | undefined;

    if (!lastMessage) {
      return Promise.resolve(true); // No previous user message
    }

    const now = Math.floor(Date.now() / 1000);
    const idleSeconds = now - lastMessage.created_at;
    return Promise.resolve(idleSeconds > 10);
  }

  async routeFR(
    provider: IProvider,
    messages: Array<MessageWithAttachments>,
    model: string,
    options?: { max_tokens?: number; temperature?: number }
  ): Promise<{ content: string; latency: number } | null> {
    const startTime = Date.now();
    const maxTokens = Math.min(this.config.router.frMaxTokens, options?.max_tokens || 120);
    const timeoutMs = this.config.router.frTimeoutMs;

    try {
      const timeoutPromise = new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), timeoutMs)
      );

      const streamPromise = (async () => {
        let content = '';
        let tokenCount = 0;
        for await (const chunk of provider.stream(messages, model, { ...options, max_tokens: maxTokens })) {
          content += chunk;
          tokenCount++;
          if (tokenCount >= maxTokens) {
            break;
          }
        }
        return { content, latency: Date.now() - startTime };
      })();

      const result = await Promise.race([streamPromise, timeoutPromise]);
      return result;
    } catch (error) {
      logger.error({ error }, 'FR route error');
      return null;
    }
  }

  routePrimary(
    provider: IProvider,
    messages: Array<MessageWithAttachments>,
    model: string,
    options?: { max_tokens?: number; temperature?: number }
  ): AsyncIterable<string> {
    const result = provider.stream(messages, model, options);
    return result;
  }
}
