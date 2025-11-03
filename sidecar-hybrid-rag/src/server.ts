/**
 * Hybrid RAG HTTP Server
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import { logger } from './utils/logger.js';
import { HybridOrchestrator } from './orchestrator/hybridOrchestrator.js';
import { VectorStore } from './storage/vectorStore.js';
import { HybridRAGRequest } from './types/requests.js';
import { metrics } from './utils/metrics.js';

const orchestrator = new HybridOrchestrator();
const vectorStore = new VectorStore();

// Initialize vector store
vectorStore.initialize().catch(error => {
  logger.error({ error }, 'Failed to initialize vector store');
});

export async function createServer() {
  const app = Fastify({
    logger: true,
  });

  // CORS
  await app.register(cors, {
    origin: true,
  });

  // Health check
  app.get('/health', async () => {
    const vectorHealth = await vectorStore.health();
    const metricSummary = metrics.getSummary();
    
    return {
      status: vectorHealth ? 'healthy' : 'degraded',
      service: 'hybrid-rag',
      version: '0.1.0',
      components: {
        vector: vectorHealth ? 'healthy' : 'unhealthy',
      },
      metrics: {
        totalRequests: metricSummary['rag.query']?.count || 0,
        avgLatency: metricSummary['rag.query']?.avg || 0,
      },
      timestamp: Date.now(),
    };
  });

  // Metrics endpoint
  app.get('/metrics', async () => {
    return metrics.getSummary();
  });

  // Main RAG endpoint
  app.post<{ Body: HybridRAGRequest }>('/v1/rag/hybrid', async (request, reply) => {
    try {
      // Validate required fields
      if (!request.body.userId) {
        logger.warn({ body: request.body }, 'Missing userId in RAG request');
        return reply.code(400).send({ error: 'userId is required' });
      }

      if (!request.body.query) {
        logger.warn({ userId: request.body.userId }, 'Missing query in RAG request');
        return reply.code(400).send({ error: 'query is required' });
      }

      const response = await orchestrator.processQuery(request.body);

      // Record metrics
      metrics.record('rag.query.success', 1);

      return reply.send(response);
    } catch (error) {
      logger.error({ error, body: request.body }, 'RAG query failed');
      metrics.record('rag.query.error', 1);

      return reply.code(500).send({
        error: 'RAG query failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  return app;
}
