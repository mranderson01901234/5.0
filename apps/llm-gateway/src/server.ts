// Load .env from root directory (unified loader)
import '../../shared-env-loader.js';

import Fastify from 'fastify';
import compress from '@fastify/compress';
import cors from '@fastify/cors';
import { registerRoutes } from './routes.js';
import { providerPool } from './ProviderPool.js';
import { logger } from './log.js';
import clerkAuth from './plugins/clerkAuth.js';
import { closeDatabase } from './database.js';

const app = Fastify({
  logger: false,
});

// Register CORS
await app.register(cors, {
  origin: true, // Allow all origins in development
  credentials: true,
  allowedHeaders: ["content-type", "authorization", "x-user-id"],
});

// Register Clerk auth plugin
await app.register(clerkAuth);

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

await registerRoutes(app);

// Use service-specific port env var if available, fallback to PORT, then default
const port = Number(process.env.GATEWAY_PORT || process.env.PORT) || 8787;

// Prepare providers on startup
await providerPool.prepare();

app.listen({ port, host: '0.0.0.0' }, (err) => {
  if (err) {
    logger.error({ err }, 'Server start error');
    process.exit(1);
  }
  logger.info({ port }, 'Server listening');
});

// Graceful shutdown
const shutdown = async () => {
  logger.info('Shutting down...');
  closeDatabase(); // Close database connections gracefully
  await providerPool.close();
  await app.close();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

