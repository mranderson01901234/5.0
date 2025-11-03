import type { FastifyInstance } from 'fastify';
import { ChatStreamRequestSchema, TokenEstimateRequestSchema, type MessageEvent } from '@llm-gateway/shared';
import { providerPool } from './ProviderPool.js';
import { Router } from './Router.js';
import { ContextTrimmer } from './ContextTrimmer.js';
import { getDatabase, isFTS5Available, searchMessages } from './database.js';
import { metrics } from './metrics.js';
import { logger } from './log.js';
import { loadConfig } from './config.js';
import { emitMessageEvent } from './memoryEmitter.js';
import { randomUUID } from 'crypto';
import type { Message } from './types.js';
import { PipelineOrchestrator } from './PipelineOrchestrator.js';
import { IntelligentCache } from './IntelligentCache.js';
import { PerformanceAnalyzer } from './PerformanceAnalyzer.js';
import { WebSearchQueryOptimizer } from './WebSearchQueryOptimizer.js';
import { SimpleQueryHandler } from './SimpleQueryHandler.js';
import { EnhancedFollowUpDetector } from './EnhancedFollowUpDetector.js';
import { MathQueryPostProcessor } from './MathQueryPostProcessor.js';
import { analyzeQuery } from './QueryAnalyzer.js';

const userConcurrency = new Map<string, number>();
const MOCK_MODE = process.env.GATEWAY_MOCK === '1';

// Rate limiting: token bucket per user
const buckets = new Map<string, { tokens: number; ts: number }>();
function allow(userId: string) {
  const now = Date.now();
  const b = buckets.get(userId) ?? { tokens: 10, ts: now };
  const elapsed = (now - b.ts) / 1000;
  b.tokens = Math.min(10, b.tokens + elapsed * 1);
  b.ts = now;
  if (b.tokens < 1) {
    buckets.set(userId, b);
    return false;
  }
  b.tokens -= 1;
  buckets.set(userId, b);
  return true;
}

function mockStream(): AsyncIterable<string> {
  const tokens = ['Hello', ' ', 'world', '!', ' ', 'This', ' ', 'is', ' ', 'a', ' ', 'test', '.'];
  return {
    async *[Symbol.asyncIterator]() {
      for (const token of tokens) {
        await new Promise((resolve) => setTimeout(resolve, 20));
        yield token;
      }
    },
  };
}

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  const config = loadConfig();
  const router = new Router();
  const trimmer = new ContextTrimmer();
  const db = getDatabase();
  
  // Initialize pipeline components
  const intelligentCache = new IntelligentCache();
  const performanceAnalyzer = new PerformanceAnalyzer(intelligentCache);

  app.addHook('onResponse', async (request) => {
    if (request.url.startsWith('/v1/chat/stream')) {
      const user = (request as any).user;
      if (user && user.id) {
        const userId = user.id;
        const current = userConcurrency.get(userId) || 0;
        userConcurrency.set(userId, Math.max(0, current - 1));
      }
    }
  });

  app.post('/v1/chat/stream', {
    preHandler: async (request, reply) => {
      try {
        // Require authentication
        await app.requireAuth(request, reply);
        
        // If requireAuth sent a response, stop here
        if (reply.sent) {
          return;
        }
        
        if (!request.user?.id) {
          return reply.code(401).send({ error: 'Authentication required' });
        }
        
        const userId = request.user.id;

        // Check concurrency
        const current = userConcurrency.get(userId) || 0;
        if (current >= 2) {
          return reply.code(429).send({ error: 'Too many concurrent streams' });
        }
        userConcurrency.set(userId, current + 1);
      } catch (error: any) {
        logger.error({ error }, 'Auth preHandler error');
        if (!reply.sent) {
          return reply.code(500).send({ error: 'Internal server error', details: error.message });
        }
      }
    },
  }, async (request, reply) => {
    try {
      if (!request.user?.id) {
        return reply.code(401).send({ error: 'Authentication required' });
      }
      
      const userId = request.user.id;

      // Rate limiting
      if (!allow(userId)) {
        return reply.code(429).send({ error: 'Rate limit' });
      }

      // Propagate userId header for internal use
      reply.header('x-user-id', userId);

      const parseResult = ChatStreamRequestSchema.safeParse(request.body);
      if (!parseResult.success) {
        logger.error({ body: request.body, error: parseResult.error }, 'Invalid request body');
        return reply.code(400).send({ error: 'Invalid request', details: parseResult.error });
      }

      const body = parseResult.data;
      const threadId = body.thread_id || randomUUID();
      
      // Helper to check if provider has API key configured
      const hasApiKey = (name: string): boolean => {
        if (name === 'openai') return !!process.env.OPENAI_API_KEY;
        if (name === 'anthropic') return !!process.env.ANTHROPIC_API_KEY;
        if (name === 'google') return !!process.env.GOOGLE_API_KEY;
        return false;
      };
      
      // Set initial provider/model (will be overridden by smart routing if no explicit request)
      const requestedProvider = body.provider;
      const providerName = requestedProvider;
      
      const model = body.model;
      const provider = providerName ? providerPool.getProvider(providerName) : null;

      if (providerName && !provider) {
        return reply.code(400).send({ error: 'Invalid provider' });
      }
      
      // Check if at least one provider has API keys available
      if (!hasApiKey('openai') && !hasApiKey('anthropic') && !hasApiKey('google')) {
        logger.error({ hasApiKeys: { openai: hasApiKey('openai'), anthropic: hasApiKey('anthropic'), google: hasApiKey('google') } }, 'No providers available with API keys');
        return reply.code(503).send({ error: 'No LLM providers available. Please configure at least one API key (OPENAI_API_KEY, ANTHROPIC_API_KEY, or GOOGLE_API_KEY).' });
      }

      // CORS headers for SSE
      const origin = request.headers.origin;
      if (origin) {
        reply.raw.setHeader('Access-Control-Allow-Origin', origin);
        reply.raw.setHeader('Access-Control-Allow-Credentials', 'true');
      } else {
        reply.raw.setHeader('Access-Control-Allow-Origin', '*');
      }
      
      // SSE headers
      reply.raw.setHeader('Content-Type', 'text/event-stream');
      reply.raw.setHeader('Cache-Control', 'no-cache');
      reply.raw.setHeader('Connection', 'keep-alive');

      // Send heartbeat immediately
      reply.raw.write('event: heartbeat\ndata: \n\n');
      reply.raw.flushHeaders?.();

      const startTime = Date.now();
      let ttfbMs = 0;
      let tokenCount = 0;
      let firstTokenTime = 0;
      let assistantContent = '';
      let webSearchPromise: Promise<string | null> | null = null;

      try {
        // Check if web search is enabled in config
        if (!config.flags.search) {
          logger.debug({ userId, threadId }, 'Web search disabled in config');
        }
        
        // Use QueryAnalyzer for enterprise-grade intent detection
        const { analyzeQuery } = await import('./QueryAnalyzer.js');
        const { correctQuery } = await import('./QueryCorrector.js');
        
        // Helper function to determine if query needs web search (LEGACY - will be replaced by QueryAnalyzer)
        const needsWebSearch = (query: string): boolean => {
          // If search flag is disabled, skip (but log for debugging)
          if (!config.flags.search) {
            return false;
          }
          
          const lowerQuery = query.toLowerCase().trim();
          
          // Skip simple greetings and conversational phrases
          const skipPatterns = [
            /^(hi|hello|hey|greetings|howdy)(\s|$)/i,
            /^(how are you|how's it going|what's up|how do you do)(\s|\?|$)/i,
            /^(good (morning|afternoon|evening|night)|good day)(\s|$)/i,
            /^(thanks|thank you|thx)(\s|$)/i,
            /^(please|pls)(\s|$)/i,
            /^(yes|no|ok|okay|sure|alright)(\s|$)/i,
            /^(that's|that is)(\s|good|nice|cool|great|fine)(\s|$)/i,
            /^(\?|\.|\!)$/, // Just punctuation
          ];
          
          // Check if it matches skip patterns
          for (const pattern of skipPatterns) {
            if (pattern.test(lowerQuery)) {
              return false;
            }
          }
          
          // Exclude conceptual/theoretical questions that don't need recent web search
          // These are better answered conversationally with general knowledge
          const excludePatterns = [
            /\b(from a|from an?)\s+(scientific|psychological|philosophical|theoretical|conceptual|academic)\s+(point of view|perspective|standpoint)\b/i,
            /\b(scientific|psychological|philosophical|theoretical)\s+(explanation|theory|understanding|perspective|point of view)\b/i,
            /\b(why does|why is|why are|how does|how is|how are)\s+(it|they|he|she|we|you|people|humans|things)\s+(feel|seem|appear|work|function|behave)\b/i,
            /\b(perception|concept|theory|principle|mechanism|phenomenon)\s+(of|about|related to)\b/i,
          ];
          
          for (const pattern of excludePatterns) {
            if (pattern.test(lowerQuery)) {
              return false; // Skip web search for conceptual questions
            }
          }
          
          // Exclude conversation management patterns - these are instructions, not info requests
          const conversationManagementPatterns = [
            /^(no,|yes,|okay,|sure,)/i,
            /^(you|can you|could you|please) (rewrite|change|fix|correct|update)/i,
            /^(store|save|remember) (this|that|it|these)/i,
            /^(did you|have you|do you) remember/i,
            /^that's|that is (not|wrong|incorrect|not what)/i,
            /^(actually|but|however),/i,
            /^let me clarify|let me explain|to clarify/i,
          ];
          
          for (const pattern of conversationManagementPatterns) {
            if (pattern.test(lowerQuery)) {
              return false; // Don't search for conversation management
            }
          }

          // Exclude follow-up questions that reference previous conversation
          // These are about continuing the conversation, not searching for new info
          const followUpPatterns = [
            /^(which one|what one|the (first|second|third|last) one)/i,
            /^(what about|how about|tell me more about|explain more about)/i,
            /^(can you|could you) (explain|tell me|clarify|expand on)/i,
            /^(why|how) (is|does|are|do)\b/i,
            /^(so|then|well|now) (what|how|why)\b/i,
            /\b(that|this|it) (sounds|seems|appears|looks|is)/i,
            /\b(interesting|good|nice|cool|great|makes sense)\s+(but|however|though)/i,
            /^(i (understand|see|get it)|got it)\s*,/i,
            /\b(what|who|which) (can|could|should|would) (i|you) (assume|expect|likely|probably)/i,
            /\b(assume|likely|probably|expect)\s+(that|there (are|is)|.+(will|would|are|is))/i,
          ];

          for (const pattern of followUpPatterns) {
            if (pattern.test(lowerQuery)) {
              return false; // Don't search for follow-up conversation
            }
          }
          
          // Exclude memory save patterns - these should save memories, not trigger web search
          // Use the same pattern as QueryAnalyzer to detect memory save intent
          const memorySavePatterns = [
            /\b(remember|save|store|memorize|keep|note)\s+(this|that|it|my|I|me|for me|in mind|['"]|\w+)/i,
            /(can you|could you|please)\s+(remember|save|store|memorize|keep|note)/i,
            /^\s*(remember|save|store|memorize|keep|note)/i,
            // Patterns like "X - remember that for me" or "X, remember that"
            /(.+?)\s*[-–—,]\s*(remember|save|store)\s+(that|it|this)\s*(for me|please)?/i,
            // Patterns like "remember that my X"
            /remember\s+(that|it)\s+my\b/i,
            // Patterns like "remember my X"
            /remember\s+(my|I|me)\b/i,
          ];
          
          for (const pattern of memorySavePatterns) {
            if (pattern.test(lowerQuery)) {
              return false; // Don't search for memory save requests
            }
          }
          
          // Check for strong indicators that DO need web search (current/up-to-date info)
          const strongIndicators = [
            /\b(latest|recent|current|today|this week|this month|now|news|breaking|just announced|just released)\b/i,
            /\b(when did|when will|when was)\s+(.*?)\s+(happen|happened|announce|announced|release|released|launch|launched)\b/i,
            /\b(price|cost|buy|availability|stock|deal|discount|on sale)\b/i,
            /\b(version|v\d+\.\d+|update|release|announcement|launch)\b/i,
            /\b(cve-\d+|security|vulnerability|patch)\b/i,
            /https?:\/\//i, // URLs
            // Only trigger for years when combined with temporal/current indicators
            /\b(202[4-9]|202[5-9])\b.*?\b(latest|recent|current|new|announcements?|developments?|updates?|election|politics|results?)\b/i,
            /\b(happening|happened|going on|trending|popular)\s+(right now|now|today|this week|this month)\b/i,
          ];
          
          // Check for moderate indicators (still likely to benefit from search)
          const moderateIndicators = [
            /\b(what's|what is|what are|who is|who are|where is|where are)\s+(happening|happened|going on|trending|popular|new|latest|recent|current)\b/i,
            /\b(company|product|service|brand|app|software|tool|platform)\s+(launch|release|update|announcement|new)\b/i,
            /\b(compare|vs|versus|difference between|difference|better|best|top)\s+(latest|recent|current|new)\s+(.*?)\b/i,
          ];
          
          // Strong indicators always trigger search
          for (const indicator of strongIndicators) {
            if (indicator.test(lowerQuery)) {
              return true;
            }
          }
          
          // Moderate indicators + query length > 20 chars = trigger search
          for (const indicator of moderateIndicators) {
            if (indicator.test(lowerQuery) && lowerQuery.length > 20) {
              return true;
            }
          }
          
          // Default: no search unless there are clear indicators
          // Don't trigger search just because a query is long
          return false;
        };

        // RETRIEVE INGESTED CONTEXT: Get relevant ingested content for LLM context (not displayed directly)
        // Only trigger when query indicates need for recent/current information
        const lastUserMessage = body.messages.filter((m: any) => m.role === 'user').pop();
        let ingestedContext: Array<{ title: string; summary: string; url: string; category: string; publishedDate: number; source: string }> = [];
        let ingestedContextText: string = '';
        
        // Smart trigger function for ingestion context - only when recent/current info is needed
        const shouldTriggerIngestion = (query: string): boolean => {
          const lowerQuery = query.toLowerCase().trim();
          
          // Skip very short queries or simple conversational phrases
          if (lowerQuery.length < 15) {
            return false;
          }
          
          // Skip simple greetings and conversational phrases
          const skipPatterns = [
            /^(hi|hello|hey|greetings|howdy)(\s|$)/i,
            /^(how are you|how's it going|what's up|how do you do)(\s|\?|$)/i,
            /^(thanks|thank you|thx)(\s|$)/i,
            /^(yes|no|ok|okay|sure|alright)(\s|$)/i,
            /^(\?|\.|\!)$/, // Just punctuation
          ];
          
          for (const pattern of skipPatterns) {
            if (pattern.test(lowerQuery)) {
              return false;
            }
          }
          
          // EXCLUDE conceptual/abstract questions that don't need recent info
          // These patterns indicate questions about general concepts, not current events
          const excludePatterns = [
            /\b(why does|why is|why are|how does|how is|how are)\s+(it|they|he|she|we|you|people|humans|things)\s+(feel|seem|appear|work|function|behave)\b/i,
            /\b(from a|from an?)\s+(scientific|psychological|philosophical|theoretical|conceptual|academic)\s+(point of view|perspective|standpoint)\b/i,
            /\b(scientific|psychological|philosophical|theoretical)\s+(explanation|theory|understanding|perspective|point of view)\b/i,
            /\b(what can|how can|what should|how should)\s+(people|you|we|someone)\s+(do|can do|should do)\b/i,
            /\b(perception|concept|theory|principle|mechanism|phenomenon)\s+(of|about|related to)\b/i,
            /\b(why|how)\s+(does|do|is|are|can|should|will)\s+(time|memory|learning|thinking|emotion|feeling)\b/i,
          ];
          
          for (const pattern of excludePatterns) {
            if (pattern.test(lowerQuery)) {
              return false; // Explicitly exclude conceptual questions
            }
          }
          
          // Exclude memory save patterns - these should save memories, not trigger ingestion
          const memorySavePatterns = [
            /\b(remember|save|store|memorize|keep|note)\s+(this|that|it|my|I|me|for me|in mind|['"]|\w+)/i,
            /(can you|could you|please)\s+(remember|save|store|memorize|keep|note)/i,
            /^\s*(remember|save|store|memorize|keep|note)/i,
            /(.+?)\s*[-–—,]\s*(remember|save|store)\s+(that|it|this)\s*(for me|please)?/i,
            /remember\s+(that|it)\s+my\b/i,
            /remember\s+(my|I|me)\b/i,
          ];
          
          for (const pattern of memorySavePatterns) {
            if (pattern.test(lowerQuery)) {
              return false; // Don't trigger ingestion for memory save requests
            }
          }
          
          // Strong indicators that DO need recent ingested information
          // Must have explicit recency/time indicators
          const strongIndicators = [
            /\b(latest|recent|current|today|this week|this month|now|news|breaking|just announced|just released|newly released|just launched)\b/i,
            /\b(what's|what is|what are|who is|who are)\s+(happening|happened|going on|trending|popular|new|latest|recent|current)\b/i,
            /\b(when did|when will|when was)\s+(.*?)\s+(happen|happened|announce|announced|release|released|launch|launched)\b/i,
            /\b(tell me about|explain|information about|search|find|look up)\s+(latest|recent|current|new|today|this week|this month)\b/i,
            /\b(202[4-9]|202[5-9])\b/, // Recent years
            /\b(happening|happened|going on|trending|popular)\s+(right now|now|today|this week|this month)\b/i,
            /\b(product|service|company|brand|app|software|tool|platform)\s+(launch|release|update|announcement|new)\s+(this|recent|latest|today)\b/i,
            /\b(compare|vs|versus|difference between|difference|better|best|top)\s+(latest|recent|current|new)\s+(.*?)\b/i,
          ];
          
          // Check for strong indicators - these always trigger
          for (const indicator of strongIndicators) {
            if (indicator.test(lowerQuery)) {
              return true;
            }
          }
          
          // STRICT: Only trigger if query explicitly asks for recent/current info
          // Don't trigger on generic informational questions without recency indicators
          
          // Default: don't trigger for conversational or abstract queries
          return false;
        };
        
        // Retrieve ingested context only if smart trigger indicates it's needed
        // Make it blocking (with timeout) so we can add it to LLM context before streaming
        if (lastUserMessage && lastUserMessage.content && lastUserMessage.content.trim().length > 10) {
          const userQuery = lastUserMessage.content.trim();
          
          if (shouldTriggerIngestion(userQuery)) {
            // Fetch ingested context from memory-service (with timeout)
            try {
              const MEMORY_SERVICE_URL = process.env.MEMORY_SERVICE_URL || 'http://localhost:3001';
              const contextUrl = `${MEMORY_SERVICE_URL}/v1/ingestion/context`;
              
              const contextPromise = fetch(contextUrl, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'x-user-id': userId,
                  'x-internal-service': 'gateway',
                },
                body: JSON.stringify({ query: userQuery }),
              });
              
              // Wait up to 1 second for ingestion context
              const contextResponse = await Promise.race([
                contextPromise,
                new Promise<null>(resolve => setTimeout(() => resolve(null), 1000))
              ]);
              
              if (contextResponse && 'ok' in contextResponse && (contextResponse as Response).ok) {
                const data = await (contextResponse as Response).json().catch(() => null) as { items?: Array<{ title: string; summary: string; url: string; category: string; publishedDate: number; source: string }> } | null;
                
                if (data && Array.isArray(data.items) && data.items.length > 0) {
                  ingestedContext = data.items;
                  
                  // Calculate relevance score for each item with stricter matching
                  // Only emit if at least one item has reasonable relevance
                  const queryLower = userQuery.toLowerCase();
                  // Extract meaningful keywords (exclude common words, focus on content words)
                  const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'from', 'is', 'are', 'was', 'were', 'been', 'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'about', 'what', 'how', 'why', 'when', 'where', 'who', 'which', 'this', 'that', 'these', 'those']);
                  const queryWords = queryLower
                    .split(/\s+/)
                    .filter(w => w.length > 3 && !stopWords.has(w))
                    .slice(0, 8); // Limit to most important words
                  
                  if (queryWords.length > 0) {
                    const scoredItems = ingestedContext.map((item: any) => {
                      const titleLower = (item.title || '').toLowerCase();
                      const summaryLower = (item.summary || '').toLowerCase();
                      const combined = `${titleLower} ${summaryLower}`;
                      
                      // Count keyword matches (require word boundaries for better matching)
                      let matchCount = 0;
                      queryWords.forEach((word: string) => {
                        // Use word boundary matching to avoid partial matches
                        const wordPattern = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
                        if (wordPattern.test(combined)) {
                          matchCount++;
                        }
                      });
                      
                      // Relevance score: primarily based on match ratio, with priority bonus
                      const matchRatio = queryWords.length > 0 ? matchCount / queryWords.length : 0;
                      const priorityBonus = (item.priority || 5) / 10; // Normalize priority (1-10 scale)
                      
                      // Stricter scoring: require at least 40% keyword match for reasonable relevance
                      // Weight match ratio more heavily (80%) since it's more important than priority
                      const relevanceScore = matchRatio * 0.8 + priorityBonus * 0.2;
                      
                      return { ...item, relevanceScore, matchRatio, matchCount };
                    });
                    
                    // Stricter filtering: require at least 40% keyword match ratio OR very high priority
                    const relevantItems = scoredItems.filter((item: any) => 
                      item.matchRatio >= 0.4 || (item.relevanceScore >= 0.5 && item.priority >= 8)
                    );
                    
                    // Only use if we have at least one relevant item
                    if (relevantItems.length > 0) {
                      // Sort by relevance and take top 3
                      const topItems = relevantItems
                        .sort((a: any, b: any) => b.relevanceScore - a.relevanceScore)
                        .slice(0, 3)
                        .map((item: any) => {
                          // Remove internal scoring fields before sending to frontend
                          const { relevanceScore, matchRatio, matchCount, ...cleanItem } = item;
                          return cleanItem;
                        });
                      
                      // Format ingested context as natural text for LLM (not displayed to user)
                      // The LLM will synthesize this naturally into its response
                      const contextItems = topItems.map((item: any) => {
                        const title = item.title || '';
                        const summary = item.summary || '';
                        const domain = item.url ? new URL(item.url).hostname.replace(/^www\./, '') : '';
                        return `${title}${summary ? `: ${summary}` : ''}${domain ? ` (from ${domain})` : ''}`;
                      });
                      ingestedContextText = contextItems.join('\n\n');
                      
                      // Emit ingestion_context event for frontend logging (but don't display it)
                      reply.raw.write(`event: ingestion_context\ndata: ${JSON.stringify({ items: topItems })}\n\n`);
                      
                      logger.debug({ 
                        userId, 
                        threadId, 
                        itemsCount: topItems.length,
                        originalCount: ingestedContext.length,
                        filteredCount: relevantItems.length,
                        willAddToLLMContext: true
                      }, 'Ingested context retrieved - will be added to LLM context');
                    } else {
                      logger.debug({ userId, threadId, query: userQuery }, 'Ingested context retrieved but no items met relevance threshold');
                    }
                  } else {
                    logger.debug({ userId, threadId, query: userQuery }, 'No meaningful keywords extracted, skipping ingestion context');
                  }
                }
              }
            } catch (error: any) {
              // Non-critical - continue without ingested context
              logger.debug({ error: error.message }, 'Ingested context retrieval failed (non-critical)');
            }
          } else {
            logger.debug({ userId, threadId, query: userQuery }, 'Ingestion context not triggered (query does not indicate need for recent info)');
          }
        }

        // IMMEDIATE WEB SEARCH: Trigger when query needs up-to-date information
        let webSearchSummary: string | null = null;
        let webSearchSources: Array<{ title: string; host: string; url?: string; date?: string }> = [];
        
        if (lastUserMessage && lastUserMessage.content && lastUserMessage.content.trim().length > 10) {
          let userQuery = lastUserMessage.content.trim();
          
          // Auto-correct typos before analysis
          const correctedQuery = await correctQuery(userQuery);
          if (correctedQuery && correctedQuery !== userQuery) {
            logger.info({ original: userQuery, corrected: correctedQuery }, 'Query corrected for typos');
            userQuery = correctedQuery; // Use corrected query for search
          }
          
          // Use QueryAnalyzer for enterprise-grade intent detection
          const queryAnalysis = analyzeQuery(userQuery);
          
          // DEBUG: Log query analysis for troubleshooting
          logger.debug({
            userId,
            threadId,
            query: userQuery.substring(0, 100),
            queryAnalysis: {
              intent: queryAnalysis.intent,
              complexity: queryAnalysis.complexity,
              wordCount: queryAnalysis.wordCount,
              requiresDetail: queryAnalysis.requiresDetail
            },
            searchEnabled: config.flags.search
          }, 'QueryAnalyzer analysis result');
          
          // Check if web search should be triggered
          // Skip web search for conversational follow-ups (intent-based detection)
          let shouldSearch = false;
          if (queryAnalysis.intent === 'needs_web_search') {
            shouldSearch = true;
            logger.debug({ userId, threadId, intent: queryAnalysis.intent }, 'Web search triggered by QueryAnalyzer intent');
          } else if (queryAnalysis.intent === 'conversational_followup') {
            shouldSearch = false; // Never search for follow-up questions
            logger.debug({ userId, threadId, intent: queryAnalysis.intent }, 'Web search skipped - conversational follow-up detected');
          } else {
            // Legacy fallback for remaining queries
            shouldSearch = needsWebSearch(userQuery);
            logger.debug({ 
              userId, 
              threadId, 
              intent: queryAnalysis.intent,
              legacyNeedsWebSearch: shouldSearch
            }, 'Web search decision from legacy needsWebSearch function');
          }
          
          if (!shouldSearch) {
            logger.debug({ 
              userId, 
              threadId, 
              queryLength: userQuery.length,
              queryPreview: userQuery.substring(0, 50),
              queryIntent: queryAnalysis.intent,
              searchEnabled: config.flags.search
            }, 'Skipping web search - query does not need web search');
          } else {
            logger.info({ 
              userId, 
              threadId, 
              queryLength: userQuery.length,
              queryPreview: userQuery.substring(0, 100),
              searchEnabled: config.flags.search
            }, 'Triggering web search for up-to-date information');
            // Trigger STREAMING web search (emits status updates + streams tokens)
            webSearchPromise = (async () => {
            try {
              const MEMORY_SERVICE_URL = process.env.MEMORY_SERVICE_URL || 'http://localhost:3001';
              const searchUrl = `${MEMORY_SERVICE_URL}/v1/web-search/stream`;

              // Get conversation context for disambiguation (last 3 turns)
              let conversationContext: Array<{ role: string; content: string }> = [];
              try {
                const recentMessages = db
                  .prepare('SELECT * FROM messages WHERE thread_id = ? AND user_id = ? AND (deleted_at IS NULL OR deleted_at = 0) ORDER BY created_at DESC LIMIT ?')
                  .all(threadId, userId, 6) as Message[];
                if (recentMessages && recentMessages.length > 0) {
                  conversationContext = recentMessages.reverse().map(msg => ({
                    role: msg.role,
                    content: msg.content
                  }));
                }
              } catch (ctxError) {
                logger.debug({ error: (ctxError as Error).message }, 'Could not fetch conversation context for web search');
              }

              logger.debug({ userId, threadId, searchUrl, queryPreview: userQuery.substring(0, 50), hasContext: conversationContext.length > 0 }, 'Initiating streaming web search');

              // Optimize search query for fresher, more relevant results
              const optimizedQuery = WebSearchQueryOptimizer.optimizeSearchQuery(userQuery);
              const { query: finalQuery, dateFilter } = WebSearchQueryOptimizer.addDateFilters(optimizedQuery);

              logger.debug({
                originalQuery: userQuery,
                optimizedQuery: finalQuery,
                dateFilter
              }, 'Query optimized for web search');

              const response = await fetch(searchUrl, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'x-user-id': userId,
                  'x-internal-service': 'gateway',
                },
                body: JSON.stringify({
                  query: finalQuery,
                  threadId,
                  conversationContext,
                  dateFilter, // Pass date filter to search service
                }),
              });

              if (!response.ok) {
                const errorText = await response.text().catch(() => '');
                logger.error({
                  userId,
                  threadId,
                  status: response.status,
                  errorText: errorText.substring(0, 200)
                }, 'Streaming web search endpoint returned error');
                return null;
              }

              if (!response.body) {
                logger.warn({ userId, threadId }, 'No response body from streaming web search');
                return null;
              }

              // Parse SSE stream from memory-service
              const reader = response.body.getReader();
              const decoder = new TextDecoder();
              let buffer = '';
              let summary = '';
              let sources: Array<{ title: string; host: string; url?: string; date?: string }> = [];

              while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                
                // Parse SSE events: look for complete events (ending with \n\n)
                let eventEnd = buffer.indexOf('\n\n');
                while (eventEnd >= 0) {
                  const eventBlock = buffer.substring(0, eventEnd);
                  buffer = buffer.substring(eventEnd + 2); // Remove processed event
                  
                  const eventLines = eventBlock.split('\n');
                  let eventType = '';
                  let eventData = '';

                  for (const line of eventLines) {
                    if (line.startsWith('event: ')) {
                      eventType = line.slice(7).trim();
                    } else if (line.startsWith('data: ')) {
                      eventData = line.slice(6).trim();
                    }
                  }

                  if (eventType && eventData) {
                    try {
                      const parsed = JSON.parse(eventData);

                      // Forward status messages to client
                      if (eventType === 'search_status' && parsed.status) {
                        reply.raw.write(`event: search_status\ndata: ${JSON.stringify({ status: parsed.status })}\n\n`);
                        logger.debug({ userId, threadId, status: parsed.status }, 'Search status forwarded');
                      }

                      // Handle tokens - check for FINAL marker to use cleaned version
                      if (eventType === 'token' && parsed.text) {
                        // Check if this is the final cleaned version
                        const finalMatch = parsed.text.match(/\[FINAL:(.+)\]$/s);
                        if (finalMatch) {
                          // Use the final cleaned summary (replaces accumulated tokens)
                          summary = finalMatch[1];
                          logger.debug({ userId, threadId, cleanedLength: summary.length }, 'Received final cleaned summary from web search');
                        } else {
                          // Regular token - accumulate it and forward to client
                          summary += parsed.text;
                          reply.raw.write(`event: token\ndata: ${JSON.stringify(parsed.text)}\n\n`);
                        }
                      }

                      // Collect sources
                      if (eventType === 'sources' && parsed.sources) {
                        sources = parsed.sources;
                      }

                      // Done - return accumulated summary (which may have been replaced by FINAL)
                      if (eventType === 'done') {
                        logger.info({
                          userId,
                          threadId,
                          summaryLength: summary.length,
                          sourcesCount: sources.length
                        }, 'Streaming web search completed');
                        return JSON.stringify({ summary, sources });
                      }
                    } catch (e) {
                      // Skip invalid JSON - continue to next event
                      logger.debug({ userId, threadId, error: String(e), eventType, eventDataPreview: eventData.substring(0, 50) }, 'Skipping invalid SSE event data');
                    }
                  }
                  
                  // Look for next complete event
                  eventEnd = buffer.indexOf('\n\n');
                }
              }

              return summary.length > 0 ? JSON.stringify({ summary, sources }) : null;
            } catch (error: any) {
              logger.error({
                userId,
                threadId,
                error: error.message,
                errorName: error.name,
                stack: error.stack?.substring(0, 200)
              }, 'Streaming web search failed with exception (non-critical, continuing without search)');
            }
            return null;
          })();
          
            // Wait for web search with extended timeout (max 5s) to include in LLM context
            // Extended timeout because Brave Search + LLM composition can take longer
            try {
              const searchStartTime = Date.now();
              const result = await Promise.race([
                webSearchPromise,
                new Promise<string | null>(resolve => setTimeout(() => resolve(null), 5000)), // Extended to 5s
              ]);
              const searchElapsed = Date.now() - searchStartTime;
              
              if (result) {
                try {
                  const parsed = JSON.parse(result) as { summary?: string; sources?: Array<{ title: string; host: string; url?: string; date?: string }> };
                  webSearchSummary = parsed.summary || null;
                  webSearchSources = parsed.sources || [];

                  if (webSearchSummary && webSearchSummary.trim().length > 0) {
                    logger.info({
                      userId,
                      threadId,
                      summaryLength: webSearchSummary.length,
                      sourcesCount: webSearchSources.length,
                      searchElapsed
                    }, 'Web search completed successfully - response already streamed to user, skipping main LLM');

                    // Web search completed successfully and was already streamed to user
                    // Send sources and done event, then END the response (skip main LLM)
                    if (webSearchSources.length > 0) {
                      reply.raw.write(
                        `event: sources\ndata: ${JSON.stringify({ sources: webSearchSources })}\n\n`
                      );
                    }
                    reply.raw.write(`event: done\ndata: ${JSON.stringify({ ttfb_ms: searchElapsed, web_search: true })}\n\n`);
                    reply.raw.end();
                    return; // EXIT - don't continue to main LLM
                  } else {
                    logger.warn({
                      userId,
                      threadId,
                      searchElapsed,
                      hasSources: webSearchSources.length > 0
                    }, 'Web search returned empty summary - falling back to main LLM');
                    webSearchSummary = null;
                  }
                } catch (parseError) {
                  logger.warn({
                    userId,
                    threadId,
                    parseError: (parseError as Error).message
                  }, 'Web search result parsing failed - falling back to main LLM');
                  webSearchSummary = null;
                }
              } else {
                logger.warn({
                  userId,
                  threadId,
                  searchElapsed,
                  timeout: searchElapsed >= 5000
                }, 'Web search timed out or returned no results - falling back to main LLM');
              }
            } catch (error) {
              // Log errors but continue without web search in context
              logger.error({ 
                userId, 
                threadId, 
                error: (error as Error).message,
                stack: (error as Error).stack?.substring(0, 200)
              }, 'Web search wait failed with exception');
            }
          }
        }

        // Context trimming - web search responses are now fully independent (streamed directly)
        // Only trimming context for regular LLM conversations (when web search didn't handle it)
        const { trimmed: initialTrimmed, trimmedTokens } = await trimmer.trim(threadId, body.messages, userId);

        // Analyze query for dynamic verbosity scaling (reuse existing lastUserMessage if available)
        const queryLastUserMessage = body.messages.filter(m => m.role === 'user').pop();
        let queryAnalysis: { complexity: string; verbosityInstruction?: string; followUpGuidance?: string } | null = null;
        let wasExplicitSave = false; // Track if explicit save was attempted
        
        if (queryLastUserMessage?.content) {
          const { analyzeQuery, getVerbosityInstruction, getFollowUpGuidance } = await import('./QueryAnalyzer.js');
          const analysis = analyzeQuery(queryLastUserMessage.content);
          queryAnalysis = {
            complexity: analysis.complexity,
            verbosityInstruction: getVerbosityInstruction(analysis) || undefined,
            followUpGuidance: getFollowUpGuidance(analysis) || undefined,
          };
          
          // Handle memory listing requests - fetch and inject memories directly
          if (analysis.intent === 'memory_list' && userId) {
            try {
              const MEMORY_SERVICE_URL = process.env.MEMORY_SERVICE_URL || 'http://localhost:3001';
              const memoryListUrl = `${MEMORY_SERVICE_URL}/v1/memories?userId=${userId}&limit=10&offset=0`;
              
              const memoryResponse = await fetch(memoryListUrl, {
                method: 'GET',
                headers: {
                  'Content-Type': 'application/json',
                  'x-user-id': userId,
                  'x-internal-service': 'gateway',
                },
              }).catch(() => null);
              
              if (memoryResponse && 'ok' in memoryResponse && (memoryResponse as Response).ok) {
                const memoryData = await (memoryResponse as Response).json().catch(() => null) as { memories?: Array<{ content: string; tier: string; priority: number; createdAt: number }> } | null;
                
                if (memoryData && Array.isArray(memoryData.memories) && memoryData.memories.length > 0) {
                  // Format memories as natural text for the LLM
                  const memoryList = memoryData.memories.slice(0, 10).map((mem, idx) => {
                    const content = mem.content.length > 150 ? mem.content.substring(0, 150) + '...' : mem.content;
                    return `${idx + 1}. ${content}`;
                  }).join('\n\n');
                  
                  ingestedContextText = `User is asking to see their saved memories. Here are the current memories:\n\n${memoryList}`;
                  logger.debug({ userId, memoryCount: memoryData.memories.length }, 'Memory list fetched for user');
                } else {
                  ingestedContextText = 'User is asking to see their saved memories. They currently have no saved memories.';
                  logger.debug({ userId }, 'No memories found for user');
                }
              }
            } catch (error: any) {
              logger.warn({ error: error.message }, 'Failed to fetch memory list (non-critical)');
            }
          }
          
          // Handle explicit memory save requests
          if (analysis.intent === 'memory_save' && userId) {
            try {
              logger.info({ userId, threadId, query: queryLastUserMessage.content }, 'Memory save intent detected');
              const MEMORY_SERVICE_URL = process.env.MEMORY_SERVICE_URL || 'http://localhost:3001';
              
              // Extract what to save from the message
              // Handles patterns like:
              // - "remember this" → last assistant message
              // - "remember that my X" → extracts "my X..."
              // - "my X - remember that for me" → extracts "my X..."
              // - "can you remember that idea you gave me earlier about X" → looks back in conversation
              // - "remember 'specific thing'" → extracts quoted content
              let contentToSave: string | null = null;
              const originalQuery = queryLastUserMessage.content;
              const lowerQuery = originalQuery.toLowerCase().trim();
              
              // Check for "remember this" (which refers to last assistant message)
              if (/remember\s+this\b/i.test(lowerQuery)) {
                // Look at last few messages to find what "this" refers to
                const recentMessages = body.messages.slice(-6);
                const lastAssistantMsg = [...recentMessages].reverse().find(m => m.role === 'assistant');
                if (lastAssistantMsg && lastAssistantMsg.content.trim()) {
                  contentToSave = lastAssistantMsg.content;
                  logger.debug({ userId, threadId }, 'Extracted last assistant message for "remember this"');
                }
              }
              // Check for patterns like "X - remember that for me" or "X, remember that"
              // Extract content BEFORE the remember phrase
              else if (/(.+?)\s*[-–—,]\s*(remember|save|store)\s+(that|it|this)\s*(for me|please)?/i.test(originalQuery)) {
                const match = originalQuery.match(/(.+?)\s*[-–—,]\s*(remember|save|store)\s+(that|it|this)/i);
                if (match && match[1]) {
                  contentToSave = match[1].trim();
                  logger.debug({ userId, threadId, extracted: contentToSave }, 'Extracted content before "remember that"');
                }
              }
              // Check for "can you remember that idea/thing/concept you gave me earlier about X"
              else if (/(can you|could you|please)\s+(remember|save|store)\s+(that\s+)?(idea|concept|thing|suggestion|recommendation|advice|solution)\s+(you\s+)?(gave|provided|suggested|recommended|mentioned|said)\s+(me\s+)?(earlier|before|previously)/i.test(lowerQuery)) {
                // Look back in conversation for assistant messages that might contain the idea
                const recentMessages = body.messages.slice(-20);
                const assistantMessages = recentMessages.filter(m => m.role === 'assistant').slice(-3);
                if (assistantMessages.length > 0) {
                  // Extract what they're asking about (the topic after "about")
                  const aboutMatch = lowerQuery.match(/about\s+(.+?)(?:\s|$)/i);
                  if (aboutMatch) {
                    const topic = aboutMatch[1].trim();
                    // Find assistant message that mentions this topic
                    const relevantMsg = assistantMessages.find(m => 
                      m.content.toLowerCase().includes(topic.toLowerCase())
                    );
                    if (relevantMsg) {
                      contentToSave = relevantMsg.content;
                      logger.debug({ userId, threadId, topic }, 'Extracted assistant message about topic');
                    }
                  }
                  // If no specific topic, use most recent assistant message
                  if (!contentToSave && assistantMessages.length > 0) {
                    contentToSave = assistantMessages[assistantMessages.length - 1].content;
                    logger.debug({ userId, threadId }, 'Extracted most recent assistant message for "remember that idea"');
                  }
                }
              }
              // Handle "can you remember that my X" pattern - check this BEFORE generic patterns
              else if (/(can you|could you|please)\s+remember\s+(that|it)\s+my\b/i.test(lowerQuery)) {
                // Extract "my X..." part
                const match = originalQuery.match(/(?:can you|could you|please)\s+remember\s+(?:that|it)\s+(my\s+.+?)(?:\s+[-–—]|\s+for\s+me|$)/i);
                if (match && match[1]) {
                  contentToSave = match[1].trim();
                } else {
                  // Fallback: extract everything after "remember that my"
                  const fallbackMatch = originalQuery.match(/(?:can you|could you|please)\s+remember\s+(?:that|it)\s+(my\s+.+)$/i);
                  if (fallbackMatch && fallbackMatch[1]) {
                    contentToSave = fallbackMatch[1].trim();
                  } else {
                    // Last resort: remove prefix and keep rest
                    contentToSave = originalQuery.replace(/^(.*?)\s*(?:can you|could you|please)\s+remember\s+(?:that|it)\s+/i, '').trim();
                  }
                }
                logger.debug({ userId, threadId, extracted: contentToSave }, 'Extracted from "can you remember that my" pattern');
              }
              // Handle "remember that my X" pattern - extract what comes after "my"
              else if (/remember\s+(that|it)\s+my\b/i.test(lowerQuery)) {
                const match = originalQuery.match(/remember\s+(that|it)\s+(my\s+.+?)(?:\s+[-–—]|\s+for\s+me|$)/i);
                if (match && match[2]) {
                  contentToSave = match[2].trim();
                } else {
                  // Fallback: extract everything after "remember that my"
                  contentToSave = originalQuery.replace(/^(.*?)\s*remember\s+(that|it)\s+(my\s+)/i, '$3').trim();
                }
              }
              // Handle "can you remember my X" pattern
              else if (/(can you|could you|please)\s+remember\s+(my|I|me)\b/i.test(lowerQuery)) {
                const match = originalQuery.match(/(?:can you|could you|please)\s+remember\s+(my|I|me)\s+(.+?)(?:\s+[-–—]|\s+for\s+me|$)/i);
                if (match && match[2]) {
                  contentToSave = (match[1] === 'I' ? 'I ' : match[1] === 'me' ? 'User ' : 'my ') + match[2].trim();
                } else {
                  contentToSave = originalQuery.replace(/^(.*?)\s*(?:can you|could you|please)\s+remember\s+(my|I|me)\s+/i, 
                    (_, __, pronoun) => pronoun === 'I' ? 'I ' : pronoun === 'me' ? 'User ' : 'my ').trim();
                }
              }
              // Handle "remember my X" pattern
              else if (/remember\s+(my|I|me)\b/i.test(lowerQuery)) {
                const match = originalQuery.match(/remember\s+(my|I|me)\s+(.+?)(?:\s+[-–—]|\s+for\s+me|$)/i);
                if (match && match[2]) {
                  contentToSave = (match[1] === 'I' ? 'I ' : match[1] === 'me' ? 'User ' : 'my ') + match[2].trim();
                } else {
                  contentToSave = originalQuery.replace(/^(.*?)\s*remember\s+(my|I|me)\s+/i, 
                    (_, __, pronoun) => pronoun === 'I' ? 'I ' : pronoun === 'me' ? 'User ' : 'my ').trim();
                }
              }
              // Handle "can you remember that X" pattern (generic, not "my")
              else if (/(can you|could you|please)\s+remember\s+(that|it)\b/i.test(lowerQuery)) {
                const match = originalQuery.match(/(?:can you|could you|please)\s+remember\s+(?:that|it)\s+(.+?)(?:\s+for\s+me|\s+please|$)/i);
                if (match && match[1]) {
                  contentToSave = match[1].trim();
                } else {
                  contentToSave = originalQuery.replace(/^(.*?)\s*(?:can you|could you|please)\s+remember\s+(?:that|it)\s*/i, '').trim();
                }
              }
              // Handle "remember that X" (generic, not "my")
              else if (/remember\s+(that|it)\b/i.test(lowerQuery)) {
                const match = originalQuery.match(/remember\s+(that|it)\s+(.+?)(?:\s+for\s+me|\s+please|$)/i);
                if (match && match[2]) {
                  contentToSave = match[2].trim();
                } else {
                  contentToSave = originalQuery.replace(/^(.*?)\s*remember\s+(that|it)\s*/i, '').trim();
                }
              }
              // User says "remember 'something specific'" with quotes
              else if (/remember\s+['"](.+?)['"]/i.test(originalQuery)) {
                const match = originalQuery.match(/remember\s+['"](.+?)['"]/i);
                if (match && match[1]) {
                  contentToSave = match[1];
                }
              }
              // User says "can you remember something" without quotes - extract everything after "remember"
              else if (/^(can you|could you|please)\s+remember\s+(.+)$/i.test(originalQuery)) {
                const match = originalQuery.match(/^(can you|could you|please)\s+remember\s+(.+)$/i);
                if (match && match[2]) {
                  contentToSave = match[2].trim();
                }
              }
              else if (/^remember\s+(.+)$/i.test(originalQuery)) {
                const match = originalQuery.match(/^remember\s+(.+)$/i);
                if (match && match[1]) {
                  contentToSave = match[1].trim();
                }
              }
              
              // Fallback: if we couldn't extract anything specific, use the whole query
              if (!contentToSave || contentToSave.trim().length === 0) {
                // Remove common request phrases but keep the content
                contentToSave = originalQuery
                  .replace(/^(can you|could you|please)\s+/i, '')
                  .replace(/\s+(for me|please|in mind)\s*$/i, '')
                  .trim();
              }
              
              // Limit content length
              if (contentToSave.length > 1024) {
                contentToSave = contentToSave.substring(0, 1020) + '...';
              }
              
              if (contentToSave && contentToSave.trim().length > 0) {
                logger.info({ userId, threadId, contentToSave, originalQuery }, 'Attempting to save explicit memory');
                // Save directly via POST /v1/memories endpoint with high priority
                try {
                  const saveResponse = await fetch(`${MEMORY_SERVICE_URL}/v1/memories`, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'x-user-id': userId,
                      'x-internal-service': 'gateway',
                    },
                    body: JSON.stringify({
                      threadId,
                      content: contentToSave,
                      priority: 0.9, // High priority for explicit saves
                      tier: 'TIER1', // Most important tier
                    }),
                    signal: AbortSignal.timeout(5000), // 5 second timeout
                  });

                  if (saveResponse?.ok) {
                    const savedMemory = await saveResponse.json().catch(() => null) as { id?: string } | null;
                    logger.info({ userId, threadId, contentLength: contentToSave.length, memoryId: savedMemory?.id }, 'Explicit memory saved successfully');
                    wasExplicitSave = true; // Mark that save was successful
                  } else if (saveResponse) {
                    const errorText = await saveResponse.text().catch(() => 'Unknown error');
                    logger.error({ userId, threadId, status: saveResponse.status, error: errorText }, 'Failed to save memory - non-ok response');
                  } else {
                    logger.error({ userId, threadId }, 'Failed to save memory - no response');
                  }
                } catch (fetchError: any) {
                  if (fetchError.name === 'AbortError') {
                    logger.error({ userId, threadId }, 'Failed to save explicit memory - timeout');
                  } else {
                    logger.error({ userId, threadId, error: fetchError.message, stack: fetchError.stack }, 'Failed to save explicit memory - fetch error');
                  }
                }
              } else {
                logger.warn({ userId, threadId, originalQuery }, 'No content extracted for memory save');
              }
            } catch (error: any) {
              logger.error({ error: error.message, stack: error.stack, userId, threadId }, 'Failed to save explicit memory (non-critical)');
            }
          }
        }
        
        // Fetch user profile for personalization (non-blocking, graceful failure)
        let userProfile: any = null;
        if (userId) {
          try {
            const MEMORY_SERVICE_URL = process.env.MEMORY_SERVICE_URL || 'http://localhost:3001';
            const profileUrl = `${MEMORY_SERVICE_URL}/v1/profile?userId=${userId}`;
            
            const profilePromise = fetch(profileUrl, {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json',
                'x-user-id': userId,
                'x-internal-service': 'gateway',
              },
            }).then(async (res) => {
              if (res.ok) {
                const data = await res.json() as { profile?: any };
                return data.profile || null;
              }
              return null;
            }).catch(() => null);
            
            // Race with timeout (30ms max - non-blocking)
            userProfile = await Promise.race([
              profilePromise,
              new Promise<any>((resolve) => setTimeout(() => resolve(null), 30))
            ]);
            
            if (userProfile) {
              logger.debug({ userId, hasProfile: true }, 'User profile fetched');
            }
          } catch (error: any) {
            // Silent failure - profile is optional
            logger.debug({ error: error.message, userId }, 'Failed to fetch user profile (non-critical)');
          }
        }

        // Build modular prompts using PromptBuilder
        // This preserves all functionality while improving structure
        const { PromptBuilder } = await import('./PromptBuilder.js');
        const promptBuilder = new PromptBuilder();

        // Set base conversational prompt (static - tone, ethics, behavior)
        promptBuilder.setBasePrompt(PromptBuilder.getDefaultBasePrompt());

        // Check for simple queries and add appropriate instructions
        const lastQuery = lastUserMessage?.content || '';
        let maxTokensOverride: number | undefined;

        if (SimpleQueryHandler.isSimpleQuery(lastQuery)) {
          const simpleInstruction = SimpleQueryHandler.getSimpleQueryInstruction(lastQuery);
          promptBuilder.addInstruction(simpleInstruction, 'critical');

          // For simple math, enforce very short responses
          if (/\d+[\+\-\*\/]\d+/.test(lastQuery.toLowerCase())) {
            maxTokensOverride = 10;
            promptBuilder.addInstruction('RESPOND WITH ONLY THE NUMBER. NO EXPLANATION, NO CONTEXT, JUST THE NUMERICAL ANSWER.', 'critical');
            logger.debug({ userId, threadId, query: lastQuery }, 'Simple math query detected, enforcing max_tokens=10');
          } else {
            logger.debug({ userId, threadId, query: lastQuery }, 'Simple query detected, adding direct answer instruction');
          }
        }

        // Check for follow-up questions and enforce brevity (using EnhancedFollowUpDetector)
        // CRITICAL FIX: Make max_tokens dynamic based on query complexity to prevent mid-response cutoffs
        if (EnhancedFollowUpDetector.isFollowUpQuery(lastQuery, body.messages.slice(0, -1))) {
          const followUpInstruction = EnhancedFollowUpDetector.getFollowUpInstruction();
          promptBuilder.addInstruction(followUpInstruction, 'critical'); // STRENGTHENED: Changed from 'high' to 'critical'
          
          // DYNAMIC max_tokens based on complexity - prevents cutoffs on technical follow-ups
          if (maxTokensOverride === undefined) {
            // Use query analysis to determine appropriate token limit
            const queryAnalysis = analyzeQuery(lastQuery);
            
            if (queryAnalysis.complexity === 'complex' || queryAnalysis.requiresDetail) {
              // Complex technical follow-ups need substantial tokens (e.g., "How do I handle state?")
              maxTokensOverride = 4000;
              logger.debug({ 
                userId, 
                threadId, 
                query: lastQuery, 
                complexity: queryAnalysis.complexity,
                requiresDetail: queryAnalysis.requiresDetail,
                maxTokensOverride 
              }, 'Complex follow-up detected - using higher token limit to prevent cutoffs');
            } else if (queryAnalysis.complexity === 'moderate') {
              // Moderate follow-ups need reasonable tokens
              maxTokensOverride = 2000;
              logger.debug({ 
                userId, 
                threadId, 
                query: lastQuery, 
                complexity: queryAnalysis.complexity,
                maxTokensOverride 
              }, 'Moderate follow-up detected - using moderate token limit');
            } else {
              // Simple conversational follow-ups can be brief
              maxTokensOverride = 200;
              logger.debug({ 
                userId, 
                threadId, 
                query: lastQuery, 
                complexity: queryAnalysis.complexity,
                maxTokensOverride 
              }, 'Simple follow-up detected - using brief token limit');
            }
          } else {
            // If math query already set maxTokensOverride to 10, keep it (math is more restrictive)
            // For other overrides, only reduce if it's excessive (don't increase if already set)
            if (maxTokensOverride < 200) {
              // Keep restrictive limits (like math query's 10)
              logger.debug({ userId, threadId, maxTokensOverride }, 'Keeping existing restrictive token limit');
            } else {
              // For other overrides, check if query needs more tokens
              const queryAnalysis = analyzeQuery(lastQuery);
              if ((queryAnalysis.complexity === 'complex' || queryAnalysis.requiresDetail) && maxTokensOverride < 4000) {
                maxTokensOverride = 4000;
                logger.debug({ userId, threadId, maxTokensOverride }, 'Increasing token limit for complex follow-up');
              }
            }
          }
          logger.debug({ userId, threadId, query: lastQuery, maxTokensOverride }, 'Follow-up detected (Enhanced), adding CRITICAL brevity instruction with dynamic max_tokens');
        }

        // Detect if user is correcting or redirecting
        const isCorrection = (query: string): boolean => {
          const lowerQuery = query.toLowerCase().trim();
          const correctionPatterns = [
            /^no\b/i,
            /^(not|wrong|incorrect|that's|that is) (what|how|where|when|who)/i,
            /^(rewrite|rephrase|fix|change|correct|update)/i,
            /^(actually|but|however),/i,
            /^that's not what/i,
            /^i meant|i wanted|what i really/i,
          ];
          return correctionPatterns.some(pattern => pattern.test(lowerQuery));
        };

        // If user is correcting, add critical instruction to prioritize their exact words
        if (isCorrection(lastQuery)) {
          promptBuilder.addInstruction(
            "The user is correcting or redirecting. Prioritize their exact words and current instruction over any previous context or assumptions.",
            'critical'
          );
          logger.debug({ userId, threadId, queryLength: lastQuery.length }, 'Correction detected, adding critical instruction');
        }
        
        // If explicit save was successful, tell LLM to acknowledge
        if (wasExplicitSave) {
          promptBuilder.addInstruction(
            "The user explicitly asked you to remember something and it has been saved. Acknowledge this naturally in your response.",
            'high'
          );
          logger.debug({ userId, threadId }, 'Explicit save acknowledged, adding confirmation instruction');
        }
        
        // Add profile-based personalization instructions (low priority - advisory only)
        if (userProfile) {
          if (userProfile.techStack && Array.isArray(userProfile.techStack) && userProfile.techStack.length > 0) {
            const techStackList = userProfile.techStack.slice(0, 5).join(', ');
            promptBuilder.addInstruction(
              `The user works with: ${techStackList}. Prefer examples and explanations in this context.`,
              'low'
            );
          }
          
          if (userProfile.communicationStyle) {
            const style = userProfile.communicationStyle;
            if (style === 'concise') {
              promptBuilder.addInstruction(
                'The user prefers concise, brief responses.',
                'low'
              );
            } else if (style === 'detailed') {
              promptBuilder.addInstruction(
                'The user prefers detailed, comprehensive explanations.',
                'low'
              );
            }
          }
          
          logger.debug({ userId, hasProfile: true }, 'Profile-based instructions added');
        }
        
        // Add dynamic verbosity instruction based on query analysis
        if (queryAnalysis?.verbosityInstruction) {
          promptBuilder.addInstruction(queryAnalysis.verbosityInstruction, 'medium');
        }
        
        // Add follow-up guidance for complex queries
        if (queryAnalysis?.followUpGuidance) {
          promptBuilder.addInstruction(queryAnalysis.followUpGuidance, 'low');
        }
        
        // Add ingested context (will be preprocessed into natural narrative)
        if (ingestedContextText && ingestedContextText.trim()) {
          promptBuilder.addContext(ingestedContextText, 'ingestion', true);
        }
        
        // Extract any existing context from system messages (from ContextTrimmer)
        // These are already preprocessed by ContextTrimmer into natural narrative
        const existingSystemMessages = initialTrimmed.filter(m => m.role === 'system');
        
        // Separate base prompt from context in existing system messages
        // ContextTrimmer now preprocesses context, so we just need to add it
        for (const sysMsg of existingSystemMessages) {
          const content = sysMsg.content;
          // Check if it's context (from ContextTrimmer preprocessing)
          // If it doesn't contain the base prompt markers, it's preprocessed context
          if (!content.includes('conversational partner') && !content.includes('Guidelines:')) {
            // This is preprocessed context from ContextTrimmer (already natural narrative)
            // Detect context type from content patterns for proper categorization
            if (content.toLowerCase().includes('previous conversation') || content.toLowerCase().includes('earlier in our conversation')) {
              promptBuilder.addContext(content, 'conversation', false); // Already preprocessed
            } else if (content.toLowerCase().includes('mentioned') || content.toLowerCase().includes('you mentioned')) {
              promptBuilder.addContext(content, 'memory', false); // Already preprocessed
            } else {
              // Default to memory type for unknown context (safest assumption)
              promptBuilder.addContext(content, 'memory', false);
            }
          }
        }
        
        // Build system messages using multiple messages for better separation
        // This helps LLM focus on each context type separately
        const systemMessages = promptBuilder.build();
        
        // Replace existing system messages with new modular structure
        // Remove old system messages
        let trimmed = initialTrimmed.filter(m => m.role !== 'system');
        
        // Add new system messages at the beginning
        if (systemMessages.length > 0) {
          trimmed.unshift(...systemMessages);
        }

        // Save incoming messages (batched in transaction for performance)
        const now = Math.floor(Date.now() / 1000);
        const insertMessages = db.transaction((messages: any[], threadId: string, userId: string | undefined, timestamp: number) => {
          const stmt = db.prepare(
            'INSERT INTO messages (thread_id, user_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)'
          );
          for (const msg of messages) {
            stmt.run(threadId, userId, msg.role, msg.content, timestamp);
          }
        });
        insertMessages(body.messages, threadId, userId, now);

        // FR decision
        const useFR = await router.shouldUseFR(threadId, userId);
        let frContent: string | null = null;
        let frLatency = 0;

        // Smart model selection: if no explicit provider/model requested, use optimal routing
        let finalProvider: string | undefined = providerName;
        let finalModel: string | undefined = model;
        
        if (!body.provider && !body.model) {
          // No explicit model/provider - use smart routing
          const optimal = router.selectOptimalModel(
            queryLastUserMessage?.content || '',
            queryAnalysis || undefined,
            trimmedTokens
          );
          finalProvider = optimal.provider;
          finalModel = optimal.model;
          logger.info({ 
            userId, 
            threadId, 
            selectedProvider: finalProvider, 
            selectedModel: finalModel,
            contextSize: trimmedTokens,
            complexity: queryAnalysis?.complexity
          }, 'Smart model routing applied');
        }

        // Provider fallback: try providers in order until one works
        // Priority: optimal provider -> requested provider -> fallbacks
        // Skip providers that don't have API keys configured
        const providerOrder: Array<{ name: string; provider: any; model: string }> = [];
        
        // Add optimal provider first (from smart routing or explicit request)
        if (finalProvider && finalModel) {
          const optimalP = providerPool.getProvider(finalProvider);
          if (optimalP && hasApiKey(finalProvider)) {
            providerOrder.push({ name: finalProvider, provider: optimalP, model: finalModel });
          }
        }
        
        // If specific provider requested and different from optimal, try it next
        if (providerName && provider && model && providerName !== finalProvider && hasApiKey(providerName)) {
          providerOrder.push({ name: providerName, provider, model });
        }
        
        // Add fallback providers in order: prioritize highest token output first
        // anthropic (4096) -> google (8192) -> openai (16384) (only if API keys are available)
        const fallbackOrder = ['anthropic', 'google', 'openai'];
        for (const fallbackName of fallbackOrder) {
          if (fallbackName !== providerName && fallbackName !== finalProvider && hasApiKey(fallbackName)) {
            const fallbackProvider = providerPool.getProvider(fallbackName);
            if (fallbackProvider) {
              const fallbackModel = config.models[fallbackName as 'openai' | 'anthropic' | 'google'];
              providerOrder.push({ name: fallbackName, provider: fallbackProvider, model: fallbackModel });
            }
          }
        }

        // Ensure at least one provider is available
        if (providerOrder.length === 0) {
          logger.error({ providerName, hasApiKeys: { openai: hasApiKey('openai'), anthropic: hasApiKey('anthropic'), google: hasApiKey('google') } }, 'No providers available with API keys');
          return reply.code(503).send({ error: 'No LLM providers available. Please configure at least one API key (OPENAI_API_KEY, ANTHROPIC_API_KEY, or GOOGLE_API_KEY).' });
        }

        // Debug logging: Log final prompt structure sent to LLM (after model selection)
        const firstProvider = providerOrder[0];
        if (firstProvider) {
          const estimatedTokens = firstProvider.provider.estimate(trimmed, firstProvider.model);
          logger.info({
            userId,
            threadId,
            systemMessagesCount: systemMessages.length,
            systemMessageLength: systemMessages[0]?.content?.length || 0,
            totalMessages: trimmed.length,
            estimatedTokens,
            selectedProvider: finalProvider,
            selectedModel: finalModel,
            contextSources: {
              hasMemories: ingestedContextText.length > 0,
              hasProfile: !!userProfile,
              hasCorrection: isCorrection(lastQuery),
              hasQueryAnalysis: !!queryAnalysis,
              queryComplexity: queryAnalysis?.complexity || 'unknown'
            }
          }, 'Final prompt structure before LLM call');
        }

        // Start FR in parallel (non-blocking) - use first provider for FR (only if available)
        const frProvider = providerOrder[0]?.provider;
        const frModel = providerOrder[0]?.model;
        const frPromise = useFR && frProvider && frModel ? router.routeFR(frProvider, trimmed, frModel, body) : null;

        // Try providers in order until one works, with timeout per provider
        let primaryStream: AsyncIterable<string> | null = null;
        let usedProvider: string = providerName || '';
        let usedModel: string = model || '';
        let streamError: Error | null = null;
        const PROVIDER_TEST_TIMEOUT = 3000; // 3 seconds max per provider test

        // Prepare options with provider-specific max_tokens from config
        const getMaxTokens = (providerName: string): number => {
          // Priority: maxTokensOverride > body.max_tokens > provider-specific > global default
          if (maxTokensOverride !== undefined) {
            return maxTokensOverride;
          }
          if (body.max_tokens !== undefined) {
            return body.max_tokens;
          }
          // Use provider-specific limit if available, otherwise use global default
          const providerLimit = config.router.maxOutputTokensPerProvider?.[providerName as 'openai' | 'anthropic' | 'google'];
          return providerLimit ?? config.router.maxOutputTokens;
        };

        for (const { name, provider: p, model: m } of providerOrder) {
          try {
            const finalMaxTokens = getMaxTokens(name);
            
            // DEBUG: Log max_tokens decision for troubleshooting
            logger.info({ 
              provider: name, 
              model: m,
              maxTokens: finalMaxTokens,
              maxTokensOverride,
              bodyMaxTokens: body.max_tokens,
              providerLimit: config.router.maxOutputTokensPerProvider?.[name as 'openai' | 'anthropic' | 'google'],
              globalDefault: config.router.maxOutputTokens,
              isMathQuery: /\d+[\+\-\*\/]\d+/.test(lastQuery.toLowerCase()),
              isFollowUp: EnhancedFollowUpDetector.isFollowUpQuery(lastQuery, body.messages.slice(0, -1))
            }, 'Provider selection with max_tokens enforcement');
            
            // Use provider-specific max tokens
            const providerOptions = {
              max_tokens: finalMaxTokens,
              temperature: body.temperature,
            };
            
            primaryStream = MOCK_MODE
              ? mockStream()
              : router.routePrimary(p, trimmed, m, providerOptions);

            // Test the stream by getting first token with timeout
            const testIterator = primaryStream[Symbol.asyncIterator]();
            
            // Race between first token and timeout
            const testPromise = testIterator.next();
            const timeoutPromise = new Promise<{ done: boolean; value?: string }>((resolve) => {
              setTimeout(() => resolve({ done: true }), PROVIDER_TEST_TIMEOUT);
            });
            
            const testResult = await Promise.race([testPromise, timeoutPromise]);
            
            if (!testResult.done && testResult.value !== undefined) {
              // Success! Use this provider
              usedProvider = name;
              usedModel = m;
              // Create a new iterator that includes the first token we already got
              primaryStream = {
                async *[Symbol.asyncIterator]() {
                  yield testResult.value!;
                  for await (const chunk of testIterator) {
                    yield chunk;
                  }
                }
              };
              break;
            } else {
              // Stream ended immediately or timed out - try next provider
              logger.warn({ provider: name, reason: testResult.done ? 'timeout' : 'empty' }, 'Provider test failed, trying next');
              primaryStream = null;
            }
          } catch (err: any) {
            // Provider failed - log and try next
            logger.warn({ provider: name, error: err.message }, 'Provider failed, trying next');
            streamError = err;
            primaryStream = null;
            continue;
          }
        }

        if (!primaryStream) {
          // All providers failed
          const errorMsg = streamError?.message || 'All providers failed';
          logger.error({ error: errorMsg }, 'All providers failed');
          reply.raw.write(`event: error\ndata: ${JSON.stringify({ error: errorMsg })}\n\n`);
          reply.raw.end();
          return;
        }

        // Wait for first token - get iterator (we already have it, but get it again for consistency)
        const iterator = primaryStream[Symbol.asyncIterator]();
        
        // Early-window research capsule polling (non-blocking, 2-3s window)
        const INJECTION_WINDOW_MS = 5000; // Extended to 5 seconds to allow research time
        let capsulePollingActive = true;
        let thinkingEmitted = false;
        const pollingStart = Date.now();
        const capsulePollPromise = (async () => {
          while (capsulePollingActive && Date.now() - pollingStart < INJECTION_WINDOW_MS) {
            try {
              // Poll for any recent capsule for this thread (using Redis KEYS scan)
              // Memory service uses randomUUID() for batchId, so we can't predict it
              // Instead, scan for factPack:{threadId}:* keys created in the last minute
              const { getRedis } = await import('../../memory-service/src/redis.js');
              const redis = getRedis();
              
              if (redis) {
                // Check for research started indicator (for thinking process)
                if (!thinkingEmitted) {
                  const startPattern = `researchStarted:${threadId}:*`;
                  const startKeys = await redis.keys(startPattern);
                  if (startKeys.length > 0) {
                    // Research has started - emit thinking event
                    reply.raw.write(`event: research_thinking\ndata: ${JSON.stringify({ thinking: true })}\n\n`);
                    logger.debug({ threadId }, 'Research thinking indicator emitted');
                    thinkingEmitted = true;
                  }
                }
                
                // Scan for factPack keys for this thread
                const pattern = `factPack:${threadId}:*`;
                const keys = await redis.keys(pattern);
                
                logger.debug({ threadId, keyCount: keys.length }, 'Polling for research capsules');
                
                // Get the most recently created capsule (keys are created when research completes)
                // Check up to 5 keys in case multiple research jobs completed
                for (const key of keys.slice(0, 5)) {
                  const cached = await redis.get(key);
                  
                  if (cached) {
                    try {
                      const capsule = JSON.parse(cached);
                      // Verify it's for the correct thread and not expired
                      const expiresAt = new Date(capsule.expiresAt);
                      const now = new Date();
                      if (capsule.threadId === threadId && expiresAt > now) {
                        // Don't emit research capsule - all responses come from LLM delta stream
                        logger.info({ threadId, batchId: key.split(':')[2], claims: capsule.claims?.length || 0 }, 'Research capsule found (used for future context)');
                        capsulePollingActive = false; // Stop polling after success
                        break;
                      } else {
                        logger.debug({ threadId, expired: expiresAt <= now, wrongThread: capsule.threadId !== threadId }, 'Capsule skipped');
                      }
                    } catch (parseError) {
                      logger.warn({ error: parseError, key }, 'Failed to parse capsule');
                    }
                  }
                }
              } else {
                logger.debug({ threadId }, 'Redis not available for capsule polling');
              }
            } catch (error) {
              // Redis not available or other error, continue
            }
            
            // Poll every 200ms
            await new Promise(resolve => setTimeout(resolve, 200));
          }
        })();

        // Note: Web search responses are now independent and don't reach this point
        // If we got here, web search either didn't trigger or failed, so continue with normal LLM

        let firstResult = await iterator.next();
        
        if (!firstResult.done) {
          firstTokenTime = Date.now();
          ttfbMs = firstTokenTime - startTime;
          tokenCount++;
          assistantContent += firstResult.value;

          // Check if FR finished and should be merged
          if (frPromise) {
            const frResult = await frPromise;
            if (frResult && frResult.latency < 400 && ttfbMs > 400) {
              frContent = frResult.content;
              frLatency = frResult.latency;
              reply.raw.write(`event: preface\ndata: ${JSON.stringify({ text: frContent })}\n\n`);
            }
          }

          // Emit slow_start if TTFB > 800ms
          if (ttfbMs > config.timeouts.ttfbSoftMs) {
            reply.raw.write(`event: slow_start\ndata: ${JSON.stringify({ ttfb_ms: ttfbMs })}\n\n`);
          }

          reply.raw.write(`event: token\ndata: ${JSON.stringify(firstResult.value)}\n\n`);

          // Keep capsule polling active for a bit longer (first 3-5 seconds of streaming)
          // This allows research to complete and inject even after first token
          setTimeout(() => {
            capsulePollingActive = false;
          }, Math.max(0, INJECTION_WINDOW_MS - (Date.now() - pollingStart)));

          // Continue streaming
          let lastFlush = Date.now();
          const flushInterval = 50;
          const flushSize = 16 * 1024;
          let bufferSize = 0;

          // Continue with remaining chunks
          while (true) {
            const result = await iterator.next();
            if (result.done) break;
            const chunk = result.value;
            tokenCount++;
            assistantContent += chunk;
            const chunkStr = `event: token\ndata: ${JSON.stringify(chunk)}\n\n`;
            reply.raw.write(chunkStr);
            bufferSize += chunkStr.length;

            const now = Date.now();
            if (now - lastFlush >= flushInterval || bufferSize >= flushSize) {
              // Note: flush may not be available on all Node.js versions
              const response = reply.raw as any;
              if (typeof response.flush === 'function') {
                response.flush();
              }
              bufferSize = 0;
              lastFlush = now;
            }
          }
          
          // Wait for capsule polling to finish (should already be done)
          try {
            await Promise.race([capsulePollPromise, new Promise(resolve => setTimeout(resolve, 100))]);
          } catch {
            // Ignore errors
          }
        } else {
          // No tokens received
          reply.raw.write('event: error\ndata: {"error":"No tokens received"}\n\n');
        }

        // Note: Sources are now emitted within the web search stream itself
        // This code only runs for non-web-search responses

        // Send done
        const totalTime = Date.now() - startTime;
        const tokensPerSec = tokenCount > 0 ? (tokenCount / totalTime) * 1000 : 0;

        reply.raw.write(
          `event: done\ndata: ${JSON.stringify({ ttfb_ms: ttfbMs, tokens_per_sec: tokensPerSec })}\n\n`
        );
        const response = reply.raw as any;
        if (typeof response.flush === 'function') {
          response.flush();
        }
        reply.raw.end();

        // Record metrics
        metrics.record('ttfb_ms', ttfbMs);
        metrics.record('tokens_per_sec', tokensPerSec);
        if (frLatency > 0) {
          metrics.record('fr_latency_ms', frLatency);
        }
        if (trimmedTokens > 0) {
          metrics.record('trimmed_tokens', trimmedTokens);
        }

        // Save assistant response
        if (assistantContent) {
          // POST-PROCESSING: Process math queries to ensure consistent format
          let finalContent = assistantContent;
          const isMathQuery = MathQueryPostProcessor.isMathQuery(lastQuery);
          
          if (isMathQuery) {
            const originalContent = finalContent;
            finalContent = MathQueryPostProcessor.processMathResponse(lastQuery, finalContent);
            
            if (finalContent !== originalContent) {
              logger.info({
                userId,
                threadId,
                query: lastQuery.substring(0, 50),
                originalLength: originalContent.length,
                processedLength: finalContent.length,
                originalPreview: originalContent.substring(0, 100),
                processedPreview: finalContent.substring(0, 100)
              }, 'Math query post-processed for consistent format');
            }
            
            // Additional logging for debugging
            const responseLength = finalContent.length;
            const expectedMaxLength = 50; // Very short for math queries
            if (responseLength > expectedMaxLength) {
              logger.warn({
                userId,
                threadId,
                query: lastQuery.substring(0, 50),
                responseLength,
                expectedMaxLength,
                responsePreview: finalContent.substring(0, 100),
                maxTokensEnforced: maxTokensOverride === 10
              }, 'Math query response longer than expected - max_tokens may not be enforced');
            } else {
              logger.debug({
                userId,
                threadId,
                responseLength,
                maxTokensEnforced: maxTokensOverride === 10
              }, 'Math query response length within expected range');
            }
          }
          
          const responseStmt = db.prepare(
            'INSERT INTO messages (thread_id, user_id, role, content, created_at, provider, model, tokens_output) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
          );
          responseStmt.run(threadId, userId, 'assistant', finalContent, Math.floor(Date.now() / 1000), usedProvider, usedModel, tokenCount);
          
          // Track cost
          if (userId && usedModel) {
            try {
              const { CostTracker } = await import('./CostTracker.js');
              const costTracker = new CostTracker();
              await costTracker.trackUsage({
                userId,
                model: usedModel,
                inputTokens: trimmedTokens,
                outputTokens: tokenCount,
                timestamp: new Date()
              });
            } catch (error) {
              logger.error({ error, userId, model: usedModel }, 'Failed to track cost (non-critical)');
            }
          }
        }

        // Update conversation title in thread_summaries if this is the first user message
        try {
          // Check if thread_summaries entry exists for this thread
          const existingSummary = db.prepare(
            'SELECT summary FROM thread_summaries WHERE thread_id = ? AND user_id = ?'
          ).get(threadId, userId) as { summary: string } | undefined;

          // Generate title from first user message if no summary exists or it's still "New Chat"
          if (!existingSummary || existingSummary.summary === 'New Chat') {
            const firstUserMsg = body.messages.find(m => m.role === 'user');
            if (firstUserMsg && firstUserMsg.content.trim()) {
              const text = firstUserMsg.content.trim();
              const preview = text.slice(0, 50);
              const title = preview.length < text.length ? preview + '...' : preview;

              if (existingSummary) {
                // Update existing entry
                db.prepare(
                  'UPDATE thread_summaries SET summary = ?, updated_at = ? WHERE thread_id = ? AND user_id = ?'
                ).run(title, Math.floor(Date.now() / 1000), threadId, userId);
              } else {
                // Insert new entry
                db.prepare(
                  'INSERT INTO thread_summaries (thread_id, user_id, summary, updated_at) VALUES (?, ?, ?, ?)'
                ).run(threadId, userId, title, Math.floor(Date.now() / 1000));
              }

              logger.debug({ threadId, userId, title }, 'Conversation title saved to thread_summaries');
            }
          }
        } catch (error: any) {
          // Non-critical - log and continue
          logger.warn({ error: error.message, threadId, userId }, 'Failed to update thread_summaries (non-critical)');
        }

        // Emit memory events (fire-and-forget)
        if (config.flags.memoryEvents) {
          // Emit user messages
          for (const msg of body.messages) {
            const msgId = randomUUID();
            
            // Estimate tokens safely using usedProvider if available
            let estimatedTokens = 0;
            if (usedProvider && usedModel) {
              const usedP = providerPool.getProvider(usedProvider);
              if (usedP) {
                estimatedTokens = usedP.estimate([msg], usedModel);
              }
            }
            
            const userEvent: MessageEvent = {
              userId,
              threadId,
              msgId,
              role: msg.role,
              content: msg.content,
              tokens: {
                input: estimatedTokens,
                output: 0,
              },
              timestamp: now * 1000,
            };
            emitMessageEvent(userEvent).catch(() => {}); // Fire-and-forget
          }

          // Emit assistant response
          if (assistantContent) {
            const assistantEvent: MessageEvent = {
              userId,
              threadId,
              msgId: randomUUID(),
              role: 'assistant',
              content: assistantContent,
              tokens: {
                input: 0,
                output: tokenCount,
              },
              timestamp: Date.now(),
            };
            emitMessageEvent(assistantEvent).catch(() => {}); // Fire-and-forget
          }
        }

        logger.info({
          thread_id: threadId,
          provider: usedProvider,
          model: usedModel,
          original_provider: providerName,
          ttfb_ms: ttfbMs,
          tokens_per_sec: tokensPerSec,
          trimmed_tokens: trimmedTokens,
        });
      } catch (error: any) {
        logger.error({ error: error?.message, stack: error?.stack, name: error?.name }, 'Stream error');
        if (!reply.sent) {
          try {
            reply.raw.write(`event: error\ndata: ${JSON.stringify({ error: String(error?.message || error) })}\n\n`);
            reply.raw.end();
          } catch (writeError) {
            // If we can't write, the connection is probably already closed
            logger.error({ writeError }, 'Failed to write error to stream');
          }
        }
      }
    } catch (error: any) {
      // Catch errors that happen before SSE headers are sent
      logger.error({ error: error?.message, stack: error?.stack }, 'Route handler error');
      if (!reply.sent) {
        return reply.code(500).send({ 
          error: 'Internal server error', 
          details: error?.message || String(error),
          type: error?.name 
        });
      }
    }
  });

  app.post('/v1/tokens/estimate', async (request, reply) => {
    const parseResult = TokenEstimateRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({ error: 'Invalid request', details: parseResult.error });
    }

    const body = parseResult.data;
    
    // Helper to check if provider has API key configured
    const hasApiKey = (name: string): boolean => {
      if (name === 'openai') return !!process.env.OPENAI_API_KEY;
      if (name === 'anthropic') return !!process.env.ANTHROPIC_API_KEY;
      if (name === 'google') return !!process.env.GOOGLE_API_KEY;
      return false;
    };
    
    // Default to first available provider with API key
    const requestedProvider = body.provider;
    const providerName = requestedProvider && hasApiKey(requestedProvider) ? requestedProvider :
                         hasApiKey('openai') ? 'openai' :
                         hasApiKey('anthropic') ? 'anthropic' :
                         hasApiKey('google') ? 'google' : null;
    
    if (!providerName) {
      return reply.code(503).send({ error: 'No LLM providers available. Please configure at least one API key (OPENAI_API_KEY, ANTHROPIC_API_KEY, or GOOGLE_API_KEY).' });
    }
    
    const model = body.model || config.models[providerName as 'openai' | 'anthropic' | 'google'];
    const provider = providerPool.getProvider(providerName);

    if (!provider) {
      return reply.code(400).send({ error: 'Invalid provider' });
    }

    const estimated = provider.estimate(body.messages, model);
    return { estimated_tokens: estimated, provider: providerName, model };
  });

  /**
   * GET /v1/conversations
   * List all conversations for the authenticated user
   */
  app.get('/v1/conversations', {
    preHandler: async (request, reply) => {
      await app.requireAuth(request, reply);
    },
  }, async (request, reply) => {
    if (!request.user?.id) {
      return reply.code(401).send({ error: 'Authentication required' });
    }

    const userId = request.user.id;

    try {
      // Get all unique thread_ids for this user (from messages table, excluding deleted)
      const conversations = db.prepare(`
        SELECT DISTINCT 
          thread_id,
          MIN(created_at) as created_at,
          MAX(created_at) as updated_at
        FROM messages
        WHERE user_id = ? AND (deleted_at IS NULL OR deleted_at = 0)
        GROUP BY thread_id
        ORDER BY updated_at DESC
      `).all(userId) as Array<{ thread_id: string; created_at: number; updated_at: number }>;

      // Get titles from thread_summaries or use first message
      const result = conversations.map(conv => {
        const summary = db.prepare('SELECT summary FROM thread_summaries WHERE thread_id = ? AND user_id = ? AND (deleted_at IS NULL OR deleted_at = 0)')
          .get(conv.thread_id, userId) as { summary: string } | undefined;
        
        let title = summary?.summary || 'New Chat';
        if (title.length > 50) {
          title = title.substring(0, 50) + '...';
        }

        return {
          id: conv.thread_id,
          title,
          updatedAt: conv.updated_at * 1000, // Convert to ms
        };
      });

      return reply.send({ conversations: result });
    } catch (error: any) {
      logger.error({ error }, 'Failed to list conversations');
      return reply.code(500).send({ error: 'Failed to list conversations' });
    }
  });

  /**
   * GET /v1/conversations/:threadId/messages
   * Get all messages for a specific conversation
   */
  app.get('/v1/conversations/:threadId/messages', {
    preHandler: async (request, reply) => {
      await app.requireAuth(request, reply);
    },
  }, async (request, reply) => {
    if (!request.user?.id) {
      return reply.code(401).send({ error: 'Authentication required' });
    }

    const userId = request.user.id;

    try {
      const { threadId } = request.params as { threadId: string };
      
      // Check if conversation exists and belongs to user
      const threadCheck = db.prepare(
        'SELECT 1 FROM messages WHERE thread_id = ? AND user_id = ? AND (deleted_at IS NULL OR deleted_at = 0) LIMIT 1'
      ).get(threadId, userId);
      
      if (!threadCheck) {
        return reply.code(404).send({ error: 'Conversation not found' });
      }
      
      const messages = db.prepare(
        'SELECT * FROM messages WHERE thread_id = ? AND user_id = ? AND (deleted_at IS NULL OR deleted_at = 0) ORDER BY created_at ASC'
      ).all(threadId, userId) as Message[];

      const formatted = messages.map(msg => ({
        id: msg.id.toString(),
        role: msg.role,
        content: msg.content,
      }));

      return reply.send({ messages: formatted });
    } catch (error: any) {
      logger.error({ error }, 'Failed to get messages');
      return reply.code(500).send({ error: 'Failed to get messages' });
    }
  });

  /**
   * DELETE /v1/conversations/:threadId
   * Delete a conversation (soft delete)
   */
  app.delete('/v1/conversations/:threadId', {
    preHandler: async (request, reply) => {
      await app.requireAuth(request, reply);
    },
  }, async (request, reply) => {
    if (!request.user?.id) {
      return reply.code(401).send({ error: 'Authentication required' });
    }

    const userId = request.user.id;

    try {
      const { threadId } = request.params as { threadId: string };
      const now = Math.floor(Date.now() / 1000);

      // First, verify that the thread exists and belongs to the user
      const threadCheck = db.prepare(
        'SELECT 1 FROM messages WHERE thread_id = ? AND user_id = ? AND (deleted_at IS NULL OR deleted_at = 0) LIMIT 1'
      ).get(threadId, userId);
      
      if (!threadCheck) {
        return reply.code(404).send({ error: 'Conversation not found' });
      }

      // Soft delete thread_summaries
      const summaryResult = db.prepare(
        'UPDATE thread_summaries SET deleted_at = ? WHERE thread_id = ? AND user_id = ? AND (deleted_at IS NULL OR deleted_at = 0)'
      ).run(now, threadId, userId);

      // Soft delete all messages in the thread
      const messagesResult = db.prepare(
        'UPDATE messages SET deleted_at = ? WHERE thread_id = ? AND user_id = ? AND (deleted_at IS NULL OR deleted_at = 0)'
      ).run(now, threadId, userId);

      logger.info({ threadId, userId, summaryChanges: summaryResult.changes, messageChanges: messagesResult.changes }, 'Conversation deleted');
      return reply.code(204).send();
    } catch (error: any) {
      logger.error({ error, message: error.message, stack: error.stack, code: error.code }, 'Failed to delete conversation');
      return reply.code(500).send({ error: 'Failed to delete conversation' });
    }
  });

  app.get('/openapi.json', async (_request, reply) => {
    try {
      const { readFileSync } = await import('fs');
      const { join } = await import('path');
      const { fileURLToPath } = await import('url');
      const { dirname } = await import('path');
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = dirname(__filename);
      const openApiPath = join(__dirname, '../../../packages/shared/dist/openapi.json');
      const content = readFileSync(openApiPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      logger.error({ error }, 'Failed to load OpenAPI spec');
      return reply.code(500).send({ error: 'OpenAPI spec not found' });
    }
  });

  app.get('/v1/metrics', async (_request, reply) => {
    const all = metrics.getAll();
    const ttfbHist = metrics.getHistogram('ttfb_ms');
    const tokensHist = metrics.getHistogram('tokens_per_sec');

    return {
      counters: all,
      percentiles: {
        ttfb_ms: {
          p50: metrics.percentile(ttfbHist, 50),
          p95: metrics.percentile(ttfbHist, 95),
        },
        tokens_per_sec: {
          p50: metrics.percentile(tokensHist, 50),
          p95: metrics.percentile(tokensHist, 95),
        },
      },
    };
  });

  /**
   * GET /v1/messages/search
   * Full-text search across messages using FTS5
   */
  app.get('/v1/messages/search', async (req, reply) => {
    await app.requireAuth(req, reply);

    if (reply.sent) {
      return;
    }

    const userId = req.user?.id;
    if (!userId) {
      return reply.code(401).send({ error: 'Authentication required' });
    }

    const {
      q,
      thread_id: threadId,
      limit = 20,
      offset = 0,
      snippets = true,
    } = req.query as {
      q?: string;
      thread_id?: string;
      limit?: number;
      offset?: number;
      snippets?: boolean | string;
    };

    if (!q || typeof q !== 'string' || q.trim().length === 0) {
      return reply.code(400).send({ error: 'Query parameter "q" is required' });
    }

    // Check if FTS5 is available
    if (!isFTS5Available()) {
      return reply.code(503).send({
        error: 'Full-text search not available',
        message: 'FTS5 index is not initialized'
      });
    }

    try {
      const results = searchMessages(q.trim(), {
        userId,
        threadId,
        limit: Math.min(Number(limit) || 20, 100),
        offset: Number(offset) || 0,
        includeSnippets: snippets === true || snippets === 'true',
      });

      return reply.code(200).send({
        query: q.trim(),
        results,
        total: results.length,
        limit,
        offset,
      });
    } catch (error: any) {
      logger.error({ error: error.message, userId, query: q }, 'Search failed');
      return reply.code(500).send({
        error: 'Search failed',
        message: error.message
      });
    }
  });

  // GET /v1/performance/report - Performance monitoring dashboard endpoint
  app.get('/v1/performance/report', async (request, reply) => {
    try {
      const report = performanceAnalyzer.generateReport();
      return reply.code(200).send(report);
    } catch (error: any) {
      logger.error({ error }, 'Failed to generate performance report');
      return reply.code(500).send({
        error: 'Failed to generate report',
        message: error.message
      });
    }
  });

  // GET /v1/performance/health - Quick health check
  app.get('/v1/performance/health', async (request, reply) => {
    try {
      const health = performanceAnalyzer.getHealthStatus();
      return reply.code(200).send(health);
    } catch (error: any) {
      logger.error({ error }, 'Failed to get health status');
      return reply.code(200).send({
        status: 'unknown',
        issues: ['Unable to determine health status']
      });
    }
  });

  // GET /v1/costs/report - Cost tracking and analytics
  app.get('/v1/costs/report', {
    preHandler: async (request, reply) => {
      await app.requireAuth(request, reply);
    },
  }, async (request, reply) => {
    try {
      const { timeframe = 'daily' } = request.query as { timeframe?: 'daily' | 'weekly' | 'monthly' };
      const { CostTracker } = await import('./CostTracker.js');
      const costTracker = new CostTracker();
      const report = await costTracker.generateCostReport(timeframe);
      return reply.code(200).send(report);
    } catch (error: any) {
      logger.error({ error }, 'Failed to generate cost report');
      return reply.code(500).send({
        error: 'Failed to generate report',
        message: error.message
      });
    }
  });
}

