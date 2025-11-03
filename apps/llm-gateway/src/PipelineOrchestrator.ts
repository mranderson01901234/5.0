/**
 * Pipeline Orchestrator - Coordinates all request processing stages
 * 
 * Stages:
 * 1. Preprocessing: Input validation, sanitization, rate limits
 * 2. Context Gathering: Parallel fetching of memories, web search, ingested context
 * 3. Model Routing: Smart model selection based on query characteristics
 * 4. Response Processing: Streaming execution
 * 5. Caching: Intelligent cache management
 * 6. Logging: Metrics and telemetry
 */

import { randomUUID } from 'crypto';
import { loadConfig } from './config.js';
import { logger } from './log.js';
import { metrics } from './metrics.js';
import { providerPool } from './ProviderPool.js';
import { Router } from './Router.js';
import type { ContextTrimmer } from './ContextTrimmer.js';
import type { IProvider } from './types.js';
import { analyzeQuery } from './QueryAnalyzer.js';
import { IntelligentModelRouter } from './IntelligentModelRouter.js';
import { CostTracker } from './CostTracker.js';

export interface PipelineRequest {
  userId: string;
  threadId: string;
  message: string;
  provider?: string;
  model?: string;
  preferences?: Record<string, any>;
  options?: {
    max_tokens?: number;
    temperature?: number;
  };
}

export interface PipelineResponse {
  stream: AsyncIterable<string>;
  metadata: {
    requestId: string;
    latency: number;
    model: string;
    provider: string | IProvider;
    contextSources: string[];
    cacheHit: boolean;
    stages?: {
      preprocessing: number;
      contextGathering: number;
      modelRouting: number;
      responseProcessing: number;
      total: number;
    };
  };
}

export interface ContextResult {
  memories: Array<{ content: string; tier?: string; type?: string }>;
  webSearch: string | null;
  ingestedContext: string;
  sources: string[];
}

export class PipelineOrchestrator {
  private config = loadConfig();
  private router: Router;
  private trimmer: ContextTrimmer;
  private intelligentRouter: IntelligentModelRouter;
  private costTracker: CostTracker;
  
  // Cache for context gathering results
  private contextCache = new Map<string, {
    data: ContextResult;
    expires: number;
  }>();
  
  constructor(router: Router, trimmer: ContextTrimmer) {
    this.router = router;
    this.trimmer = trimmer;
    this.intelligentRouter = new IntelligentModelRouter();
    this.costTracker = new CostTracker();
  }

  /**
   * Execute full pipeline for a request
   */
  async executeRequest(request: PipelineRequest): Promise<PipelineResponse> {
    const requestId = randomUUID();
    const startTime = Date.now();

    try {
      // Stage 1: Preprocessing
      const stage1Start = Date.now();
      const preprocessed = await this.preprocessRequest(request, requestId);
      const stage1Latency = Date.now() - stage1Start;

      // Stage 2: Context Gathering (Parallel with timeouts)
      const stage2Start = Date.now();
      const context = await this.gatherContext(preprocessed);
      const stage2Latency = Date.now() - stage2Start;

      // Stage 3: Model Routing
      const stage3Start = Date.now();
      const modelDecision = await this.routeToModel(preprocessed, context);
      const stage3Latency = Date.now() - stage3Start;

      // Stage 4: Response Processing (Streaming)
      const stage4Start = Date.now();
      const response = await this.processResponse(
        preprocessed, 
        context, 
        modelDecision.provider, 
        modelDecision.model,
        modelDecision.options
      );
      const stage4Latency = Date.now() - stage4Start;

      // Stage 5: Caching & Logging (Background, non-blocking)
      const totalLatency = Date.now() - startTime;
      this.handleCaching(preprocessed, context, response).catch(err => {
        logger.error({ error: err, requestId }, 'Cache operation failed (non-critical)');
      });
      this.logMetrics(requestId, totalLatency, modelDecision.model, context.sources).catch(err => {
        logger.error({ error: err, requestId }, 'Metrics logging failed (non-critical)');
      });

      return {
        stream: response.stream,
        metadata: {
          requestId,
          latency: totalLatency,
          model: modelDecision.model,
          provider: modelDecision.provider,
          contextSources: context.sources,
          cacheHit: false, // TODO: implement cache hit detection
          stages: {
            preprocessing: stage1Latency,
            contextGathering: stage2Latency,
            modelRouting: stage3Latency,
            responseProcessing: stage4Latency,
            total: totalLatency,
          },
        },
      };
    } catch (error: any) {
      logger.error({ error, requestId }, 'Pipeline execution failed');
      throw error;
    }
  }

  /**
   * Stage 1: Preprocessing
   */
  private async preprocessRequest(request: PipelineRequest, requestId: string): Promise<PipelineRequest & { requestId: string }> {
    const sanitized = {
      ...request,
      message: this.sanitizeInput(request.message),
      threadId: request.threadId || randomUUID(),
      requestId,
    };
    
    // TODO: Check rate limits via RequestManager
    // For now, this is handled in routes.ts
    
    return sanitized;
  }

  /**
   * Stage 2: Context Gathering (Parallel with timeouts)
   */
  private async gatherContext(request: PipelineRequest & { requestId: string }): Promise<ContextResult> {
    const contextStartTime = Date.now();
    
    // Check cache first
    const cacheKey = this.generateContextCacheKey(request);
    const cached = this.contextCache.get(cacheKey);
    if (cached && cached.expires > Date.now()) {
      logger.debug({ requestId: request.requestId, cacheAge: Date.now() - cached.expires }, 'Context cache hit');
      return cached.data;
    }

    // Parallel context gathering with timeouts
    const [ragResult, webResult, ingestedResult] = await Promise.allSettled([
      this.withTimeout(this.gatherRAGContext(request), 2000),
      this.withTimeout(this.gatherWebContext(request), 3000),
      this.withTimeout(this.gatherIngestedContext(request), 1000),
    ]);

    const result: ContextResult = {
      memories: ragResult.status === 'fulfilled' ? ragResult.value : [],
      webSearch: webResult.status === 'fulfilled' ? webResult.value : null,
      ingestedContext: ingestedResult.status === 'fulfilled' ? ingestedResult.value : '',
      sources: [],
    };

    // Identify context sources
    if (result.memories.length > 0) result.sources.push('memory');
    if (result.webSearch) result.sources.push('web');
    if (result.ingestedContext) result.sources.push('ingested');

    // Cache the result (short TTL - 5 minutes)
    this.contextCache.set(cacheKey, {
      data: result,
      expires: Date.now() + 5 * 60 * 1000,
    });

    // Cleanup old cache entries (keep last 100)
    if (this.contextCache.size > 100) {
      const entries = Array.from(this.contextCache.entries());
      entries.sort((a, b) => b[1].expires - a[1].expires);
      this.contextCache.clear();
      entries.slice(0, 100).forEach(([key, value]) => {
        this.contextCache.set(key, value);
      });
    }

    const contextLatency = Date.now() - contextStartTime;
    logger.debug({ 
      requestId: request.requestId, 
      contextLatency,
      sources: result.sources,
      memoryCount: result.memories.length,
    }, 'Context gathering complete');

    return result;
  }

  /**
   * Gather RAG context (memories from memory service)
   */
  private async gatherRAGContext(request: PipelineRequest & { requestId: string }): Promise<Array<{ content: string; tier?: string; type?: string }>> {
    if (!request.userId) return [];

    try {
      const MEMORY_SERVICE_URL = process.env.MEMORY_SERVICE_URL || 'http://localhost:3001';
      const recallPromise = fetch(
        `${MEMORY_SERVICE_URL}/v1/recall?userId=${encodeURIComponent(request.userId)}&maxItems=10&deadlineMs=200${request.message ? `&query=${encodeURIComponent(request.message)}` : ''}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'x-user-id': request.userId,
            'x-internal-service': 'gateway',
          },
        }
      ).then(async (res) => {
        if (res.ok) {
          const data = await res.json() as { memories?: any[] };
          return (data.memories || []).map((m: any) => ({
            content: m.content,
            tier: m.tier,
            type: 'memory',
          }));
        }
        return [];
      }).catch(() => []);

      const memories = await recallPromise;
      return memories;
    } catch (error: any) {
      logger.debug({ error: error.message, requestId: request.requestId }, 'RAG context gathering failed (non-critical)');
      return [];
    }
  }

  /**
   * Gather web search context
   */
  private async gatherWebContext(request: PipelineRequest & { requestId: string }): Promise<string | null> {
    if (!this.config.flags.search) return null;

    // Use QueryAnalyzer to determine if web search needed
    const queryAnalysis = analyzeQuery(request.message);
    if (queryAnalysis.intent !== 'needs_web_search') {
      return null;
    }

    try {
      const MEMORY_SERVICE_URL = process.env.MEMORY_SERVICE_URL || 'http://localhost:3001';
      const searchPromise = fetch(`${MEMORY_SERVICE_URL}/v1/web-search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': request.userId || '',
          'x-internal-service': 'gateway',
        },
        body: JSON.stringify({ query: request.message }),
      }).then(async (res) => {
        if (res.ok) {
          const data = await res.json() as { summary?: string };
          return data.summary || null;
        }
        return null;
      }).catch(() => null);

      return await searchPromise;
    } catch (error: any) {
      logger.debug({ error: error.message, requestId: request.requestId }, 'Web search gathering failed (non-critical)');
      return null;
    }
  }

  /**
   * Gather ingested context
   */
  private async gatherIngestedContext(request: PipelineRequest & { requestId: string }): Promise<string> {
    // Note: ingestion flag doesn't exist yet in config
    // For now, we'll skip ingested context
    // TODO: Implement when ingestion is properly configured
    return '';
  }

  /**
   * Stage 3: Model Routing
   */
  private async routeToModel(
    request: PipelineRequest & { requestId: string },
    context: ContextResult
  ): Promise<{ provider: IProvider; model: string; options?: any }> {
    const queryAnalysis = analyzeQuery(request.message);
    
    // Smart routing based on context size and query complexity
    const contextSize = this.calculateContextSize(context);
    
    const modelDecision = this.router.selectOptimalModel(
      request.message,
      {
        complexity: queryAnalysis.complexity,
        intent: queryAnalysis.intent,
      },
      contextSize
    );

    const provider = providerPool.getProvider(modelDecision.provider);
    if (!provider) {
      throw new Error(`Provider ${modelDecision.provider} not available`);
    }

    logger.debug({ 
      requestId: request.requestId,
      provider: modelDecision.provider,
      model: modelDecision.model,
      complexity: queryAnalysis.complexity,
      intent: queryAnalysis.intent,
      contextSize,
    }, 'Model routing complete');

    return {
      provider,
      model: modelDecision.model,
      options: request.options,
    };
  }

  /**
   * Stage 4: Response Processing
   */
  private async processResponse(
    request: PipelineRequest & { requestId: string },
    context: ContextResult,
    provider: IProvider,
    model: string,
    options?: any
  ): Promise<{ stream: AsyncIterable<string> }> {
    // Build messages array with context
    const messages = this.buildMessages(request, context, provider, model);

    // Execute model call (streaming)
    const stream = provider.stream(messages, model, options);

    return { stream };
  }

  /**
   * Build messages array from request and context
   */
  private buildMessages(
    request: PipelineRequest & { requestId: string },
    context: ContextResult,
    provider: IProvider,
    model: string
  ): Array<{ role: 'user' | 'assistant' | 'system'; content: string }> {
    const messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [];

    // Build context text
    const contextParts: string[] = [];

    if (context.memories.length > 0) {
      contextParts.push('=== User Memories ===');
      context.memories.forEach((m, i) => {
        contextParts.push(`${i + 1}. ${m.content}`);
      });
    }

    if (context.webSearch) {
      contextParts.push('=== Web Search Results ===');
      contextParts.push(context.webSearch);
    }

    if (context.ingestedContext) {
      contextParts.push('=== Recent Information ===');
      contextParts.push(context.ingestedContext);
    }

    // Combine context with user message
    if (contextParts.length > 0) {
      messages.push({
        role: 'system',
        content: contextParts.join('\n\n'),
      });
    }

    messages.push({
      role: 'user',
      content: request.message,
    });

    return messages;
  }

  /**
   * Stage 5: Caching (Background, non-blocking)
   */
  private async handleCaching(
    request: PipelineRequest & { requestId: string },
    context: ContextResult,
    response: { stream: AsyncIterable<string> }
  ): Promise<void> {
    // Context caching is already handled in gatherContext
    // Response caching will be implemented in IntelligentCache
    logger.debug({ requestId: request.requestId }, 'Caching handled');
  }

  /**
   * Stage 6: Logging (Background, non-blocking)
   */
  private async logMetrics(
    requestId: string,
    latency: number,
    model: string,
    sources: string[]
  ): Promise<void> {
    metrics.record('request_latency', latency);
    metrics.record(`model_${model}_latency`, latency);
    
    logger.info({
      requestId,
      latency,
      model,
      sources,
    }, 'Pipeline execution complete');
  }

  /**
   * Utility: Timeout wrapper
   */
  private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), ms)
      ),
    ]);
  }

  /**
   * Utility: Sanitize input
   */
  private sanitizeInput(input: string): string {
    return input.trim().slice(0, 10000); // Max 10k chars
  }

  /**
   * Utility: Generate context cache key
   */
  private generateContextCacheKey(request: PipelineRequest & { requestId: string }): string {
    return `${request.userId}:${request.threadId}:${request.message.substring(0, 100)}`;
  }

  /**
   * Utility: Calculate total context size
   */
  private calculateContextSize(context: ContextResult): number {
    let size = 0;
    
    context.memories.forEach(m => { size += m.content.length; });
    if (context.webSearch) size += context.webSearch.length;
    if (context.ingestedContext) size += context.ingestedContext.length;
    
    return size;
  }
}

