/**
 * Export Worker - Processes export jobs from BullMQ queue
 */

import { Worker, Job } from 'bullmq';
import { getRedis } from '../redis.js';
import { logger } from '../log.js';
import { getDatabase } from '../database.js';
import { generateExport } from '../exports/index.js';
import { createStorageAdapter } from '../storage/index.js';
import { telemetryStore } from '../telemetry.js';
import type { ExportJobData } from '../queue.js';

let exportWorker: Worker<ExportJobData> | null = null;

/**
 * Process export job
 */
async function processExportJob(job: Job<ExportJobData>): Promise<void> {
  const { exportId, artifactId, userId, threadId, format } = job.data;
  const startTime = Date.now();

  logger.info({ exportId, artifactId, format }, 'Processing export job');

  const db = getDatabase();
  let artifactType: 'table' | 'doc' | 'sheet' = 'table'; // Default, will be set from artifact

  try {
    // Update status to processing
    db.prepare(`
      UPDATE exports
      SET status = 'processing'
      WHERE id = ?
    `).run(exportId);

    // Fetch artifact from database
    const artifact = db.prepare(`
      SELECT id, user_id, thread_id, type, data
      FROM artifacts
      WHERE id = ? AND user_id = ? AND (deleted_at IS NULL OR deleted_at = 0)
    `).get(artifactId, userId) as {
      id: string;
      user_id: string;
      thread_id: string;
      type: string;
      data: string;
    } | undefined;

    if (!artifact) {
      throw new Error(`Artifact not found: ${artifactId}`);
    }

    // Parse artifact data
    const artifactData = JSON.parse(artifact.data);
    artifactType = artifact.type as 'table' | 'doc' | 'sheet';
    
    // Generate export file
    let fileBuffer: Buffer;
    try {
      fileBuffer = await generateExport(
        artifactData,
        format,
        artifactType
      );
    } catch (error: any) {
      logger.error({ error: error.message, stack: error.stack, exportId }, 'Failed to generate export');
      throw new Error(`Export generation failed: ${error.message}`);
    }

    // Upload to storage
    const storage = createStorageAdapter();
    const fileExtension = format;
    const storagePath = `exports/${userId}/${exportId}.${fileExtension}`;
    
    let storageUrl: string;
    try {
      await storage.upload(fileBuffer, storagePath);
      const urlResult = storage.getUrl(storagePath);
      storageUrl = typeof urlResult === 'string' ? urlResult : await urlResult;
    } catch (error: any) {
      logger.error({ error: error.message, stack: error.stack, exportId }, 'Failed to upload export');
      throw new Error(`Storage upload failed: ${error.message}`);
    }

    // Update export record with URL and completed status
    db.prepare(`
      UPDATE exports
      SET url = ?, status = 'completed'
      WHERE id = ?
    `).run(storageUrl, exportId);

    const durationMs = Date.now() - startTime;

    // Structured logging for export job
    logger.info({
      event: 'export_job_completed',
      exportId,
      artifactId,
      userId,
      threadId,
      format,
      artifactType,
      fileSize: fileBuffer.length,
      durationMs,
      latency: {
        generation: durationMs, // Total duration
        p50: durationMs, // For aggregation
        p95: durationMs,
        p99: durationMs,
      },
      metrics: {
        success: true,
        retryCount: job.attemptsMade || 0,
      },
    }, 'Export job completed successfully');

    // Log telemetry event
    const telemetryEvent = {
      event: 'export_job_completed',
      userId,
      threadId,
      artifactId,
      exportId,
      format,
      fileSize: fileBuffer.length,
      durationMs,
      downloadUrl: storageUrl.substring(0, 100), // Truncate for logs
      timestamp: Date.now(),
    };
    telemetryStore.addEvent(telemetryEvent).catch(err => {
      logger.warn({ error: err.message }, 'Failed to publish telemetry event');
    });

    logger.info({ exportId, durationMs }, 'Export job completed successfully');
  } catch (error: any) {
    const durationMs = Date.now() - startTime;
    
    // Update status to failed
    db.prepare(`
      UPDATE exports
      SET status = 'failed'
      WHERE id = ?
    `).run(exportId);

    // Structured logging for failed export job
    logger.error({
      event: 'export_job_failed',
      exportId,
      artifactId,
      userId,
      threadId,
      format,
      artifactType,
      durationMs,
      errorCode: 'GENERATION_ERROR',
      errorMessage: error.message?.substring(0, 200) || String(error),
      latency: {
        failure: durationMs,
      },
      metrics: {
        success: false,
        retryCount: job.attemptsMade || 0,
        willRetry: (job.attemptsMade || 0) < (job.opts?.attempts || 3),
      },
    }, 'Export job failed');

    // Log telemetry event
    const telemetryEvent = {
      event: 'export_job_failed',
      userId,
      threadId,
      artifactId,
      exportId,
      format,
      errorCode: 'GENERATION_ERROR',
      errorMessage: error.message?.substring(0, 200) || String(error),
      durationMs,
      timestamp: Date.now(),
    };
    telemetryStore.addEvent(telemetryEvent).catch(err => {
      logger.warn({ error: err.message }, 'Failed to publish telemetry event');
    });

    logger.error({ exportId, error: error.message, durationMs }, 'Export job failed');
    throw error; // Re-throw so BullMQ can retry
  }
}

/**
 * Initialize export worker
 */
export function initializeExportWorker(): Worker<ExportJobData> | null {
  const redis = getRedis();
  
  if (!redis) {
    logger.warn('Redis not available, export worker disabled');
    return null;
  }

  const workerOptions = {
    connection: {
      host: redis.options.host || 'localhost',
      port: redis.options.port || 6379,
    },
    concurrency: 5, // Process up to 5 exports concurrently
    limiter: {
      max: 10, // Max 10 jobs per duration
      duration: 60000, // Per minute
    },
  };

  exportWorker = new Worker<ExportJobData>('export-jobs', processExportJob, workerOptions);

  exportWorker.on('completed', (job) => {
    logger.info({ jobId: job.id, exportId: job.data.exportId }, 'Export job completed');
  });

  exportWorker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, exportId: job?.data.exportId, error: err.message }, 'Export job failed');
  });

  exportWorker.on('error', (err) => {
    logger.error({ error: err.message }, 'Export worker error');
  });

  // Worker heartbeat: emit event every 60 seconds
  const heartbeatInterval = setInterval(async () => {
    try {
      const telemetryEvent = {
        event: 'worker_heartbeat',
        timestamp: Date.now(),
        worker: 'export',
        status: 'running',
      };
      await telemetryStore.addEvent(telemetryEvent);
    } catch (error: any) {
      logger.warn({ error: error.message }, 'Failed to emit worker heartbeat');
    }
  }, 60000); // Every 60 seconds

  // Cleanup heartbeat on worker close
  exportWorker.on('closed', () => {
    clearInterval(heartbeatInterval);
  });

  logger.info('Export worker initialized');
  
  return exportWorker;
}

/**
 * Get export worker instance
 */
export function getExportWorker(): Worker<ExportJobData> | null {
  if (!exportWorker) {
    return initializeExportWorker();
  }
  return exportWorker;
}

/**
 * Close export worker
 */
export async function closeExportWorker(): Promise<void> {
  if (exportWorker) {
    await exportWorker.close();
    exportWorker = null;
  }
}

