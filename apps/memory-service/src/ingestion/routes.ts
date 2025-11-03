/**
 * Ingestion Context Routes
 * Provides endpoint to retrieve ingested content for queries
 */

import type { FastifyInstance } from 'fastify';
import { retrieveIngestedContext } from './context.js';
import { pino } from 'pino';

const logger = pino({ name: 'ingestion-routes' });

export function registerIngestionContextRoute(app: FastifyInstance): void {
  /**
   * POST /v1/ingestion/context
   * Retrieve relevant ingested content for a query
   */
  app.post('/v1/ingestion/context', async (req, reply) => {
    // Optional auth check - for now allow internal service calls
    const internalService = req.headers['x-internal-service'];
    if (!internalService) {
      return reply.code(401).send({ error: 'Internal service call required' });
    }

    const { query } = req.body as { query?: string };

    if (!query || typeof query !== 'string' || query.trim().length < 3) {
      return reply.code(400).send({ error: 'Query required (min 3 characters)' });
    }

    try {
      const items = await retrieveIngestedContext(query.trim(), 5);

      return reply.code(200).send({
        items: items.map(item => ({
          title: item.title,
          summary: item.summary,
          url: item.url,
          category: item.category,
          publishedDate: item.publishedDate,
          source: item.source,
        })),
        count: items.length,
      });
    } catch (error: any) {
      logger.error({ error: error.message, query }, 'Ingestion context retrieval failed');
      return reply.code(500).send({ error: 'Failed to retrieve context', message: error.message });
    }
  });
}

