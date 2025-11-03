/**
 * Intelligent Model Router - Advanced model routing with cost optimization
 * 
 * Features:
 * - Model capability tracking (tokens, context, cost)
 * - Smart routing based on complexity, cost, and requirements
 * - Budget-aware model selection
 * - Fallback sequence generation
 * - Quality-cost trade-off analysis
 */

import { logger } from './log.js';

export interface ModelCapabilities {
  maxTokens: number;
  contextWindow: number;
  costPer1kTokens: {
    input: number;
    output: number;
  };
  strengths: string[];
  latencyMs: number;
  qualityScore: number;
}

export interface RoutingDecision {
  selectedModel: string;
  reasoning: string;
  estimatedCost: number;
  estimatedLatency: number;
  fallbackModels: string[];
  confidence: number;
  provider: string;
}

export interface RoutingRequest {
  message: string;
  conversationHistory?: Array<{ role: string; content: string }>;
  ragContext?: any[];
  requiresWebSearch?: boolean;
  latencyRequirement?: 'low' | 'normal' | 'high';
  budgetConstraint?: 'strict' | 'normal' | 'flexible';
  userTier?: 'free' | 'standard' | 'premium';
  estimatedTokens?: number;
}

interface RequestAnalysis {
  estimatedTokens: number;
  complexity: 'simple' | 'medium' | 'high';
  taskType: string;
  latencyRequirement: string;
  budgetConstraint: string;
  userTier: string;
  hasRAGContext: boolean;
  hasWebSearch: boolean;
  conversationLength: number;
}

interface RoutingRule {
  condition: (analysis: RequestAnalysis) => boolean;
  model: string;
  provider: string;
  reasoning: string;
  priority: number;
}

export class IntelligentModelRouter {
  private modelCapabilities: Record<string, ModelCapabilities> = {
    'claude-3-haiku-20240307': {
      maxTokens: 4096,
      contextWindow: 200000,
      costPer1kTokens: { input: 0.00025, output: 0.00125 },
      strengths: ['speed', 'cost-efficiency', 'simple-tasks'],
      latencyMs: 800,
      qualityScore: 7.5
    },
    'claude-3-5-sonnet-20241022': {
      maxTokens: 8192,
      contextWindow: 200000,
      costPer1kTokens: { input: 0.003, output: 0.015 },
      strengths: ['reasoning', 'analysis', 'conversation', 'coding'],
      latencyMs: 1500,
      qualityScore: 9.2
    },
    'gpt-4o-mini': {
      maxTokens: 16384,
      contextWindow: 128000,
      costPer1kTokens: { input: 0.00015, output: 0.0006 },
      strengths: ['cost-efficiency', 'function-calling', 'speed'],
      latencyMs: 1200,
      qualityScore: 8.1
    },
    'gemini-2.0-flash-exp': {
      maxTokens: 8192,
      contextWindow: 1000000,
      costPer1kTokens: { input: 0.000075, output: 0.0003 },
      strengths: ['large-context', 'multimodal', 'cost-efficiency'],
      latencyMs: 1000,
      qualityScore: 8.7
    }
  };

  private routingRules: RoutingRule[] = [
    {
      condition: (req) => req.estimatedTokens > 100000,
      model: 'gemini-2.0-flash-exp',
      provider: 'google',
      reasoning: 'Large context requires Gemini\'s 1M token window',
      priority: 1
    },
    {
      condition: (req) => req.complexity === 'simple' && req.budgetConstraint === 'strict',
      model: 'gpt-4o-mini',
      provider: 'openai',
      reasoning: 'Simple task with budget constraint - most cost-effective',
      priority: 2
    },
    {
      condition: (req) => req.taskType === 'reasoning' || req.taskType === 'analysis',
      model: 'claude-3-5-sonnet-20241022',
      provider: 'anthropic',
      reasoning: 'Complex reasoning task requires Sonnet\'s capabilities',
      priority: 3
    },
    {
      condition: (req) => req.latencyRequirement === 'low' && req.complexity !== 'high',
      model: 'claude-3-haiku-20240307',
      provider: 'anthropic',
      reasoning: 'Speed prioritized for non-complex task',
      priority: 4
    }
  ];

  async routeRequest(request: RoutingRequest): Promise<RoutingDecision> {
    const analysis = await this.analyzeRequest(request);
    
    // Apply routing rules
    const applicableRules = this.routingRules
      .filter(rule => rule.condition(analysis))
      .sort((a, b) => a.priority - b.priority);

    let selectedModel: string;
    let selectedProvider: string;
    let reasoning: string;

    if (applicableRules.length > 0) {
      selectedModel = applicableRules[0].model;
      selectedProvider = applicableRules[0].provider;
      reasoning = applicableRules[0].reasoning;
    } else {
      // Fallback to cost-benefit analysis
      const costBenefitChoice = this.performCostBenefitAnalysis(analysis);
      selectedModel = costBenefitChoice.model;
      selectedProvider = costBenefitChoice.provider;
      reasoning = costBenefitChoice.reasoning;
    }

    // Validate model availability and load
    const validatedModel = await this.validateAndAdjust(selectedModel, analysis);
    const validatedProvider = this.getProviderForModel(validatedModel);
    
    return {
      selectedModel: validatedModel,
      provider: validatedProvider,
      reasoning,
      estimatedCost: this.estimateCost(validatedModel, analysis.estimatedTokens),
      estimatedLatency: this.estimateLatency(validatedModel, analysis),
      fallbackModels: this.generateFallbackSequence(validatedModel, analysis),
      confidence: this.calculateConfidence(validatedModel, analysis)
    };
  }

  private async analyzeRequest(request: RoutingRequest): Promise<RequestAnalysis> {
    return {
      estimatedTokens: request.estimatedTokens || this.estimateTokens(request),
      complexity: this.assessComplexity(request),
      taskType: this.identifyTaskType(request),
      latencyRequirement: request.latencyRequirement || 'normal',
      budgetConstraint: request.budgetConstraint || 'normal',
      userTier: request.userTier || 'standard',
      hasRAGContext: !!(request.ragContext && request.ragContext.length > 0),
      hasWebSearch: request.requiresWebSearch || false,
      conversationLength: request.conversationHistory?.length || 0
    };
  }

  private estimateTokens(request: RoutingRequest): number {
    // Rough estimate: 1 token ≈ 4 characters
    let tokens = Math.ceil(request.message.length / 4);
    
    // Add context tokens
    if (request.conversationHistory) {
      const contextChars = request.conversationHistory.reduce(
        (sum, msg) => sum + msg.content.length, 0
      );
      tokens += Math.ceil(contextChars / 4);
    }
    
    if (request.ragContext && request.ragContext.length > 0) {
      // Assume 500 tokens per RAG context item
      tokens += request.ragContext.length * 500;
    }
    
    return tokens;
  }

  private assessComplexity(request: RoutingRequest): 'simple' | 'medium' | 'high' {
    let complexityScore = 0;

    // Message length
    if (request.message.length > 1000) complexityScore += 2;
    else if (request.message.length > 500) complexityScore += 1;

    // Keywords indicating complexity
    const complexKeywords = [
      'analyze', 'compare', 'evaluate', 'research', 'comprehensive',
      'detailed', 'complex', 'multi-step', 'reasoning', 'logic'
    ];
    
    const simpleKeywords = [
      'what is', 'define', 'simple', 'quick', 'brief', 'summary'
    ];

    const lowerMessage = request.message.toLowerCase();
    complexKeywords.forEach(keyword => {
      if (lowerMessage.includes(keyword)) complexityScore += 1;
    });

    simpleKeywords.forEach(keyword => {
      if (lowerMessage.includes(keyword)) complexityScore -= 1;
    });

    // Context size
    if (request.ragContext && request.ragContext.length > 10) complexityScore += 2;
    if (request.conversationHistory && request.conversationHistory.length > 20) complexityScore += 1;

    if (complexityScore >= 4) return 'high';
    if (complexityScore >= 2) return 'medium';
    return 'simple';
  }

  private identifyTaskType(request: RoutingRequest): string {
    const lowerMessage = request.message.toLowerCase();
    
    if (lowerMessage.includes('code') || lowerMessage.includes('program')) return 'coding';
    if (lowerMessage.includes('write') || lowerMessage.includes('generate')) return 'generation';
    if (lowerMessage.includes('explain') || lowerMessage.includes('analyze')) return 'analysis';
    if (lowerMessage.includes('what') || lowerMessage.includes('define')) return 'knowledge';
    if (lowerMessage.includes('chat') || lowerMessage.includes('converse')) return 'conversation';
    
    return 'general';
  }

  private performCostBenefitAnalysis(analysis: RequestAnalysis): { model: string; provider: string; reasoning: string } {
    const scores = Object.entries(this.modelCapabilities).map(([model, caps]) => {
      let score = 0;
      
      // Quality weight (40%)
      score += (caps.qualityScore / 10) * 40;
      
      // Cost efficiency weight (30%)
      const cost = this.estimateCost(model, analysis.estimatedTokens);
      const costEfficiency = 1 / (cost + 0.001); // Prevent division by zero
      score += Math.min(costEfficiency * 10, 30); // Cap at 30 points
      
      // Speed weight (20%)
      const speedScore = Math.max(0, 20 - (caps.latencyMs / 100));
      score += speedScore;
      
      // Capability match weight (10%)
      const capabilityMatch = this.calculateCapabilityMatch(caps.strengths, analysis);
      score += capabilityMatch * 10;

      return { model, provider: this.getProviderForModel(model), score, cost };
    });

    const best = scores.reduce((a, b) => a.score > b.score ? a : b);
    
    return {
      model: best.model,
      provider: best.provider,
      reasoning: `Cost-benefit analysis: ${best.score.toFixed(1)} score, $${best.cost.toFixed(4)} estimated cost`
    };
  }

  private calculateCapabilityMatch(strengths: string[], analysis: RequestAnalysis): number {
    const relevantStrengths = new Set<string>();
    
    if (analysis.complexity === 'high') relevantStrengths.add('reasoning');
    if (analysis.latencyRequirement === 'low') relevantStrengths.add('speed');
    if (analysis.budgetConstraint === 'strict') relevantStrengths.add('cost-efficiency');
    if (analysis.estimatedTokens > 50000) relevantStrengths.add('large-context');
    if (analysis.taskType === 'coding') relevantStrengths.add('coding');

    const matches = strengths.filter(s => relevantStrengths.has(s)).length;
    return matches / Math.max(relevantStrengths.size, 1);
  }

  private getProviderForModel(model: string): string {
    const modelMapping: Record<string, string> = {
      'claude-3-haiku-20240307': 'anthropic',
      'claude-3-5-sonnet-20241022': 'anthropic',
      'gpt-4o-mini': 'openai',
      'gemini-2.0-flash-exp': 'google'
    };
    
    return modelMapping[model] || 'anthropic';
  }

  private estimateCost(model: string, tokens: number): number {
    const caps = this.modelCapabilities[model];
    if (!caps) return 0;
    
    // Rough estimate: assume 70% input, 30% output
    const inputCost = (tokens * 0.7 / 1000) * caps.costPer1kTokens.input;
    const outputCost = (tokens * 0.3 / 1000) * caps.costPer1kTokens.output;
    
    return inputCost + outputCost;
  }

  private estimateLatency(model: string, analysis: RequestAnalysis): number {
    const caps = this.modelCapabilities[model];
    if (!caps) return 2000;
    
    // Base latency + overhead based on tokens
    const baseLatency = caps.latencyMs;
    const tokenOverhead = Math.ceil(analysis.estimatedTokens / 1000) * 50;
    
    return baseLatency + tokenOverhead;
  }

  private calculateConfidence(model: string, analysis: RequestAnalysis): number {
    const caps = this.modelCapabilities[model];
    if (!caps) return 0.5;
    
    // High confidence if:
    // 1. Model is a good fit for the task
    const capabilityMatch = this.calculateCapabilityMatch(caps.strengths, analysis);
    
    // 2. Context fits within limits
    const contextFit = analysis.estimatedTokens <= caps.contextWindow ? 1 : 0.5;
    
    return (capabilityMatch * 0.7 + contextFit * 0.3);
  }

  async validateAndAdjust(selectedModel: string, analysis: RequestAnalysis): Promise<string> {
    // Check if model can handle the token requirements
    const caps = this.modelCapabilities[selectedModel];
    if (caps && analysis.estimatedTokens > caps.contextWindow) {
      // Find model with larger context window
      const largerContextModels = Object.entries(this.modelCapabilities)
        .filter(([_, c]) => c.contextWindow > analysis.estimatedTokens)
        .sort((a, b) => b[1].contextWindow - a[1].contextWindow);
      
      if (largerContextModels.length > 0) {
        logger.debug({ 
          original: selectedModel, 
          adjusted: largerContextModels[0][0],
          tokens: analysis.estimatedTokens 
        }, 'Model adjusted for large context');
        return largerContextModels[0][0];
      }
    }

    // Check model availability/health
    const isHealthy = await this.checkModelHealth(selectedModel);
    if (!isHealthy) {
      const fallbacks = this.generateFallbackSequence(selectedModel, analysis);
      if (fallbacks.length > 0) {
        logger.debug({ 
          original: selectedModel, 
          fallback: fallbacks[0] 
        }, 'Model fallback due to health check');
        return fallbacks[0];
      }
    }

    return selectedModel;
  }

  private async checkModelHealth(model: string): Promise<boolean> {
    // For now, assume all models are healthy
    // TODO: Add real health checks (ping, recent errors, etc.)
    return true;
  }

  private generateFallbackSequence(primaryModel: string, analysis: RequestAnalysis): string[] {
    const allModels = Object.keys(this.modelCapabilities);
    const fallbacks = allModels
      .filter(m => m !== primaryModel)
      .filter(m => {
        const caps = this.modelCapabilities[m];
        return caps && caps.contextWindow >= analysis.estimatedTokens;
      })
      .sort((a, b) => {
        // Sort by quality score descending
        const capsA = this.modelCapabilities[a];
        const capsB = this.modelCapabilities[b];
        if (!capsA || !capsB) return 0;
        return capsB.qualityScore - capsA.qualityScore;
      });

    return fallbacks.slice(0, 2); // Return top 2 fallbacks
  }
}

