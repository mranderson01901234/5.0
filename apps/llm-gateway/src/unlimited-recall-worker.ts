/**
 * Unlimited Recall Background Worker
 * Processes jobs for label generation, summaries, and embeddings
 */

import { getDatabase } from './database.js';
import { UnlimitedRecallDB, type RecallJob } from './unlimited-recall-db.js';
import {
  generateConversationLabel,
  generateConversationSummary,
  estimateTokens,
  calculateImportanceScore,
  determinePrimaryTopic
} from './unlimited-recall-generators.js';
import { generateEmbedding } from './unlimited-recall-embeddings.js';
import { logger } from './log.js';

/**
 * Background worker that processes recall jobs
 */
export class UnlimitedRecallWorker {
  private isRunning = false;
  private pollInterval = 5000; // 5 seconds
  private pollTimer?: NodeJS.Timeout;
  private recallDB: UnlimitedRecallDB;

  constructor() {
    const db = getDatabase();
    this.recallDB = new UnlimitedRecallDB(db);
  }

  /**
   * Start the worker
   */
  start(): void {
    if (this.isRunning) {
      logger.warn('Unlimited recall worker already running');
      return;
    }

    this.isRunning = true;
    logger.info('Starting unlimited recall background worker');
    this.poll();
  }

  /**
   * Stop the worker
   */
  stop(): void {
    this.isRunning = false;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = undefined;
    }
    logger.info('Stopped unlimited recall background worker');
  }

  /**
   * Poll for jobs and process them
   */
  private async poll(): Promise<void> {
    if (!this.isRunning) return;

    try {
      // Get next pending job
      const job = this.recallDB.getNextJob();

      if (job) {
        await this.processJob(job);
      }

      // Schedule next poll
      this.pollTimer = setTimeout(() => this.poll(), this.pollInterval);
    } catch (error: any) {
      logger.error({ error: error.message, stack: error.stack }, 'Error in worker poll loop');
      // Continue polling even after error
      this.pollTimer = setTimeout(() => this.poll(), this.pollInterval);
    }
  }

  /**
   * Process a single job
   */
  private async processJob(job: RecallJob): Promise<void> {
    const startTime = Date.now();

    try {
      logger.info({
        jobId: job.id,
        jobType: job.job_type,
        threadId: job.thread_id,
        userId: job.user_id
      }, 'Processing recall job');

      // Mark as processing
      this.recallDB.updateJobStatus(job.id, 'processing');

      // Process based on job type
      let result: string | null = null;

      switch (job.job_type) {
        case 'label':
          result = await this.processLabelJob(job);
          break;
        case 'summary':
          result = await this.processSummaryJob(job);
          break;
        case 'embedding':
          result = await this.processEmbeddingJob(job);
          break;
        case 'cleanup':
          result = await this.processCleanupJob(job);
          break;
        default:
          throw new Error(`Unknown job type: ${job.job_type}`);
      }

      // Mark as completed
      this.recallDB.updateJobStatus(job.id, 'completed', undefined, result);

      const duration = Date.now() - startTime;
      logger.info({
        jobId: job.id,
        jobType: job.job_type,
        durationMs: duration
      }, 'Job completed successfully');

    } catch (error: any) {
      const duration = Date.now() - startTime;

      logger.error({
        jobId: job.id,
        jobType: job.job_type,
        error: error.message,
        stack: error.stack,
        durationMs: duration
      }, 'Job failed');

      // Retry logic
      if (job.retry_count < job.max_retries) {
        // Increment retry count and re-enqueue
        this.recallDB.updateJobStatus(job.id, 'pending', error.message);

        // Update retry count manually
        const db = getDatabase();
        db.prepare(`
          UPDATE recall_jobs
          SET retry_count = retry_count + 1
          WHERE id = ?
        `).run(job.id);

        logger.info({
          jobId: job.id,
          retryCount: job.retry_count + 1,
          maxRetries: job.max_retries
        }, 'Job re-enqueued for retry');
      } else {
        // Max retries exceeded, mark as failed
        this.recallDB.updateJobStatus(job.id, 'failed', error.message);
      }
    }
  }

  /**
   * Process label generation job
   */
  private async processLabelJob(job: RecallJob): Promise<string> {
    // Get conversation messages
    const messages = this.recallDB.getConversationMessages(job.thread_id, job.user_id);

    if (messages.length === 0) {
      throw new Error('No messages found for conversation');
    }

    // Generate label
    const label = await generateConversationLabel(messages);
    const labelTokens = estimateTokens(label);

    // Update conversation package
    this.recallDB.upsertConversationPackage({
      thread_id: job.thread_id,
      user_id: job.user_id,
      label,
      label_tokens: labelTokens,
      label_generated_at: Math.floor(Date.now() / 1000)
    });

    logger.info({
      threadId: job.thread_id,
      label,
      labelTokens
    }, 'Generated conversation label');

    return JSON.stringify({ label, tokens: labelTokens });
  }

  /**
   * Process summary generation job
   */
  private async processSummaryJob(job: RecallJob): Promise<string> {
    // Get conversation messages
    const messages = this.recallDB.getConversationMessages(job.thread_id, job.user_id);

    if (messages.length === 0) {
      throw new Error('No messages found for conversation');
    }

    // Calculate importance
    const importanceScore = calculateImportanceScore(messages);
    const importance = importanceScore > 0.7 ? 'high' : 'normal';

    // Generate summary
    const summaryData = await generateConversationSummary(messages, importance);
    const summaryTokens = estimateTokens(summaryData.summary);

    // Determine primary topic
    const primaryTopic = determinePrimaryTopic(summaryData.technicalTerms);

    // Update conversation package
    this.recallDB.upsertConversationPackage({
      thread_id: job.thread_id,
      user_id: job.user_id,
      summary: summaryData.summary,
      summary_tokens: summaryTokens,
      summary_updated_at: Math.floor(Date.now() / 1000),
      importance_score: importanceScore,
      primary_topic: primaryTopic
    });

    logger.info({
      threadId: job.thread_id,
      summaryTokens,
      importanceScore,
      primaryTopic,
      keyDecisions: summaryData.keyDecisions.length
    }, 'Generated conversation summary');

    return JSON.stringify({
      summary: summaryData.summary,
      tokens: summaryTokens,
      importance: importanceScore,
      topic: primaryTopic,
      keyDecisions: summaryData.keyDecisions,
      technicalTerms: summaryData.technicalTerms
    });
  }

  /**
   * Process embedding generation job
   */
  private async processEmbeddingJob(job: RecallJob): Promise<string> {
    // Get conversation package
    const pkg = this.recallDB.getConversationPackage(job.thread_id, job.user_id);

    if (!pkg) {
      throw new Error('Conversation package not found');
    }

    if (!pkg.label) {
      throw new Error('Cannot generate embedding without label');
    }

    // Generate embeddings
    const labelEmbedding = await generateEmbedding(pkg.label);

    let summaryEmbedding = null;
    if (pkg.summary) {
      summaryEmbedding = await generateEmbedding(pkg.summary);
    }

    // Combined embedding (label + summary)
    const combinedText = pkg.summary
      ? `${pkg.label}. ${pkg.summary}`
      : pkg.label;
    const combinedEmbedding = await generateEmbedding(combinedText);

    // Store embeddings
    this.recallDB.storeEmbedding({
      thread_id: job.thread_id,
      user_id: job.user_id,
      label_embedding: labelEmbedding ? Buffer.from(new Float32Array(labelEmbedding).buffer) : null,
      summary_embedding: summaryEmbedding ? Buffer.from(new Float32Array(summaryEmbedding).buffer) : null,
      combined_embedding: combinedEmbedding ? Buffer.from(new Float32Array(combinedEmbedding).buffer) : null,
      embedding_model: 'text-embedding-3-small',
      embedding_dimensions: 512
    });

    logger.info({
      threadId: job.thread_id,
      hasLabel: !!labelEmbedding,
      hasSummary: !!summaryEmbedding,
      hasCombined: !!combinedEmbedding
    }, 'Generated conversation embeddings');

    return JSON.stringify({
      label_embedding: !!labelEmbedding,
      summary_embedding: !!summaryEmbedding,
      combined_embedding: !!combinedEmbedding
    });
  }

  /**
   * Process cleanup job
   */
  private async processCleanupJob(job: RecallJob): Promise<string> {
    // TODO: Implement cleanup logic
    // - Delete old conversations beyond retention period
    // - Clean up orphaned embeddings
    // - Compress old message history

    logger.info({ threadId: job.thread_id }, 'Cleanup job (not implemented yet)');
    return JSON.stringify({ cleaned: false, reason: 'not_implemented' });
  }
}

// Singleton instance
let workerInstance: UnlimitedRecallWorker | null = null;

/**
 * Get or create worker instance
 */
export function getUnlimitedRecallWorker(): UnlimitedRecallWorker {
  if (!workerInstance) {
    workerInstance = new UnlimitedRecallWorker();
  }
  return workerInstance;
}

/**
 * Start the worker (call this in server startup)
 */
export function startUnlimitedRecallWorker(): void {
  const worker = getUnlimitedRecallWorker();
  worker.start();
}

/**
 * Stop the worker (call this in server shutdown)
 */
export function stopUnlimitedRecallWorker(): void {
  if (workerInstance) {
    workerInstance.stop();
    workerInstance = null;
  }
}
