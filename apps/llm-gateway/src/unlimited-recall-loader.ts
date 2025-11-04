/**
 * Unlimited Recall Context Loader
 * Loads conversation history with different strategies based on size
 */

import { getDatabase } from './database.js';
import { UnlimitedRecallDB, type ConversationMessage, type ConversationPackage } from './unlimited-recall-db.js';
import { generateEmbedding, cosineSimilarity, bufferToEmbedding } from './unlimited-recall-embeddings.js';
import { detectTrigger, extractSearchTerms, type TriggerDetectionResult } from './unlimited-recall-triggers.js';
import { logger } from './log.js';
import { randomUUID } from 'crypto';

export type LoadStrategy = 'full' | 'hierarchical' | 'compressed' | 'snippet';

export interface LoadedContext {
  strategy: LoadStrategy;
  messages: Array<{ role: string; content: string }>;
  summary?: string;
  tokenCount: number;
  conversationLabel: string;
  relevanceScore?: number;
}

export interface RecallOptions {
  maxTokens?: number;
  minRelevance?: number;
}

/**
 * Main context loader - determines best strategy and loads conversation
 */
export class UnlimitedRecallLoader {
  private recallDB: UnlimitedRecallDB;

  constructor() {
    const db = getDatabase();
    this.recallDB = new UnlimitedRecallDB(db);
  }

  /**
   * Handle recall based on trigger detection
   */
  async handleRecall(
    userId: string,
    currentThreadId: string,
    userMessage: string,
    options: RecallOptions = {}
  ): Promise<LoadedContext | null> {
    const startTime = Date.now();
    const maxTokens = options.maxTokens || 120_000;

    try {
      // Detect trigger type
      const trigger = detectTrigger(userMessage);

      if (trigger.type === 'none') {
        return null;
      }

      let loadedContext: LoadedContext | null = null;

      switch (trigger.type) {
        case 'resume':
          loadedContext = await this.handleResumeIntent(userId, currentThreadId, maxTokens);
          break;

        case 'historical':
          loadedContext = await this.handleHistoricalQuery(userId, currentThreadId, userMessage, trigger, maxTokens);
          break;

        case 'semantic':
          loadedContext = await this.handleSemanticQuery(userId, currentThreadId, userMessage, maxTokens);
          break;
      }

      if (loadedContext) {
        // Log recall event
        const latency = Date.now() - startTime;
        this.recallDB.logRecallEvent({
          id: randomUUID(),
          user_id: userId,
          current_thread_id: currentThreadId,
          recalled_thread_id: null, // Will be set by specific handlers
          trigger_type: trigger.type,
          trigger_query: userMessage,
          strategy_used: loadedContext.strategy,
          tokens_injected: loadedContext.tokenCount,
          relevance_score: loadedContext.relevanceScore || null,
          success: true,
          error: null,
          latency_ms: latency
        });

        logger.info({
          userId,
          triggerType: trigger.type,
          strategy: loadedContext.strategy,
          tokens: loadedContext.tokenCount,
          latencyMs: latency
        }, 'Successfully loaded context for recall');
      }

      return loadedContext;

    } catch (error: any) {
      const latency = Date.now() - startTime;

      logger.error({
        error: error.message,
        stack: error.stack,
        userId,
        currentThreadId,
        latencyMs: latency
      }, 'Failed to handle recall');

      // Log failed recall event
      this.recallDB.logRecallEvent({
        id: randomUUID(),
        user_id: userId,
        current_thread_id: currentThreadId,
        recalled_thread_id: null,
        trigger_type: 'semantic',
        trigger_query: userMessage,
        strategy_used: null,
        tokens_injected: 0,
        relevance_score: null,
        success: false,
        error: error.message,
        latency_ms: latency
      });

      return null;
    }
  }

  /**
   * Handle "pick up where we left off" intent
   */
  private async handleResumeIntent(
    userId: string,
    currentThreadId: string,
    maxTokens: number
  ): Promise<LoadedContext | null> {
    // Find most recent conversation (excluding current)
    const recent = this.recallDB.getRecentConversations(userId, currentThreadId, 1);

    if (recent.length === 0) {
      logger.debug({ userId }, 'No previous conversations found for resume intent');
      return null;
    }

    const conversation = recent[0];

    // Load conversation based on size
    return await this.loadConversation(userId, conversation, maxTokens);
  }

  /**
   * Handle historical query (with timeframe)
   */
  private async handleHistoricalQuery(
    userId: string,
    currentThreadId: string,
    query: string,
    trigger: TriggerDetectionResult,
    maxTokens: number
  ): Promise<LoadedContext | null> {
    let candidates: ConversationPackage[] = [];

    // If timeframe specified, search within that window
    if (trigger.timeframe?.startTimestamp && trigger.timeframe?.endTimestamp) {
      candidates = this.recallDB.searchConversationsByTimeframe(
        userId,
        trigger.timeframe.startTimestamp,
        trigger.timeframe.endTimestamp
      );

      logger.debug({
        userId,
        timeframe: trigger.timeframe,
        candidatesFound: candidates.length
      }, 'Searched conversations by timeframe');
    }

    // If no candidates or no timeframe, fall back to semantic search
    if (candidates.length === 0) {
      return await this.handleSemanticQuery(userId, currentThreadId, query, maxTokens);
    }

    // Rank candidates by relevance
    const ranked = await this.rankConversationsByRelevance(query, candidates);

    if (ranked.length === 0 || ranked[0].relevance < 0.5) {
      logger.debug({ userId, query }, 'No relevant conversations found');
      return null;
    }

    // Load top match as snippet (don't load full conversation for historical queries)
    const topMatch = ranked[0];
    return await this.loadSnippet(userId, topMatch.conversation, query, Math.min(maxTokens, 5000));
  }

  /**
   * Handle semantic query (search by meaning)
   */
  private async handleSemanticQuery(
    userId: string,
    currentThreadId: string,
    query: string,
    maxTokens: number
  ): Promise<LoadedContext | null> {
    // Get recent conversations
    const candidates = this.recallDB.getRecentConversations(userId, currentThreadId, 20);

    if (candidates.length === 0) {
      return null;
    }

    // Rank by relevance
    const ranked = await this.rankConversationsByRelevance(query, candidates);

    if (ranked.length === 0 || ranked[0].relevance < 0.6) {
      logger.debug({ userId, query }, 'No semantically relevant conversations found');
      return null;
    }

    // Load top match as snippet
    const topMatch = ranked[0];
    return await this.loadSnippet(userId, topMatch.conversation, query, Math.min(maxTokens, 5000));
  }

  /**
   * Rank conversations by relevance to query
   */
  private async rankConversationsByRelevance(
    query: string,
    conversations: ConversationPackage[]
  ): Promise<Array<{ conversation: ConversationPackage; relevance: number }>> {
    // Generate query embedding
    const queryEmbedding = await generateEmbedding(query);

    if (!queryEmbedding) {
      // Fallback to keyword matching
      return this.rankByKeywords(query, conversations);
    }

    const ranked: Array<{ conversation: ConversationPackage; relevance: number }> = [];

    for (const conv of conversations) {
      // Get conversation embedding
      const embedding = this.recallDB.getEmbedding(conv.thread_id);

      if (!embedding || !embedding.combined_embedding) {
        continue;
      }

      // Calculate similarity
      const convEmbedding = bufferToEmbedding(embedding.combined_embedding);
      const similarity = cosineSimilarity(queryEmbedding, convEmbedding);

      ranked.push({
        conversation: conv,
        relevance: similarity
      });
    }

    // Sort by relevance
    ranked.sort((a, b) => b.relevance - a.relevance);

    return ranked;
  }

  /**
   * Fallback: Rank by keyword matching
   */
  private rankByKeywords(
    query: string,
    conversations: ConversationPackage[]
  ): Array<{ conversation: ConversationPackage; relevance: number }> {
    const queryTerms = extractSearchTerms(query).map(t => t.toLowerCase());

    const ranked = conversations.map(conv => {
      const convText = `${conv.label} ${conv.summary || ''}`.toLowerCase();

      // Count keyword matches
      const matches = queryTerms.filter(term => convText.includes(term)).length;
      const relevance = queryTerms.length > 0 ? matches / queryTerms.length : 0;

      return { conversation: conv, relevance };
    });

    ranked.sort((a, b) => b.relevance - a.relevance);

    return ranked;
  }

  /**
   * Load conversation with appropriate strategy
   */
  private async loadConversation(
    userId: string,
    conversation: ConversationPackage,
    maxTokens: number
  ): Promise<LoadedContext> {
    // Decide strategy based on conversation size
    if (conversation.total_tokens <= maxTokens * 0.8) {
      return await this.loadFull(userId, conversation);
    } else if (conversation.total_tokens <= maxTokens * 2) {
      return await this.loadHierarchical(userId, conversation, maxTokens);
    } else {
      return await this.loadCompressed(userId, conversation);
    }
  }

  /**
   * Strategy 1: Load full conversation
   */
  private async loadFull(
    userId: string,
    conversation: ConversationPackage
  ): Promise<LoadedContext> {
    const messages = this.recallDB.getConversationMessages(conversation.thread_id, userId);

    return {
      strategy: 'full',
      messages: messages.map(m => ({
        role: m.role,
        content: m.content
      })),
      tokenCount: conversation.total_tokens,
      conversationLabel: conversation.label
    };
  }

  /**
   * Strategy 2: Load hierarchical (smart selection)
   */
  private async loadHierarchical(
    userId: string,
    conversation: ConversationPackage,
    maxTokens: number
  ): Promise<LoadedContext> {
    const allMessages = this.recallDB.getConversationMessages(conversation.thread_id, userId);

    // Always include first and last 20 messages
    const first20 = allMessages.slice(0, 20);
    const last20 = allMessages.slice(-20);

    // Calculate remaining budget
    const first20Tokens = first20.reduce((sum, m) => sum + m.tokens_input + m.tokens_output, 0);
    const last20Tokens = last20.reduce((sum, m) => sum + m.tokens_input + m.tokens_output, 0);
    const remainingBudget = maxTokens * 0.7 - first20Tokens - last20Tokens;

    // Select high-priority middle messages
    const middle = allMessages.slice(20, -20);
    const prioritized = middle
      .map(m => ({
        message: m,
        priority: this.calculateMessagePriority(m, middle)
      }))
      .sort((a, b) => b.priority - a.priority);

    const selectedMiddle: ConversationMessage[] = [];
    let middleTokens = 0;

    for (const item of prioritized) {
      const msgTokens = item.message.tokens_input + item.message.tokens_output;
      if (middleTokens + msgTokens > remainingBudget) break;

      selectedMiddle.push(item.message);
      middleTokens += msgTokens;
    }

    // Sort selected middle messages chronologically
    selectedMiddle.sort((a, b) => a.created_at - b.created_at);

    // Combine all messages
    const finalMessages = [
      ...first20,
      ...selectedMiddle,
      ...last20
    ];

    // Generate summary for skipped portions
    const skippedCount = middle.length - selectedMiddle.length;
    const summary = skippedCount > 0
      ? `[Summary of ${skippedCount} messages: Discussion continued with technical details and implementation...]`
      : undefined;

    return {
      strategy: 'hierarchical',
      messages: finalMessages.map(m => ({
        role: m.role,
        content: m.content
      })),
      summary,
      tokenCount: first20Tokens + middleTokens + last20Tokens,
      conversationLabel: conversation.label
    };
  }

  /**
   * Strategy 3: Load compressed (summary only)
   */
  private async loadCompressed(
    userId: string,
    conversation: ConversationPackage
  ): Promise<LoadedContext> {
    const summary = conversation.summary || `Conversation about ${conversation.label}`;

    return {
      strategy: 'compressed',
      messages: [],
      summary,
      tokenCount: conversation.summary_tokens || 100,
      conversationLabel: conversation.label
    };
  }

  /**
   * Strategy 4: Load snippet (targeted extraction)
   */
  private async loadSnippet(
    userId: string,
    conversation: ConversationPackage,
    query: string,
    maxTokens: number
  ): Promise<LoadedContext> {
    const messages = this.recallDB.getConversationMessages(conversation.thread_id, userId);

    // Extract search terms
    const searchTerms = extractSearchTerms(query);

    // Score each message by relevance
    const scored = messages.map((m, idx) => ({
      message: m,
      index: idx,
      relevance: this.scoreMessageRelevance(m, searchTerms)
    })).sort((a, b) => b.relevance - a.relevance);

    if (scored.length === 0 || scored[0].relevance === 0) {
      // No relevant messages, return compressed
      return await this.loadCompressed(userId, conversation);
    }

    // Get top relevant message + context window
    const topMessage = scored[0];
    const contextWindow = 5; // 5 messages before and after

    const startIdx = Math.max(0, topMessage.index - contextWindow);
    const endIdx = Math.min(messages.length - 1, topMessage.index + contextWindow);

    const snippet = messages.slice(startIdx, endIdx + 1);
    const snippetTokens = snippet.reduce((sum, m) => sum + m.tokens_input + m.tokens_output, 0);

    return {
      strategy: 'snippet',
      messages: snippet.map(m => ({
        role: m.role,
        content: m.content
      })),
      tokenCount: Math.min(snippetTokens, maxTokens),
      conversationLabel: conversation.label,
      relevanceScore: topMessage.relevance
    };
  }

  /**
   * Calculate priority for a message (for hierarchical loading)
   */
  private calculateMessagePriority(message: ConversationMessage, allMessages: ConversationMessage[]): number {
    let priority = 0;

    // Code-heavy messages are important
    if (message.is_code_heavy) priority += 10;

    // Decision points are important
    if (message.has_decision) priority += 15;

    // Questions indicate engagement
    if (message.is_question) priority += 5;

    // User messages slightly more important than assistant
    if (message.role === 'user') priority += 3;

    // Longer messages tend to be more substantive
    const contentLength = message.content.length;
    if (contentLength > 200) priority += 5;
    if (contentLength > 500) priority += 5;

    return priority;
  }

  /**
   * Score message relevance to query
   */
  private scoreMessageRelevance(message: ConversationMessage, searchTerms: string[]): number {
    const lower = message.content.toLowerCase();

    // Count term matches
    const matches = searchTerms.filter(term => lower.includes(term.toLowerCase())).length;

    return searchTerms.length > 0 ? matches / searchTerms.length : 0;
  }
}

// Export singleton
let loaderInstance: UnlimitedRecallLoader | null = null;

export function getUnlimitedRecallLoader(): UnlimitedRecallLoader {
  if (!loaderInstance) {
    loaderInstance = new UnlimitedRecallLoader();
  }
  return loaderInstance;
}
