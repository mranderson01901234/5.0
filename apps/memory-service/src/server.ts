/**
 * Memory Service - Background smart memory processing
 * Non-blocking, fire-and-forget architecture
 */

// Load .env from root directory (unified loader)
import '../../shared-env-loader.js';

import Fastify from 'fastify';
import cors from '@fastify/cors';
import { createDatabase } from './db.js';
import { CadenceTracker } from './cadence.js';
import { JobQueue } from './queue.js';
import { registerRoutes } from './routes.js';
import { registerMetrics } from './metrics.js';
import { registerWebSearchRoute } from './webSearch.js';
import { pino } from 'pino';
import { mkdirSync } from 'fs';
import { dirname } from 'path';
import clerkAuth from './plugins/clerkAuth.js';
import { initializeRedis, closeRedis } from './redis.js';
import { loadResearchConfig } from './config.js';
import { scheduleRetentionJob, loadRetentionConfig } from './retention.js';
import { startEmbeddingWorker, stopEmbeddingWorker } from './embedding-worker.js';
import Database from 'better-sqlite3';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
let pinoPrettyPath: string | undefined;
try {
  pinoPrettyPath = require.resolve('pino-pretty');
} catch (error) {
  // pino-pretty not available, will use default JSON output
  pinoPrettyPath = undefined;
}

const PORT = parseInt(process.env.MEMORY_SERVICE_PORT || process.env.PORT || '3001', 10);
const HOST = process.env.HOST || '0.0.0.0';
const DB_PATH = process.env.DB_PATH || './data/memory.db';
const GATEWAY_DB_PATH = process.env.GATEWAY_DB_PATH || './apps/llm-gateway/gateway.db';

const logger = pino({
  name: 'memory-service',
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
  // Ensure data directory exists
  mkdirSync(dirname(DB_PATH), { recursive: true });

  // Initialize database
  logger.info({ path: DB_PATH });
  const db = createDatabase(DB_PATH);

  // Initialize gateway database connection for fetching messages
  let gatewayDb: Database.Database | null = null;
  try {
    // Ensure gateway database directory exists
    mkdirSync(dirname(GATEWAY_DB_PATH), { recursive: true });
    gatewayDb = new Database(GATEWAY_DB_PATH);
    logger.info({ path: GATEWAY_DB_PATH }, 'Gateway database connected');
  } catch (error: any) {
    logger.warn({ error: error.message, path: GATEWAY_DB_PATH }, 'Failed to connect to gateway database, audits will use mock data');
  }

  // Initialize components
  const cadence = new CadenceTracker();
  const queue = new JobQueue();

  // Initialize research config and Redis (if enabled)
  loadResearchConfig();
  await initializeRedis();

  // Schedule retention job (daily)
  const retentionConfig = loadRetentionConfig();
  scheduleRetentionJob(db, retentionConfig, 24 * 60 * 60 * 1000);
  logger.info('Retention job scheduled daily');

  // Start embedding worker (processes embedding queue)
  startEmbeddingWorker(db);
  logger.info('Embedding worker started');

  // Cleanup stale threads every hour
  setInterval(() => {
    cadence.cleanup();
  }, 60 * 60 * 1000);

  // Create Fastify app
  const app = Fastify({
    logger,
    requestIdLogLabel: 'reqId',
    disableRequestLogging: false,
  });

  // Register CORS
  await app.register(cors, {
    origin: true,
    credentials: true,
    allowedHeaders: ["content-type", "authorization", "x-user-id"],
  });

  // Register Clerk auth plugin
  await app.register(clerkAuth);

  // Register routes
  registerRoutes(app as any, db, cadence, queue, gatewayDb);
  registerMetrics(app as any, db, DB_PATH, cadence, queue);
  registerWebSearchRoute(app as any);
  
  // Register ingestion context route
  const { registerIngestionContextRoute } = await import('./ingestion/routes.js');
  registerIngestionContextRoute(app as any);

  // Start server
  try {
    await app.listen({ port: PORT, host: HOST });
    logger.info({
      port: PORT,
      host: HOST,
      dbPath: DB_PATH,
    });
  } catch (error) {
    logger.error({ error }, 'Server start error');
    process.exit(1);
  }

  // Graceful shutdown
  const shutdown = async () => {
    logger.info('Shutting down gracefully...');
    stopEmbeddingWorker();
    await app.close();
    await closeRedis();
    db.close();
    if (gatewayDb) {
      gatewayDb.close();
    }
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  
  // Global error handlers to prevent crashes
  process.on('uncaughtException', (error) => {
    logger.error({ error, stack: error.stack }, 'Uncaught exception - service will continue');
    // Don't exit - log and continue
  });
  
  process.on('unhandledRejection', (reason, promise) => {
    logger.error({ reason, promise }, 'Unhandled promise rejection - service will continue');
    // Don't exit - log and continue
  });
}

start().catch((error) => {
  logger.error({ error }, 'Failed to start server');
  process.exit(1);
});
