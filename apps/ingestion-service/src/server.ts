/**
 * Ingestion Service - Isolated Service for World Information Ingestion
 * Phase 1: RSS Feed Ingestion
 * 
 * Completely isolated from main application:
 * - Separate process
 * - Separate database
 * - No shared resources
 */

import { pino } from 'pino';
import { mkdirSync } from 'fs';
import { dirname } from 'path';
import { createRequire } from 'module';
import { createIngestionDatabase } from './db.js';
import { loadIngestionConfig, initializeSources } from './config.js';
import { IngestionScheduler } from './scheduler.js';
import { EmbeddingProcessor } from './embeddings/processor.js';

const require = createRequire(import.meta.url);
let pinoPrettyPath: string | undefined;
try {
  pinoPrettyPath = require.resolve('pino-pretty');
} catch (error) {
  // pino-pretty not available, will use default JSON output
  pinoPrettyPath = undefined;
}

const PORT = parseInt(process.env.INGESTION_SERVICE_PORT || '3002', 10);
const logger = pino({
  name: 'ingestion-service',
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV !== 'production' && pinoPrettyPath ? {
    target: pinoPrettyPath,
    options: {
      colorize: true,
      ignore: 'pid,hostname',
    },
  } : undefined,
});

async function start() {
  // Load .env (already done via dynamic import)
  logger.info('Starting Ingestion Service (Phase 1: RSS Feeds)');

  // Load configuration
  const config = loadIngestionConfig();

  if (!config.enabled) {
    logger.warn('Ingestion service is disabled (INGESTION_ENABLED=false)');
    process.exit(0);
  }

  // Ensure data directory exists
  mkdirSync(dirname(config.dbPath), { recursive: true });

  // Initialize database
  logger.info({ dbPath: config.dbPath }, 'Initializing ingestion database');
  const db = createIngestionDatabase(config.dbPath);

  // Initialize sources in database
  initializeSources(db);

  // Initialize embedding processor
  const embeddingProcessor = new EmbeddingProcessor(db);
  if (embeddingProcessor.isEnabled()) {
    await embeddingProcessor.initialize();
    logger.info('Embedding processor initialized');
  }

  // Create and start scheduler
  const scheduler = new IngestionScheduler(db);
  scheduler.initialize();
  scheduler.start();

  // Process embeddings every 5 minutes if enabled
  if (embeddingProcessor.isEnabled()) {
    setInterval(async () => {
      try {
        const stats = await embeddingProcessor.processPendingEmbeddings({ batchSize: 100 });
        if (stats.processed > 0) {
          logger.info(stats, 'Embeddings processed');
        }
      } catch (error: any) {
        logger.error({ error: error.message }, 'Embedding processing error');
      }
    }, 5 * 60 * 1000); // Every 5 minutes

    // Initial run after 30 seconds
    setTimeout(async () => {
      try {
        logger.info('Running initial embedding processing...');
        const stats = await embeddingProcessor.processPendingEmbeddings({ batchSize: 100 });
        logger.info(stats, 'Initial embeddings processed');
      } catch (error: any) {
        logger.error({ error: error.message }, 'Initial embedding processing error');
      }
    }, 30000);
  }

  // Log stats periodically
  setInterval(() => {
    const stats = scheduler.getStats();
    logger.info(stats, 'Scheduler status');
  }, 60 * 60 * 1000); // Every hour

  // Health check endpoint (optional, for monitoring)
  if (PORT > 0) {
    try {
      const { createServer } = await import('http');
      const server = createServer((req, res) => {
        if (req.url === '/health') {
          const stats = scheduler.getStats();
          const embeddingStats = embeddingProcessor.isEnabled() ? embeddingProcessor.getStats() : null;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            status: 'ok',
            uptime: process.uptime(),
            ingestion: stats,
            embeddings: embeddingStats,
          }));
        } else {
          res.writeHead(404);
          res.end('Not found');
        }
      });

      server.listen(PORT, () => {
        logger.info({ port: PORT }, 'Health check server started');
      }).on('error', (error: any) => {
        if (error.code === 'EADDRINUSE') {
          logger.warn({ port: PORT }, 'Health check port already in use, skipping health server');
        } else {
          logger.warn({ error: error.message }, 'Failed to start health check server');
        }
      });
    } catch (error: any) {
      logger.warn({ error: error.message }, 'Failed to start health check server');
    }
  }

  logger.info({
    enabled: config.enabled,
    dbPath: config.dbPath,
    maxItemsPerHour: config.maxItemsPerHour,
    batchSize: config.batchSize,
  }, 'Ingestion service started');

  // Graceful shutdown
  const shutdown = async () => {
    logger.info('Shutting down ingestion service...');
    scheduler.stop();
    db.close();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  // Global error handlers
  process.on('uncaughtException', (error) => {
    logger.error({ error, stack: error.stack }, 'Uncaught exception - service will continue');
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.error({ reason, promise }, 'Unhandled promise rejection - service will continue');
  });
}

start().catch((error) => {
  logger.error({ error }, 'Failed to start ingestion service');
  process.exit(1);
});

