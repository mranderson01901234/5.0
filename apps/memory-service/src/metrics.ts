/**
 * Metrics collection and reporting
 */

import type { FastifyInstance } from 'fastify';
import type { DatabaseConnection } from './db.js';
import { MemoryModel, AuditModel } from './models.js';
import { CadenceTracker } from './cadence.js';
import { JobQueue } from './queue.js';
import { readFileSync, statSync } from 'fs';

export function registerMetrics(
  app: FastifyInstance,
  db: DatabaseConnection,
  dbPath: string,
  cadence: CadenceTracker,
  queue: JobQueue
) {
  const memoryModel = new MemoryModel(db);
  const auditModel = new AuditModel(db);

  /**
   * GET /v1/metrics
   * Comprehensive system metrics
   */
  app.get('/v1/metrics', async (req, reply) => {
    try {
      // Job queue metrics
      const jobMetrics = queue.getMetrics();

      // Memory metrics
      const totalMemories = memoryModel.getCountByUser(''); // Get all users
      const savedLastHour = memoryModel.getSavedLastHour();
      const deletedCount = memoryModel.getDeletedCount();
      const avgPriority = memoryModel.getAvgPriority();

      // Audit metrics
      const totalAudits = auditModel.getTotalCount();
      const avgScore = auditModel.getAvgScore();
      const savesPerAudit = auditModel.getSavesPerAudit();

      // Health metrics
      let dbSizeMb = 0;
      try {
        const stats = statSync(dbPath);
        dbSizeMb = stats.size / (1024 * 1024);
      } catch (error) {
        app.log.error({ error }, 'Failed to get DB size');
      }

      const queueDepth = jobMetrics.queueDepth;
      const lastAuditTime = auditModel.getLastAuditTime();
      const lastAuditMsAgo = lastAuditTime ? Date.now() - lastAuditTime : 0;

      // Rejection metrics (would need to track these in production)
      const rejections = {
        belowThreshold: 0,
        redactedAll: 0,
        tooLong: 0,
        rateLimited: 0,
      };

      const metrics = {
        jobs: {
          enqueued: jobMetrics.enqueued,
          processed: jobMetrics.processed,
          failed: jobMetrics.failed,
          avgLatencyMs: jobMetrics.avgLatencyMs,
          p95LatencyMs: jobMetrics.p95LatencyMs,
        },
        memories: {
          total: totalMemories,
          savedLastHour,
          deleted: deletedCount,
          avgPriority,
        },
        audits: {
          total: totalAudits,
          avgScore,
          savesPerAudit,
        },
        rejections,
        health: {
          dbSizeMb,
          queueDepth,
          lastAuditMsAgo,
        },
      };

      return reply.send(metrics);
    } catch (error) {
      app.log.error({ error }, 'Failed to collect metrics');
      return reply.code(500).send({ error: 'Failed to collect metrics' });
    }
  });

  /**
   * GET /health
   * Simple health check
   */
  app.get('/health', async (req, reply) => {
    return reply.send({ status: 'ok', timestamp: Date.now() });
  });
}
