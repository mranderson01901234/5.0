/**
 * Minimal in-process job queue with priorities
 * Write-behind batching with 250-500ms windows
 */

import { pino } from 'pino';

const logger = pino({ name: 'queue' });

export interface Job {
  id: string;
  type: 'audit' | 'write-batch' | 'research';
  priority: number; // Higher = more urgent
  payload: unknown;
  createdAt: number;
  attempts: number;
}

export type JobHandler = (job: Job) => Promise<void>;

const BATCH_WINDOW_MS = 300; // 300ms write-behind window
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

export class JobQueue {
  private jobs: Job[] = [];
  private handlers: Map<string, JobHandler> = new Map();
  private processing = false;
  private batchTimer: NodeJS.Timeout | null = null;
  private pendingBatch: Job[] = [];

  // Metrics
  private stats = {
    enqueued: 0,
    processed: 0,
    failed: 0,
    latencies: [] as number[],
  };

  /**
   * Register a handler for a job type
   */
  registerHandler(type: string, handler: JobHandler): void {
    this.handlers.set(type, handler);
    logger.info({ type });
  }

  /**
   * Enqueue a job
   */
  enqueue(job: Omit<Job, 'createdAt' | 'attempts'>): void {
    const fullJob: Job = {
      ...job,
      createdAt: Date.now(),
      attempts: 0,
    };

    // Write-batch jobs go into pending batch
    if (job.type === 'write-batch') {
      this.pendingBatch.push(fullJob);
      this.scheduleBatch();
    } else {
      // Audit and research jobs go straight to queue
      // Audit priority: 10, Research priority: 5, Write-batch: 0
      this.jobs.push(fullJob);
      this.jobs.sort((a, b) => b.priority - a.priority); // Sort by priority descending
    }

    this.stats.enqueued++;
    logger.debug({ type: job.type, priority: job.priority, queueSize: this.jobs.length });

    this.processNext();
  }

  /**
   * Schedule batch flush
   */
  private scheduleBatch(): void {
    if (this.batchTimer) return;

    this.batchTimer = setTimeout(() => {
      this.flushBatch();
    }, BATCH_WINDOW_MS);
  }

  /**
   * Flush pending batch
   */
  private flushBatch(): void {
    if (this.pendingBatch.length === 0) {
      this.batchTimer = null;
      return;
    }

    // Move batch to main queue
    logger.debug({ count: this.pendingBatch.length });
    this.jobs.push(...this.pendingBatch);
    this.jobs.sort((a, b) => b.priority - a.priority);
    this.pendingBatch = [];
    this.batchTimer = null;

    this.processNext();
  }

  /**
   * Process next job in queue
   */
  private async processNext(): Promise<void> {
    if (this.processing || this.jobs.length === 0) return;

    this.processing = true;
    const job = this.jobs.shift()!;

    const handler = this.handlers.get(job.type);
    if (!handler) {
      logger.error({ type: job.type }, 'No handler found for job type');
      this.processing = false;
      this.processNext();
      return;
    }

    const startTime = Date.now();

    try {
      await handler(job);

      const latency = Date.now() - startTime;
      this.stats.processed++;
      this.stats.latencies.push(latency);

      // Keep only last 1000 latencies
      if (this.stats.latencies.length > 1000) {
        this.stats.latencies = this.stats.latencies.slice(-1000);
      }

      logger.debug({ type: job.type, latency, id: job.id }, 'Job processed');
    } catch (error) {
      logger.error({ error, type: job.type, id: job.id }, 'Job processing failed');

      job.attempts++;
      if (job.attempts < MAX_RETRIES) {
        // Re-enqueue with delay
        setTimeout(() => {
          logger.info({ type: job.type, id: job.id, attempt: job.attempts + 1 });
          this.jobs.push(job);
          this.jobs.sort((a, b) => b.priority - a.priority);
          this.processNext();
        }, RETRY_DELAY_MS * job.attempts);
      } else {
        this.stats.failed++;
        logger.error({ error, type: job.type, id: job.id }, 'Job failed after max retries');
      }
    }

    this.processing = false;
    this.processNext();
  }

  /**
   * Get queue metrics
   */
  getMetrics() {
    const latencies = this.stats.latencies;
    const avgLatency = latencies.length > 0
      ? latencies.reduce((sum, l) => sum + l, 0) / latencies.length
      : 0;

    const p95Latency = latencies.length > 0
      ? latencies.sort((a, b) => a - b)[Math.floor(latencies.length * 0.95)] || 0
      : 0;

    return {
      enqueued: this.stats.enqueued,
      processed: this.stats.processed,
      failed: this.stats.failed,
      queueDepth: this.jobs.length + this.pendingBatch.length,
      avgLatencyMs: Math.round(avgLatency),
      p95LatencyMs: Math.round(p95Latency),
    };
  }

  /**
   * Force flush batch (for testing)
   */
  flush(): void {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.flushBatch();
    }
  }
}
