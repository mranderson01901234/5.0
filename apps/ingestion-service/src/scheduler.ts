/**
 * Ingestion Scheduler
 * Schedules hourly staggered execution of source ingestion jobs
 */

import { pino } from 'pino';
import type { IngestionDatabase } from './db.js';
import type { IngestionSource } from './config.js';
import { getEnabledSources } from './config.js';
import { processRSSFeed } from './processors/rss.js';
import { batchWriteItems, updateSourceStats } from './writers/batch.js';

const logger = pino({ name: 'ingestion-scheduler' });

interface SourceSchedule {
  source: IngestionSource;
  nextRunAt: number;
}

export class IngestionScheduler {
  private db: IngestionDatabase;
  private sources: Map<string, SourceSchedule> = new Map();
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(db: IngestionDatabase) {
    this.db = db;
  }

  /**
   * Initialize scheduler with enabled sources
   */
  initialize(): void {
    const enabledSources = getEnabledSources(this.db);
    
    const now = Date.now();
    for (const source of enabledSources) {
      // Stagger initial runs across first hour
      const staggerMinutes = Math.floor(Math.random() * 60);
      const nextRunAt = now + (staggerMinutes * 60 * 1000);

      this.sources.set(source.id, {
        source,
        nextRunAt,
      });

      logger.debug({
        source: source.id,
        nextRunAt: new Date(nextRunAt).toISOString(),
      }, 'Source scheduled');
    }

    logger.info({ count: enabledSources.length }, 'Scheduler initialized');
  }

  /**
   * Start hourly scheduler (checks every minute for ready sources)
   */
  start(): void {
    if (this.isRunning) {
      logger.warn('Scheduler already running');
      return;
    }

    this.isRunning = true;
    
    // Run immediately for sources that are ready
    this.processReadySources();

    // Then check every minute
    this.intervalId = setInterval(() => {
      this.processReadySources();
    }, 60 * 1000); // Every minute

    logger.info('Ingestion scheduler started');
  }

  /**
   * Stop scheduler
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    logger.info('Ingestion scheduler stopped');
  }

  /**
   * Process sources that are ready to run
   * Limits to 2 sources per minute to avoid load spikes
   */
  private async processReadySources(): Promise<void> {
    const now = Date.now();
    const ready = Array.from(this.sources.values())
      .filter(s => s.nextRunAt <= now && !this.isSourceRunning(s.source.id))
      .sort((a, b) => b.source.priority - a.source.priority) // Higher priority first
      .slice(0, 2); // Process max 2 per minute

    for (const schedule of ready) {
      // Process asynchronously (don't await)
      this.processSource(schedule.source).catch(error => {
        logger.error({ error: error.message, source: schedule.source.id }, 'Source processing error');
      });

      // Update next run time
      schedule.nextRunAt = now + (schedule.source.updateInterval * 60 * 1000);
      logger.debug({
        source: schedule.source.id,
        nextRunAt: new Date(schedule.nextRunAt).toISOString(),
      }, 'Source rescheduled');
    }
  }

  /**
   * Check if a source is currently being processed
   */
  private isSourceRunning(sourceId: string): boolean {
    // Could enhance with actual running state tracking
    // For now, simple check - could add a Set<string> for tracking
    return false;
  }

  /**
   * Process a single source
   */
  private async processSource(source: IngestionSource): Promise<void> {
    const jobId = `${source.id}-${Date.now()}`;
    const startTime = Date.now();

    logger.info({ source: source.id }, 'Starting source ingestion');

    // Create job record
    try {
      this.db.prepare(`
        INSERT INTO ingestion_jobs (id, source_type, source_identifier, status, started_at)
        VALUES (?, ?, ?, 'running', ?)
      `).run(jobId, source.type, source.url, startTime);
    } catch (error: any) {
      logger.warn({ error: error.message, source: source.id }, 'Failed to create job record');
    }

    try {
      // Get last fetch time
      const lastFetch = this.db.prepare(`
        SELECT last_fetch_at FROM sources WHERE id = ?
      `).get(source.id) as { last_fetch_at: number | null } | undefined;

      const lastFetchAt = lastFetch?.last_fetch_at || undefined;

      // Process RSS feed
      const result = await processRSSFeed(source, lastFetchAt);

      // Batch write items
      const writeResult = await batchWriteItems(this.db, result.items, 100);

      // Update source stats
      updateSourceStats(
        this.db,
        source.id,
        writeResult.ingested,
        writeResult.skipped,
        !result.error
      );

      // Update job record
      const completedAt = Date.now();
      const elapsed = completedAt - startTime;
      
      this.db.prepare(`
        UPDATE ingestion_jobs
        SET status = 'completed',
            completed_at = ?,
            items_ingested = ?,
            items_skipped = ?,
            last_success_at = ?
        WHERE id = ?
      `).run(
        completedAt,
        writeResult.ingested,
        writeResult.skipped,
        completedAt,
        jobId
      );

      logger.info({
        source: source.id,
        ingested: writeResult.ingested,
        skipped: writeResult.skipped,
        elapsed,
      }, 'Source ingestion complete');
    } catch (error: any) {
      logger.error({ error: error.message, source: source.id }, 'Source ingestion failed');

      // Update job record with error
      const completedAt = Date.now();
      try {
        this.db.prepare(`
          UPDATE ingestion_jobs
          SET status = 'failed',
              completed_at = ?,
              error = ?
          WHERE id = ?
        `).run(completedAt, error.message.substring(0, 500), jobId);
      } catch (updateError: any) {
        logger.warn({ error: updateError.message }, 'Failed to update job record');
      }

      // Update source failure count
      updateSourceStats(this.db, source.id, 0, 0, false);
    }
  }

  /**
   * Get scheduler statistics
   */
  getStats(): {
    sourceCount: number;
    nextRuns: Array<{ source: string; nextRunAt: string }>;
  } {
    const nextRuns = Array.from(this.sources.values())
      .map(s => ({
        source: s.source.id,
        nextRunAt: new Date(s.nextRunAt).toISOString(),
      }))
      .sort((a, b) => new Date(a.nextRunAt).getTime() - new Date(b.nextRunAt).getTime());

    return {
      sourceCount: this.sources.size,
      nextRuns,
    };
  }
}

