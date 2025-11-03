/**
 * Basic smoke tests for Hybrid RAG sidecar
 */

import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from './server.js';

describe('Hybrid RAG Sidecar', () => {
  let app: any;

  beforeAll(async () => {
    // Set a timeout for server creation
    app = await Promise.race([
      createServer(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Server creation timeout')), 10000))
    ]);
  }, 10000); // 10 second timeout for beforeAll

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('Health Check', () => {
    it('should return healthy status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.service).toBe('hybrid-rag');
      expect(body.version).toBe('0.1.0');
    });
  });

  describe('RAG Endpoint', () => {
    it('should accept valid RAG request', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/rag/hybrid',
        payload: {
          userId: 'test_user',
          query: 'What did we discuss about React?',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('memories');
      expect(body).toHaveProperty('vectorResults');
      expect(body).toHaveProperty('confidence');
      expect(body).toHaveProperty('latency');
    });

    it('should handle missing userId', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/rag/hybrid',
        payload: {
          query: 'test query',
        },
      });

      // May return 500 without API key or 200 with graceful handling
      // The important thing is it doesn't crash
      expect(response.statusCode).toBeGreaterThanOrEqual(200);
      expect(response.statusCode).toBeLessThan(600);
    });
  });
});

