/**
 * Strategy Planner - Decides which RAG layers to use
 */

import { QueryAnalysis } from './queryAnalyzer.js';
import { logger } from '../utils/logger.js';

export interface RetrievalStrategy {
  useMemory: boolean;
  useWebResearch: boolean;
  useVector: boolean;
  useGraph: boolean;
  enableVerification: boolean;
  layerPriority: string[];
  fusionMethod: 'weighted' | 'memory_priority' | 'recency_weighted' | 'semantic_priority' | 'comprehensive' | 'agentic_synthesis';
  originalQuery: string;
  needsExpansion?: boolean;
}

export class StrategyPlanner {
  /**
   * Plan retrieval strategy based on query analysis
   */
  plan(analysis: QueryAnalysis): RetrievalStrategy {
    const strategy: RetrievalStrategy = {
      useMemory: false,
      useWebResearch: false,
      useVector: false,
      useGraph: false,
      enableVerification: false,
      layerPriority: [],
      fusionMethod: 'weighted',
      originalQuery: '',
    };

    logger.debug({ queryType: analysis.queryType, complexity: analysis.complexity }, 'Planning strategy');

    // Personal/Historical queries → Memory + Graph
    if (analysis.queryType === 'personal') {
      strategy.useMemory = true;
      strategy.useGraph = true;
      strategy.enableVerification = false; // Trust user memory
      strategy.layerPriority = ['memory', 'graph'];
      strategy.fusionMethod = 'memory_priority';
      return strategy;
    }

    // Current Events → Web Research + Vector + Verification
    if (analysis.queryType === 'temporal') {
      strategy.useWebResearch = true;
      strategy.useVector = true;
      strategy.enableVerification = true; // Critical for news
      strategy.layerPriority = ['web', 'vector'];
      strategy.fusionMethod = 'recency_weighted';
      return strategy;
    }

    // Conceptual queries → Vector + Memory
    if (analysis.queryType === 'conceptual') {
      strategy.useVector = true;
      strategy.useMemory = true; // User's past understanding
      strategy.enableVerification = true;
      strategy.layerPriority = ['vector', 'memory'];
      strategy.fusionMethod = 'semantic_priority';
      return strategy;
    }

    // Comparative queries → All layers
    if (analysis.queryType === 'comparative') {
      strategy.useMemory = true;
      strategy.useWebResearch = true;
      strategy.useVector = true;
      strategy.useGraph = true;
      strategy.enableVerification = true;
      strategy.layerPriority = ['web', 'vector', 'memory', 'graph'];
      strategy.fusionMethod = 'comprehensive';
      return strategy;
    }

    // Complex/Vague queries → All layers + Agentic expansion
    if (analysis.complexity === 'complex') {
      strategy.useMemory = true;
      strategy.useWebResearch = true;
      strategy.useVector = true;
      strategy.useGraph = true;
      strategy.enableVerification = true;
      strategy.layerPriority = ['vector', 'web', 'memory', 'graph'];
      strategy.fusionMethod = 'agentic_synthesis';
      strategy.needsExpansion = true;
      return strategy;
    }

    // Default: Simple factual → Vector + Web
    strategy.useVector = true;
    strategy.useWebResearch = true;
    strategy.enableVerification = true;
    strategy.layerPriority = ['vector', 'web'];
    strategy.fusionMethod = 'weighted';

    return strategy;
  }

  /**
   * Apply user-specified options overrides
   */
  applyOverrides(strategy: RetrievalStrategy, options?: {
    enableMemory?: boolean;
    enableWebResearch?: boolean;
    enableVector?: boolean;
    enableGraph?: boolean;
    enableVerification?: boolean;
  }): RetrievalStrategy {
    if (!options) return strategy;

    const overridden: RetrievalStrategy = { ...strategy };

    if (options.enableMemory !== undefined) overridden.useMemory = options.enableMemory;
    if (options.enableWebResearch !== undefined) overridden.useWebResearch = options.enableWebResearch;
    if (options.enableVector !== undefined) overridden.useVector = options.enableVector;
    if (options.enableGraph !== undefined) overridden.useGraph = options.enableGraph;
    if (options.enableVerification !== undefined) overridden.enableVerification = options.enableVerification;

    // Rebuild priority list based on enabled layers
    if (overridden.useMemory || overridden.useWebResearch || overridden.useVector || overridden.useGraph) {
      overridden.layerPriority = [
        ...(overridden.useMemory ? ['memory'] : []),
        ...(overridden.useWebResearch ? ['web'] : []),
        ...(overridden.useVector ? ['vector'] : []),
        ...(overridden.useGraph ? ['graph'] : []),
      ];
    }

    logger.debug({ overrides: options }, 'Strategy overridden');

    return overridden;
  }
}

