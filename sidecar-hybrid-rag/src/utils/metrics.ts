/**
 * Metrics Collection
 */

import { logger } from './logger.js';

interface Metric {
  name: string;
  value: number;
  tags?: Record<string, string>;
  timestamp: number;
}

class MetricsCollector {
  private metrics: Metric[] = [];
  private maxMetrics = 1000;

  /**
   * Record a metric
   */
  record(name: string, value: number, tags?: Record<string, string>): void {
    this.metrics.push({
      name,
      value,
      tags,
      timestamp: Date.now(),
    });

    // Keep only recent metrics
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(-this.maxMetrics);
    }
  }

  /**
   * Get metrics summary
   */
  getSummary(): Record<string, any> {
    const summary: Record<string, {
      count: number;
      sum: number;
      avg: number;
      min: number;
      max: number;
    }> = {};

    for (const metric of this.metrics) {
      if (!summary[metric.name]) {
        summary[metric.name] = {
          count: 0,
          sum: 0,
          avg: 0,
          min: Infinity,
          max: -Infinity,
        };
      }

      const stat = summary[metric.name];
      stat.count++;
      stat.sum += metric.value;
      stat.min = Math.min(stat.min, metric.value);
      stat.max = Math.max(stat.max, metric.value);
      stat.avg = stat.sum / stat.count;
    }

    return summary;
  }

  /**
   * Clear metrics
   */
  clear(): void {
    this.metrics = [];
  }

  /**
   * Get recent metrics
   */
  getRecent(limit: number = 100): Metric[] {
    return this.metrics.slice(-limit);
  }
}

export const metrics = new MetricsCollector();

/**
 * Middleware to track request metrics
 */
export function trackMetrics(name: string, fn: () => Promise<any>): Promise<any> {
  const start = Date.now();
  
  return fn()
    .then(result => {
      const duration = Date.now() - start;
      metrics.record(name, duration, { status: 'success' });
      return result;
    })
    .catch(error => {
      const duration = Date.now() - start;
      metrics.record(name, duration, { status: 'error' });
      logger.error({ error, metric: name }, 'Metric tracking error');
      throw error;
    });
}

