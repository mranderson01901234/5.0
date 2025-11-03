/**
 * Hybrid Orchestrator - Main Coordination Point
 */

import { VectorRAGLayer } from '../layers/vectorRAG.js';
import { MemoryRAGLayer } from '../layers/memoryRAG.js';
import { WebRAGLayer } from '../layers/webRAG.js';
import { VectorStore } from '../storage/vectorStore.js';
import { EmbeddingEngine } from '../storage/embeddingEngine.js';
import { QueryAnalyzer } from './queryAnalyzer.js';
import { QueryExpander } from './queryExpander.js';
import { StrategyPlanner } from './strategyPlanner.js';
import { MemoryServiceClient } from '../communication/memoryServiceClient.js';
import { HybridRAGRequest } from '../types/requests.js';
import { HybridRAGResponse } from '../types/responses.js';
import { logger } from '../utils/logger.js';

export class HybridOrchestrator {
  private vectorRAG: VectorRAGLayer;
  private memoryRAG: MemoryRAGLayer;
  private webRAG: WebRAGLayer;
  private queryAnalyzer: QueryAnalyzer;
  private queryExpander: QueryExpander;
  private strategyPlanner: StrategyPlanner;

  constructor() {
    const vectorStore = new VectorStore();
    const embeddingEngine = new EmbeddingEngine();
    this.vectorRAG = new VectorRAGLayer(vectorStore, embeddingEngine);
    
    const memoryServiceClient = new MemoryServiceClient();
    this.memoryRAG = new MemoryRAGLayer(memoryServiceClient);
    
    this.webRAG = new WebRAGLayer();
    
    this.queryAnalyzer = new QueryAnalyzer();
    this.queryExpander = new QueryExpander();
    this.strategyPlanner = new StrategyPlanner();
  }

  /**
   * Main entry point - processes query through hybrid RAG
   */
  async processQuery(request: HybridRAGRequest): Promise<HybridRAGResponse> {
    const startTime = Date.now();
    
    try {
      logger.info({ userId: request.userId, query: request.query }, 'Processing hybrid RAG query');

      // Step 1: Analyze query
      const analysis = await this.queryAnalyzer.analyze(request.query, request.context);
      logger.info({ intent: analysis.intent.primary, complexity: analysis.complexity, queryType: analysis.queryType }, 'Query analyzed');

      // Step 2: Expand query if needed
      let expandedQueries: string[] = [];
      if (analysis.queryType === 'vague' || analysis.complexity === 'complex') {
        expandedQueries = await this.queryExpander.expand(request.query, request.context);
        logger.debug({ original: request.query, expansions: expandedQueries }, 'Query expanded');
      } else {
        expandedQueries = [request.query];
      }

      // Step 3: Plan strategy
      let strategy = this.strategyPlanner.plan(analysis);
      
      // Apply user overrides if provided
      if (request.options) {
        strategy = this.strategyPlanner.applyOverrides(strategy, request.options);
      }

      logger.info({ 
        layers: strategy.layerPriority,
        fusion: strategy.fusionMethod,
        useMemory: strategy.useMemory,
        useVector: strategy.useVector,
        useWeb: strategy.useWebResearch
      }, 'Strategy planned');

      // Step 4: Execute retrieval from selected layers
      const results = await this.executeLayers(strategy, request);

      const latency = Date.now() - startTime;

      return {
        memories: results.memory,
        webResults: results.web,
        vectorResults: results.vector,
        graphPaths: [],
        synthesis: {
          totalResults: results.memory.length + results.vector.length + results.web.length,
          layerBreakdown: {
            memory: results.memory.length,
            web: results.web.length,
            vector: results.vector.length,
            graph: 0,
          },
          fusionMethod: strategy.fusionMethod,
        },
        confidence: this.calculateConfidence(results.vector, results.web, results.memory),
        verification: {
          verifiedCount: 0,
          unverifiedCount: results.memory.length + results.vector.length + results.web.length,
          conflictCount: 0,
          sourcesVerified: 0,
        },
        conflicts: [],
        strategy: strategy.fusionMethod,
        latency,
        layersExecuted: strategy.layerPriority,
        cached: false,
      };
    } catch (error) {
      logger.error({ error }, 'Hybrid RAG processing failed');
      throw error;
    }
  }

  /**
   * Execute retrieval from selected layers
   */
  private async executeLayers(strategy: any, request: HybridRAGRequest) {
    const results: any = {
      memory: [],
      web: [],
      vector: [],
      graph: [],
    };

    // Execute enabled layers in parallel
    const promises: Promise<any>[] = [];

    if (strategy.useVector) {
      promises.push(
        this.vectorRAG.retrieve(request).then(v => ({ layer: 'vector', results: v }))
          .catch(err => {
            logger.warn({ error: err.message }, 'Vector RAG retrieval failed');
            return { layer: 'vector', results: [] };
          })
      );
    }

    if (strategy.useMemory) {
      promises.push(
        this.memoryRAG.retrieve(request).then(m => ({ layer: 'memory', results: m }))
          .catch(err => {
            logger.warn({ error: err.message }, 'Memory RAG retrieval failed');
            return { layer: 'memory', results: [] };
          })
      );
    }

    if (strategy.useWebResearch) {
      promises.push(
        this.webRAG.retrieve(request).then(w => ({ layer: 'web', results: w }))
          .catch(err => {
            logger.warn({ error: err.message }, 'Web RAG retrieval failed');
            return { layer: 'web', results: [] };
          })
      );
    }

    // Wait for all to complete
    const completed = await Promise.all(promises);

    // Collect results
    completed.forEach(({ layer, results: layerResults }) => {
      if (layer === 'vector') results.vector = layerResults;
      if (layer === 'memory') results.memory = layerResults;
      if (layer === 'web') results.web = layerResults;
      if (layer === 'graph') results.graph = layerResults;
    });

    return results;
  }

  /**
   * Calculate overall confidence score
   * Combines similarity scores from vector results and relevance scores from web/memory results
   */
  private calculateConfidence(vectorResults: any[], webResults: any[], memoryResults: any[] = []): number {
    const allResults = [...vectorResults, ...webResults, ...memoryResults];
    if (allResults.length === 0) return 0;

    let totalScore = 0;
    let count = 0;

    // Vector results use similarity score
    vectorResults.forEach(r => {
      if (r.similarity !== undefined) {
        totalScore += r.similarity;
        count++;
      }
    });

    // Web results use relevanceScore
    webResults.forEach(r => {
      if (r.relevanceScore !== undefined) {
        totalScore += r.relevanceScore;
        count++;
      }
    });

    // Memory results use relevanceScore
    memoryResults.forEach(r => {
      if (r.relevanceScore !== undefined) {
        totalScore += r.relevanceScore;
        count++;
      }
    });

    return count > 0 ? totalScore / count : 0;
  }
}

