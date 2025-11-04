/**
 * Export job queue using BullMQ
 */

import { Queue, QueueOptions } from 'bullmq';
import { getRedis } from './redis.js';
import { logger } from './log.js';

export interface ExportJobData {
  exportId: string;
  artifactId: string;
  userId: string;
  threadId: string;
  format: 'pdf' | 'docx' | 'xlsx';
}

let exportQueue: Queue<ExportJobData> | null = null;

/**
 * Initialize export queue
 */
export function initializeExportQueue(): Queue<ExportJobData> | null {
  const redis = getRedis();
  
  if (!redis) {
    logger.warn('Redis not available, export queue disabled');
    return null;
  }

  const queueOptions: QueueOptions = {
    connection: {
      host: redis.options.host || 'localhost',
      port: redis.options.port || 6379,
    },
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: {
        age: 24 * 60 * 60, // Keep completed jobs for 24 hours
        count: 1000, // Keep last 1000 completed jobs
      },
      removeOnFail: {
        age: 7 * 24 * 60 * 60, // Keep failed jobs for 7 days
      },
    },
  };

  exportQueue = new Queue<ExportJobData>('export-jobs', queueOptions);
  logger.info('Export queue initialized');
  
  return exportQueue;
}

/**
 * Get export queue instance
 */
export function getExportQueue(): Queue<ExportJobData> | null {
  if (!exportQueue) {
    return initializeExportQueue();
  }
  return exportQueue;
}

/**
 * Add export job to queue
 */
export async function enqueueExportJob(data: ExportJobData): Promise<string> {
  const queue = getExportQueue();
  
  if (!queue) {
    throw new Error('Export queue not available');
  }

  const job = await queue.add('export', data, {
    jobId: data.exportId, // Use exportId as jobId for easier lookup
  });

  logger.info({ exportId: data.exportId, jobId: job.id }, 'Export job enqueued');
  
  return job.id!;
}

