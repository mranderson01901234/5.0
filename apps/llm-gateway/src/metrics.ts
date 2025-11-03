interface MetricCounter {
  count: number;
  sum: number;
  min: number;
  max: number;
}

class MetricsCollector {
  private counters: Map<string, MetricCounter> = new Map();
  private histograms: Map<string, number[]> = new Map();

  record(name: string, value: number): void {
    const counter = this.counters.get(name) || { count: 0, sum: 0, min: Infinity, max: -Infinity };
    counter.count++;
    counter.sum += value;
    counter.min = Math.min(counter.min, value);
    counter.max = Math.max(counter.max, value);
    this.counters.set(name, counter);

    const hist = this.histograms.get(name) || [];
    hist.push(value);
    if (hist.length > 1000) {
      hist.shift();
    }
    this.histograms.set(name, hist);
  }

  get(name: string): MetricCounter | undefined {
    return this.counters.get(name);
  }

  getHistogram(name: string): number[] {
    return this.histograms.get(name) || [];
  }

  getAll(): Record<string, MetricCounter> {
    const result: Record<string, MetricCounter> = {};
    for (const [key, value] of this.counters.entries()) {
      result[key] = value;
    }
    return result;
  }

  percentile(histogram: number[], p: number): number {
    if (histogram.length === 0) return 0;
    const sorted = [...histogram].sort((a, b) => a - b);
    const index = Math.floor((p / 100) * (sorted.length - 1));
    return sorted[index] || 0;
  }
}

export const metrics = new MetricsCollector();

