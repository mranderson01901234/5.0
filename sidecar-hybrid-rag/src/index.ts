/**
 * Hybrid RAG Sidecar Entry Point
 */

import '../../apps/shared-env-loader.js';
import { createServer } from './server.js';
import { loadConfig } from './config.js';
import { logger } from './utils/logger.js';

async function main() {
  try {
    const config = loadConfig();
    logger.info({ config: { port: config.port, nodeEnv: config.nodeEnv } }, 'Starting Hybrid RAG Sidecar');

    const app = await createServer();

    const address = await app.listen({
      port: config.port,
      host: '0.0.0.0',
    });

    logger.info(`Hybrid RAG Sidecar listening on ${address}`);

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info({ signal }, 'Shutting down gracefully');
      await app.close();
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    logger.error({ error }, 'Failed to start server');
    process.exit(1);
  }
}

main();

