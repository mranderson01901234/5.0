// Load .env from root directory (unified loader)
import '../../shared-env-loader.js';

import Fastify from 'fastify';
import compress from '@fastify/compress';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { registerRoutes } from './routes.js';
import { providerPool } from './ProviderPool.js';
import { logger } from './log.js';
import clerkAuth from './plugins/clerkAuth.js';
import { closeDatabase } from './database.js';
import { initializeRedis, closeRedis } from './redis.js';
import { initializeExportQueue, getExportQueue } from './queue.js';
import { initializeExportWorker, closeExportWorker } from './workers/exportWorker.js';
import { initializeWebSocketServer, closeWebSocketServer } from './websocket.js';
import { telemetryStore } from './telemetry.js';
import { startUnlimitedRecallWorker, stopUnlimitedRecallWorker } from './unlimited-recall-worker.js';

const app = Fastify({
  logger: false,
});

// Register CORS
await app.register(cors, {
  origin: true, // Allow all origins in development
  credentials: true,
  allowedHeaders: ["content-type", "authorization", "x-user-id"],
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
});

// Register Clerk auth plugin
await app.register(clerkAuth);

// Register multipart for file uploads
await app.register(multipart, {
  limits: {
    fileSize: parseInt(process.env.MAX_UPLOAD_SIZE || '10485760'), // 10MB default
  },
});

// Register compress with filter that excludes SSE
await app.register(compress, {
  threshold: 1024,
  encodings: ['gzip', 'deflate'],
  requestEncodings: ['gzip', 'deflate'],
});

// Disable compression for SSE routes
app.addHook('onRequest', async (request, reply) => {
  if (request.url.startsWith('/v1/chat/stream')) {
    reply.header('Content-Encoding', 'identity');
    reply.removeHeader('accept-encoding');
  }
});

// Initialize Redis and export queue
await initializeRedis();
initializeExportQueue();
initializeExportWorker();

// Initialize unlimited recall worker
startUnlimitedRecallWorker();

await registerRoutes(app);

// Use service-specific port env var if available, fallback to PORT, then default
const port = Number(process.env.GATEWAY_PORT || process.env.PORT) || 8787;

// Prepare providers on startup
await providerPool.prepare();

app.listen({ port, host: '0.0.0.0' }, async (err) => {
  if (err) {
    logger.error({ err }, 'Server start error');
    process.exit(1);
  }
  logger.info({ port }, 'Server listening');
  
  // Initialize WebSocket server after HTTP server is ready
  const server = app.server;
  if (server) {
    initializeWebSocketServer(server);
  }
});

// Graceful shutdown
const shutdown = async () => {
  logger.info('Shutting down gracefully...');
  
  // Stop accepting new requests
  await app.close();
  
  // Close WebSocket server
  await closeWebSocketServer();
  
  // Close export worker
  await closeExportWorker();

  // Close unlimited recall worker
  stopUnlimitedRecallWorker();

  // Close export queue
  const queue = getExportQueue();
  if (queue) {
    await queue.close();
  }
  
  // Close telemetry store
  await telemetryStore.close();
  
  // Close Redis
  await closeRedis();
  
  // Close database
  closeDatabase();
  
  // Close provider pool
  await providerPool.close();
  
  logger.info('Shutdown complete');
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

