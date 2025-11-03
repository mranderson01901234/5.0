/**
 * Query Analyzer - Intent Classification and Understanding
 */

import OpenAI from 'openai';
import { loadConfig } from '../config.js';
import { logger } from '../utils/logger.js';

const config = loadConfig();

export interface QueryIntent {
  primary: 'personal' | 'factual' | 'conceptual' | 'comparative' | 'temporal';
  secondary?: string;
  confidence: number;
}

export interface TemporalContext {
  hasDate: boolean;
  dateRange?: { from: Date; to: Date };
  relativeTime?: 'today' | 'yesterday' | 'last_week' | 'last_month' | 'this_year';
}

export interface QueryAnalysis {
  intent: QueryIntent;
  entities: string[];
  temporalContext?: TemporalContext;
  complexity: 'simple' | 'medium' | 'complex';
  queryType: 'personal' | 'temporal' | 'conceptual' | 'comparative' | 'factual' | 'vague';
  requiresPersonalContext: boolean;
  requiresCurrentInfo: boolean;
  requiresVerification: boolean;
  confidence: number;
  suggestedStrategy: string;
}

export class QueryAnalyzer {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: config.openaiApiKey,
    });
  }

  /**
   * Analyze query to determine intent, complexity, and requirements
   */
  async analyze(query: string, _context?: any): Promise<QueryAnalysis> {
    try {
      logger.debug({ query }, 'Analyzing query');

      // Quick rule-based checks first
      const quickAnalysis = this.quickAnalyze(query);

      // If quick analysis is confident, use it; otherwise use LLM
      if (quickAnalysis.confidence > 0.8) {
        logger.debug('Using quick analysis');
        return quickAnalysis;
      }

      // LLM-based analysis for complex queries
      const llmAnalysis = await this.llmAnalyze(query, quickAnalysis);
      logger.debug({ intent: llmAnalysis.intent, complexity: llmAnalysis.complexity }, 'Query analyzed');

      return llmAnalysis;
    } catch (error) {
      logger.error({ error }, 'Query analysis failed, using fallback');
      // Fallback to simple analysis
      return this.fallbackAnalyze(query);
    }
  }

  /**
   * Quick rule-based analysis
   */
  private quickAnalyze(query: string): QueryAnalysis {
    const lowerQuery = query.toLowerCase();

    // Detect personal queries
    if (this.isPersonalQuery(lowerQuery)) {
      return {
        intent: { primary: 'personal', confidence: 0.9 },
        entities: this.extractEntities(query),
        complexity: 'simple',
        queryType: 'personal',
        requiresPersonalContext: true,
        requiresCurrentInfo: false,
        requiresVerification: false,
        confidence: 0.9,
        suggestedStrategy: 'memory_priority',
      };
    }

    // Detect temporal queries
    if (this.isTemporalQuery(lowerQuery)) {
      return {
        intent: { primary: 'temporal', confidence: 0.9 },
        entities: this.extractEntities(query),
        temporalContext: this.extractTemporalContext(lowerQuery),
        complexity: 'medium',
        queryType: 'temporal',
        requiresPersonalContext: false,
        requiresCurrentInfo: true,
        requiresVerification: true,
        confidence: 0.9,
        suggestedStrategy: 'recency_weighted',
      };
    }

    // Detect comparative queries
    if (this.isComparativeQuery(lowerQuery)) {
      return {
        intent: { primary: 'comparative', confidence: 0.85 },
        entities: this.extractEntities(query),
        complexity: 'complex',
        queryType: 'comparative',
        requiresPersonalContext: false,
        requiresCurrentInfo: true,
        requiresVerification: true,
        confidence: 0.85,
        suggestedStrategy: 'comprehensive',
      };
    }

    // Detect vague queries
    if (this.isVagueQuery(lowerQuery)) {
      return {
        intent: { primary: 'personal', confidence: 0.6 },
        entities: this.extractEntities(query),
        complexity: 'complex',
        queryType: 'vague',
        requiresPersonalContext: true,
        requiresCurrentInfo: false,
        requiresVerification: false,
        confidence: 0.6,
        suggestedStrategy: 'agentic_synthesis',
      };
    }

    // Default: factual
    return {
      intent: { primary: 'factual', confidence: 0.7 },
      entities: this.extractEntities(query),
      complexity: this.assessComplexity(query),
      queryType: 'factual',
      requiresPersonalContext: false,
      requiresCurrentInfo: true,
      requiresVerification: true,
      confidence: 0.7,
      suggestedStrategy: 'weighted',
    };
  }

  /**
   * LLM-based analysis for ambiguous queries
   */
  private async llmAnalyze(query: string, fallback: QueryAnalysis): Promise<QueryAnalysis> {
    try {
      const response = await this.openai.chat.completions.create({
        model: config.queryExpansionModel,
        messages: [
          {
            role: 'system',
            content: 'Analyze this query and determine: intent (personal/factual/conceptual/comparative/temporal), complexity (simple/medium/complex), and requirements.',
          },
          {
            role: 'user',
            content: `Query: "${query}"\n\nReturn JSON with: intent, complexity, requiresPersonalContext (bool), requiresCurrentInfo (bool), requiresVerification (bool)`,
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
      });

      const analysis = JSON.parse(response.choices[0].message.content || '{}');

      return {
        intent: { primary: analysis.intent || fallback.intent.primary, confidence: 0.8 },
        entities: fallback.entities,
        complexity: analysis.complexity || fallback.complexity,
        queryType: analysis.intent || fallback.queryType,
        requiresPersonalContext: analysis.requiresPersonalContext ?? fallback.requiresPersonalContext,
        requiresCurrentInfo: analysis.requiresCurrentInfo ?? fallback.requiresCurrentInfo,
        requiresVerification: analysis.requiresVerification ?? fallback.requiresVerification,
        confidence: 0.8,
        suggestedStrategy: this.mapStrategy(analysis.intent, analysis.complexity),
      };
    } catch (error) {
      logger.error({ error }, 'LLM analysis failed');
      return fallback;
    }
  }

  /**
   * Fallback analysis
   */
  private fallbackAnalyze(_query: string): QueryAnalysis {
    return {
      intent: { primary: 'factual', confidence: 0.5 },
      entities: [],
      complexity: 'medium',
      queryType: 'factual',
      requiresPersonalContext: false,
      requiresCurrentInfo: true,
      requiresVerification: true,
      confidence: 0.5,
      suggestedStrategy: 'weighted',
    };
  }

  /**
   * Helper: Check if personal query
   */
  private isPersonalQuery(query: string): boolean {
    const patterns = ['what did i', 'what did we', 'my preference', 'i prefer', 'i like', 'remember'];
    return patterns.some(pattern => query.includes(pattern));
  }

  /**
   * Helper: Check if temporal query
   */
  private isTemporalQuery(query: string): boolean {
    const patterns = ['when', 'date', 'recent', 'latest', 'current', 'today', 'yesterday', 'week ago'];
    return patterns.some(pattern => query.includes(pattern));
  }

  /**
   * Helper: Check if comparative query
   */
  private isComparativeQuery(query: string): boolean {
    const patterns = ['vs', 'versus', 'compare', 'difference', 'better', 'best', 'which'];
    return patterns.some(pattern => query.includes(pattern));
  }

  /**
   * Helper: Check if vague query
   */
  private isVagueQuery(query: string): boolean {
    const vagueTerms = ['that', 'thing', 'stuff', 'what', 'how'];
    const vagueCount = vagueTerms.reduce((count, term) => count + (query.includes(term) ? 1 : 0), 0);
    return vagueCount >= 2 || query.length < 10;
  }

  /**
   * Helper: Extract entities
   */
  private extractEntities(query: string): string[] {
    // Basic entity extraction - can be enhanced with NER
    const words = query.split(/\s+/);
    return words.filter(word => word.length > 3 && /^[A-Z]/.test(word));
  }

  /**
   * Helper: Extract temporal context
   */
  private extractTemporalContext(query: string): TemporalContext | undefined {
    if (query.includes('today')) {
      return { hasDate: true, relativeTime: 'today' };
    }
    if (query.includes('yesterday')) {
      return { hasDate: true, relativeTime: 'yesterday' };
    }
    if (query.includes('last week')) {
      return { hasDate: true, relativeTime: 'last_week' };
    }
    if (query.includes('last month')) {
      return { hasDate: true, relativeTime: 'last_month' };
    }
    if (query.includes('this year')) {
      return { hasDate: true, relativeTime: 'this_year' };
    }

    // Date pattern matching
    const datePattern = /\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4}/;
    if (datePattern.test(query)) {
      return { hasDate: true };
    }

    return undefined;
  }

  /**
   * Helper: Assess complexity
   */
  private assessComplexity(query: string): 'simple' | 'medium' | 'complex' {
    const length = query.length;
    const wordCount = query.split(/\s+/).length;
    const questionWords = ['what', 'when', 'where', 'why', 'how', 'which', 'who'].reduce(
      (count, word) => count + (query.toLowerCase().includes(word) ? 1 : 0), 0
    );

    if (length < 30 && wordCount < 5 && questionWords === 1) return 'simple';
    if (questionWords > 2 || wordCount > 15) return 'complex';
    return 'medium';
  }

  /**
   * Helper: Map to strategy
   */
  private mapStrategy(intent: string, complexity: string): string {
    if (intent === 'personal') return 'memory_priority';
    if (intent === 'temporal') return 'recency_weighted';
    if (intent === 'comparative') return 'comprehensive';
    if (complexity === 'complex') return 'agentic_synthesis';
    return 'weighted';
  }
}

