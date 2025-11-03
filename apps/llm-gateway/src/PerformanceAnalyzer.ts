/**
 * Performance Analyzer - Generates optimization recommendations based on metrics
 * 
 * Analyzes system performance and provides actionable recommendations
 */

import { metrics } from './metrics.js';
import { logger } from './log.js';
import type { IntelligentCache } from './IntelligentCache.js';

export interface Recommendation {
  type: 'performance' | 'caching' | 'model-optimization' | 'system-health';
  severity: 'high' | 'medium' | 'low';
  message: string;
  action: string;
  currentValue?: number;
  targetValue?: number;
}

export interface PerformanceReport {
  overview: {
    totalRequests: number;
    averageLatency: number;
    cacheHitRate: number;
    errorRate: number;
    p95Latency: number;
  };
  modelPerformance: Record<string, {
    requests: number;
    averageLatency: number;
    errors: number;
    cacheHits: number;
  }>;
  recommendations: Recommendation[];
}

export class PerformanceAnalyzer {
  constructor(private cache?: IntelligentCache) {}

  /**
   * Generate comprehensive performance report
   */
  generateReport(): PerformanceReport {
    const allMetrics = metrics.getAll();
    
    // Calculate overview metrics
    const requestLatency = allMetrics.request_latency;
    const overview = {
      totalRequests: requestLatency?.count || 0,
      averageLatency: requestLatency ? requestLatency.sum / requestLatency.count : 0,
      cacheHitRate: this.getCacheHitRate(),
      errorRate: 0, // TODO: track errors
      p95Latency: this.calculatePercentile('request_latency', 95),
    };

    // Calculate model performance
    const modelPerformance = this.calculateModelPerformance(allMetrics);

    // Generate recommendations
    const recommendations = this.generateRecommendations(overview, modelPerformance);

    return {
      overview,
      modelPerformance,
      recommendations,
    };
  }

  /**
   * Generate optimization recommendations
   */
  private generateRecommendations(
    overview: PerformanceReport['overview'],
    modelPerformance: PerformanceReport['modelPerformance']
  ): Recommendation[] {
    const recommendations: Recommendation[] = [];

    // High latency recommendation
    if (overview.averageLatency > 3000) {
      recommendations.push({
        type: 'performance',
        severity: 'medium',
        message: 'Average latency is high. Consider optimizing context gathering or upgrading models.',
        action: 'optimize-context-gathering',
        currentValue: overview.averageLatency,
        targetValue: 2000,
      });
    } else if (overview.averageLatency > 5000) {
      recommendations.push({
        type: 'performance',
        severity: 'high',
        message: 'Very high latency detected. System may be overwhelmed.',
        action: 'investigate-bottleneck',
        currentValue: overview.averageLatency,
        targetValue: 3000,
      });
    }

    // Low cache hit rate (only recommend if we have meaningful traffic)
    if (overview.totalRequests > 50 && overview.cacheHitRate < 0.4) {
      recommendations.push({
        type: 'caching',
        severity: 'low',
        message: 'Cache hit rate is low. Review caching strategy or increase TTL.',
        action: 'improve-caching',
        currentValue: overview.cacheHitRate,
        targetValue: 0.5,
      });
    } else if (overview.totalRequests > 50 && overview.cacheHitRate < 0.3) {
      recommendations.push({
        type: 'caching',
        severity: 'medium',
        message: 'Very low cache hit rate. Significant opportunity for optimization.',
        action: 'investigate-caching',
        currentValue: overview.cacheHitRate,
        targetValue: 0.4,
      });
    }

    // Model usage optimization
    const slowestModel = this.findSlowestModel(modelPerformance);
    if (slowestModel) {
      const modelData = modelPerformance[slowestModel];
      if (modelData.averageLatency > 3000 && modelData.requests > 100) {
        recommendations.push({
          type: 'model-optimization',
          severity: 'medium',
          message: `${slowestModel} has high latency. Consider routing simpler queries to faster models.`,
          action: 'optimize-model-routing',
          currentValue: modelData.averageLatency,
          targetValue: 2000,
        });
      }
    }

    // High error rate
    if (overview.errorRate > 0.05) {
      recommendations.push({
        type: 'system-health',
        severity: 'high',
        message: 'High error rate detected. System stability may be compromised.',
        action: 'investigate-errors',
        currentValue: overview.errorRate,
        targetValue: 0.01,
      });
    }

    return recommendations;
  }

  /**
   * Calculate model performance metrics
   */
  private calculateModelPerformance(allMetrics: Record<string, any>): Record<string, {
    requests: number;
    averageLatency: number;
    errors: number;
    cacheHits: number;
  }> {
    const modelPerformance: Record<string, any> = {};

    for (const [key, value] of Object.entries(allMetrics)) {
      // Look for model-specific metrics
      const match = key.match(/^model_([a-zA-Z0-9_-]+)_latency$/);
      if (match) {
        const model = match[1];
        modelPerformance[model] = {
          requests: value.count || 0,
          averageLatency: value.sum / value.count || 0,
          errors: 0, // TODO: track errors per model
          cacheHits: 0, // TODO: track cache hits per model
        };
      }
    }

    return modelPerformance;
  }

  /**
   * Get cache hit rate
   */
  private getCacheHitRate(): number {
    if (!this.cache) return 0;
    
    const stats = this.cache.getStats();
    return stats.hitRate;
  }

  /**
   * Calculate percentile from histogram
   */
  private calculatePercentile(metricName: string, percentile: number): number {
    const histogram = metrics.getHistogram(metricName);
    if (histogram.length === 0) return 0;
    
    const sorted = [...histogram].sort((a, b) => a - b);
    const index = Math.floor((percentile / 100) * (sorted.length - 1));
    return sorted[index] || 0;
  }

  /**
   * Find slowest model
   */
  private findSlowestModel(modelPerformance: Record<string, any>): string | null {
    let slowestModel: string | null = null;
    let slowestLatency = 0;

    for (const [model, data] of Object.entries(modelPerformance)) {
      if (data.averageLatency > slowestLatency && data.requests > 50) {
        slowestLatency = data.averageLatency;
        slowestModel = model;
      }
    }

    return slowestModel;
  }

  /**
   * Get system health status
   */
  getHealthStatus(): {
    status: 'healthy' | 'warning' | 'critical';
    issues: string[];
  } {
    const report = this.generateReport();
    const issues: string[] = [];

    // Check for critical issues
    if (report.overview.errorRate > 0.05) {
      issues.push('High error rate');
    }
    if (report.overview.averageLatency > 5000) {
      issues.push('Very high latency');
    }

    // Determine status
    let status: 'healthy' | 'warning' | 'critical' = 'healthy';
    if (issues.length > 0) {
      status = 'critical';
    } else {
      const warnings = report.recommendations.filter(r => r.severity === 'high' || r.severity === 'medium');
      if (warnings.length > 0) {
        status = 'warning';
      }
    }

    return { status, issues };
  }
}
