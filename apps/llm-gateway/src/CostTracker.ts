/**
 * Cost Tracker - Comprehensive cost tracking and budget management
 * 
 * Features:
 * - Real-time usage tracking
 * - Daily/monthly cost aggregation
 * - Budget alerts and enforcement
 * - Cost optimization recommendations
 * - User-level and model-level analytics
 */

import { logger } from './log.js';
import { getDatabase } from './database.js';

export interface UsageData {
  userId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  timestamp: Date;
}

export interface CostData {
  inputCost: number;
  outputCost: number;
  total: number;
  model: string;
  timestamp: Date;
}

export interface BudgetStatus {
  status: 'healthy' | 'warning' | 'critical' | 'exceeded' | 'no-budget';
  remainingBudget: number;
  utilizationPercent: number;
  currentSpend?: number;
  monthlyLimit?: number;
}

export interface CostReport {
  timeframe: string;
  startDate: Date;
  endDate: Date;
  totalCost: number;
  requestCount: number;
  modelBreakdown: Record<string, number>;
  topUsers: Array<{ userId: string; cost: number }>;
  recommendations: string[];
}

export interface DailyCostData {
  totalCost: number;
  requestCount: number;
  modelUsage: Record<string, number>;
  userCosts: Record<string, number>;
}

interface UserBudget {
  userId: string;
  monthlyLimit: number;
  tier: 'free' | 'standard' | 'premium';
}

export class CostTracker {
  private modelRates = {
    'claude-3-haiku-20240307': { input: 0.00025, output: 0.00125 },
    'claude-3-5-sonnet-20241022': { input: 0.003, output: 0.015 },
    'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
    'gemini-2.0-flash-exp': { input: 0.000075, output: 0.0003 },
    'gemini-2.5-flash': { input: 0.0001, output: 0.0004 }
  };

  private userBudgets: Map<string, UserBudget> = new Map();

  constructor() {
    this.initializeBudgets();
  }

  /**
   * Initialize default budgets based on user tiers
   */
  private initializeBudgets(): void {
    // Set default budgets based on tier
    // In production, this would load from database
    this.userBudgets.set('free', { userId: 'free', monthlyLimit: 10, tier: 'free' });
    this.userBudgets.set('standard', { userId: 'standard', monthlyLimit: 100, tier: 'standard' });
    this.userBudgets.set('premium', { userId: 'premium', monthlyLimit: 1000, tier: 'premium' });
  }

  /**
   * Track usage and calculate cost
   */
  async trackUsage(usage: UsageData): Promise<CostData> {
    const cost = this.calculateCost(usage);
    
    // Store in database
    try {
      const db = getDatabase();
      const stmt = db.prepare(`
        INSERT INTO cost_tracking 
        (user_id, model, input_tokens, output_tokens, input_cost, output_cost, total_cost, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      stmt.run(
        usage.userId,
        usage.model,
        usage.inputTokens,
        usage.outputTokens,
        cost.inputCost,
        cost.outputCost,
        cost.total,
        Math.floor(usage.timestamp.getTime() / 1000)
      );
    } catch (error) {
      logger.error({ error, userId: usage.userId }, 'Failed to track usage in database');
    }
    
    // Check budget alerts
    await this.checkBudgetAlerts(usage.userId, cost.total);
    
    logger.debug({ 
      userId: usage.userId, 
      model: usage.model, 
      cost: cost.total 
    }, 'Usage tracked');
    
    return cost;
  }

  /**
   * Calculate cost based on usage
   */
  private calculateCost(usage: UsageData): CostData {
    // Try to find exact match first
    let rates = this.modelRates[usage.model as keyof typeof this.modelRates];
    
    // If no exact match, try to infer from model name
    if (!rates) {
      if (usage.model.includes('gemini') || usage.model.includes('google')) {
        rates = this.modelRates['gemini-2.5-flash']; // Default to gemini-2.5-flash rates
      } else if (usage.model.includes('gpt') || usage.model.includes('openai')) {
        rates = this.modelRates['gpt-4o-mini']; // Default to gpt-4o-mini rates
      } else if (usage.model.includes('claude') || usage.model.includes('anthropic')) {
        rates = this.modelRates['claude-3-haiku-20240307']; // Default to haiku rates
      } else {
        // Ultimate fallback
        rates = this.modelRates['gpt-4o-mini'];
      }
    }
    
    const inputCost = (usage.inputTokens / 1000) * rates.input;
    const outputCost = (usage.outputTokens / 1000) * rates.output;
    const total = inputCost + outputCost;

    return {
      inputCost,
      outputCost,
      total,
      model: usage.model,
      timestamp: usage.timestamp
    };
  }

  /**
   * Get budget status for a user
   */
  async getBudgetStatus(userId: string, tier?: 'free' | 'standard' | 'premium'): Promise<BudgetStatus> {
    const tierBudget = tier || 'standard';
    const budget = this.userBudgets.get(tierBudget);
    
    if (!budget) {
      return { status: 'no-budget', remainingBudget: 0, utilizationPercent: 0 };
    }

    const currentSpend = await this.getCurrentMonthSpend(userId);
    const utilizationPercent = (currentSpend / budget.monthlyLimit) * 100;

    let status: 'healthy' | 'warning' | 'critical' | 'exceeded' = 'healthy';
    if (utilizationPercent >= 100) status = 'exceeded';
    else if (utilizationPercent >= 90) status = 'critical';
    else if (utilizationPercent >= 75) status = 'warning';

    return {
      status,
      remainingBudget: Math.max(0, budget.monthlyLimit - currentSpend),
      utilizationPercent,
      currentSpend,
      monthlyLimit: budget.monthlyLimit
    };
  }

  /**
   * Get current month spending for a user
   */
  private async getCurrentMonthSpend(userId: string): Promise<number> {
    try {
      const db = getDatabase();
      const now = new Date();
      const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const startTimestamp = Math.floor(firstDayOfMonth.getTime() / 1000);

      const result = db.prepare(`
        SELECT SUM(total_cost) as total
        FROM cost_tracking
        WHERE user_id = ? AND timestamp >= ?
      `).get(userId, startTimestamp) as { total: number | null };

      return result.total || 0;
    } catch (error) {
      logger.error({ error, userId }, 'Failed to get current month spend');
      return 0;
    }
  }

  /**
   * Check and alert on budget thresholds
   */
  private async checkBudgetAlerts(userId: string, cost: number): Promise<void> {
    const budgetStatus = await this.getBudgetStatus(userId);
    
    if (budgetStatus.status === 'critical' || budgetStatus.status === 'exceeded') {
      logger.warn({
        userId,
        status: budgetStatus.status,
        utilization: budgetStatus.utilizationPercent,
        remaining: budgetStatus.remainingBudget
      }, 'Budget alert triggered');
      
      // TODO: Send notifications (email, webhook, etc.)
    }
  }

  /**
   * Generate cost report for a timeframe
   */
  async generateCostReport(timeframe: 'daily' | 'weekly' | 'monthly' = 'daily'): Promise<CostReport> {
    try {
      const db = getDatabase();
      const endDate = new Date();
      const startDate = new Date();
      
      switch (timeframe) {
        case 'weekly':
          startDate.setDate(endDate.getDate() - 7);
          break;
        case 'monthly':
          startDate.setMonth(endDate.getMonth() - 1);
          break;
        default:
          startDate.setDate(endDate.getDate() - 1);
      }

      const startTimestamp = Math.floor(startDate.getTime() / 1000);
      const endTimestamp = Math.floor(endDate.getTime() / 1000);

      // Get aggregated data
      const data = db.prepare(`
        SELECT 
          SUM(total_cost) as total_cost,
          COUNT(*) as request_count,
          model,
          SUM(total_cost) as model_cost
        FROM cost_tracking
        WHERE timestamp >= ? AND timestamp <= ?
        GROUP BY model
      `).all(startTimestamp, endTimestamp) as Array<{
        total_cost: number;
        request_count: number;
        model: string;
        model_cost: number;
      }>;

      // Calculate totals
      const totalCost = data.reduce((sum, row) => sum + (row.total_cost || 0), 0);
      const requestCount = data.reduce((sum, row) => sum + (row.request_count || 0), 0);
      
      // Build model breakdown
      const modelBreakdown: Record<string, number> = {};
      data.forEach(row => {
        if (row.model && row.model_cost) {
          modelBreakdown[row.model] = row.model_cost;
        }
      });

      // Get top users
      const topUsersData = db.prepare(`
        SELECT user_id, SUM(total_cost) as cost
        FROM cost_tracking
        WHERE timestamp >= ? AND timestamp <= ?
        GROUP BY user_id
        ORDER BY cost DESC
        LIMIT 5
      `).all(startTimestamp, endTimestamp) as Array<{ user_id: string; cost: number }>;

      const topUsers = topUsersData.map(row => ({
        userId: row.user_id,
        cost: row.cost || 0
      }));

      // Generate recommendations
      const recommendations = this.generateCostRecommendations({
        totalCost,
        requestCount,
        modelBreakdown
      });

      return {
        timeframe,
        startDate,
        endDate,
        totalCost,
        requestCount,
        modelBreakdown,
        topUsers,
        recommendations
      };
    } catch (error) {
      logger.error({ error, timeframe }, 'Failed to generate cost report');
      return {
        timeframe,
        startDate: new Date(),
        endDate: new Date(),
        totalCost: 0,
        requestCount: 0,
        modelBreakdown: {},
        topUsers: [],
        recommendations: []
      };
    }
  }

  /**
   * Generate cost optimization recommendations
   */
  private generateCostRecommendations(report: {
    totalCost: number;
    requestCount: number;
    modelBreakdown: Record<string, number>;
  }): string[] {
    const recommendations: string[] = [];
    
    // High-cost model usage
    const sortedModels = Object.entries(report.modelBreakdown)
      .sort(([,a], [,b]) => b - a);
    
    if (sortedModels.length > 0) {
      const [topModel, topCost] = sortedModels[0];
      const totalCost = report.totalCost;
      
      if (totalCost > 0 && topCost / totalCost > 0.6 && topModel.includes('sonnet')) {
        recommendations.push(
          `${topModel} accounts for ${((topCost/totalCost)*100).toFixed(1)}% of costs. Consider routing simpler queries to more cost-effective models.`
        );
      }
    }

    // High request volume
    const avgCostPerRequest = report.totalCost / (report.requestCount || 1);
    if (avgCostPerRequest > 0.01) {
      recommendations.push(
        `Average cost per request is $${avgCostPerRequest.toFixed(4)}. Consider implementing more aggressive caching.`
      );
    }

    // Low request volume but high cost
    if (report.requestCount < 100 && report.totalCost > 10) {
      recommendations.push(
        `High cost despite low volume ($${report.totalCost.toFixed(2)} for ${report.requestCount} requests). Review model selection strategy.`
      );
    }

    return recommendations;
  }
}

