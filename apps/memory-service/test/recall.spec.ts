/**
 * Async Recall endpoint tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { createDatabase, type DatabaseConnection } from '../src/db';
import { MemoryModel } from '../src/models';
import { CadenceTracker } from '../src/cadence';
import { JobQueue } from '../src/queue';
import { registerRoutes } from '../src/routes';

describe('Async Recall Endpoint', () => {
  let app: FastifyInstance;
  let db: DatabaseConnection;
  let memoryModel: MemoryModel;

  beforeEach(async () => {
    // Setup
    db = createDatabase(':memory:');
    memoryModel = new MemoryModel(db);

    const cadence = new CadenceTracker({
      msgs: 6,
      tokens: 1500,
      minutes: 3,
      debounceSec: 30,
    });

    const queue = new JobQueue();

    app = Fastify({ logger: false });
    registerRoutes(app, db, cadence, queue);

    await app.ready();
  });

  it('should return memories within deadline', async () => {
    // Create test memories
    memoryModel.create({
      userId: 'user1',
      threadId: 'thread1',
      content: 'Test memory 1',
      entities: null,
      priority: 0.9,
      confidence: 0.8,
      redactionMap: null,
      tier: 'TIER2',
      sourceThreadId: 'thread1',
      repeats: 1,
      threadSet: JSON.stringify(['thread1']),
      lastSeenTs: Date.now(),
      deletedAt: null,
    });

    memoryModel.create({
      userId: 'user1',
      threadId: 'thread1',
      content: 'Test memory 2',
      entities: null,
      priority: 0.7,
      confidence: 0.8,
      redactionMap: null,
      tier: 'TIER3',
      sourceThreadId: 'thread1',
      repeats: 1,
      threadSet: JSON.stringify(['thread1']),
      lastSeenTs: Date.now(),
      deletedAt: null,
    });

    const response = await app.inject({
      method: 'GET',
      url: '/v1/recall',
      query: {
        userId: 'user1',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.memories).toHaveLength(2);
    expect(body.count).toBe(2);
    expect(body.elapsedMs).toBeDefined();
    expect(body.timedOut).toBeDefined();
  });

  it('should prioritize memories by tier (TIER2 > TIER1 > TIER3)', async () => {
    // Create memories in different tiers
    memoryModel.create({
      userId: 'user1',
      threadId: 'thread1',
      content: 'TIER3 memory',
      entities: null,
      priority: 0.9, // High priority
      confidence: 0.8,
      redactionMap: null,
      tier: 'TIER3',
      sourceThreadId: 'thread1',
      repeats: 1,
      threadSet: JSON.stringify(['thread1']),
      lastSeenTs: Date.now(),
      deletedAt: null,
    });

    memoryModel.create({
      userId: 'user1',
      threadId: 'thread1',
      content: 'TIER2 memory',
      entities: null,
      priority: 0.5, // Lower priority
      confidence: 0.8,
      redactionMap: null,
      tier: 'TIER2',
      sourceThreadId: 'thread1',
      repeats: 1,
      threadSet: JSON.stringify(['thread1']),
      lastSeenTs: Date.now(),
      deletedAt: null,
    });

    memoryModel.create({
      userId: 'user1',
      threadId: 'thread1',
      content: 'TIER1 memory',
      entities: null,
      priority: 0.6,
      confidence: 0.8,
      redactionMap: null,
      tier: 'TIER1',
      sourceThreadId: 'thread1',
      repeats: 2,
      threadSet: JSON.stringify(['thread1', 'thread2']),
      lastSeenTs: Date.now(),
      deletedAt: null,
    });

    const response = await app.inject({
      method: 'GET',
      url: '/v1/recall',
      query: {
        userId: 'user1',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.memories).toHaveLength(3);

    // Check tier ordering: TIER2 first, then TIER1, then TIER3
    expect(body.memories[0].tier).toBe('TIER2');
    expect(body.memories[1].tier).toBe('TIER1');
    expect(body.memories[2].tier).toBe('TIER3');
  });

  it('should prioritize same-thread memories when threadId provided', async () => {
    // Create memories in different threads
    memoryModel.create({
      userId: 'user1',
      threadId: 'thread1',
      content: 'Thread 1 memory',
      entities: null,
      priority: 0.7,
      confidence: 0.8,
      redactionMap: null,
      tier: 'TIER3',
      sourceThreadId: 'thread1',
      repeats: 1,
      threadSet: JSON.stringify(['thread1']),
      lastSeenTs: Date.now(),
      deletedAt: null,
    });

    memoryModel.create({
      userId: 'user1',
      threadId: 'thread2',
      content: 'Thread 2 memory',
      entities: null,
      priority: 0.9, // Higher priority
      confidence: 0.8,
      redactionMap: null,
      tier: 'TIER3',
      sourceThreadId: 'thread2',
      repeats: 1,
      threadSet: JSON.stringify(['thread2']),
      lastSeenTs: Date.now(),
      deletedAt: null,
    });

    const response = await app.inject({
      method: 'GET',
      url: '/v1/recall',
      query: {
        userId: 'user1',
        threadId: 'thread1',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.memories).toHaveLength(2);

    // Thread1 memory should be first despite lower priority
    expect(body.memories[0].threadId).toBe('thread1');
  });

  it('should respect maxItems limit', async () => {
    // Create 10 memories
    for (let i = 0; i < 10; i++) {
      memoryModel.create({
        userId: 'user1',
        threadId: 'thread1',
        content: `Memory ${i}`,
        entities: null,
        priority: 0.5 + i * 0.05,
        confidence: 0.8,
        redactionMap: null,
        tier: 'TIER3',
        sourceThreadId: 'thread1',
        repeats: 1,
        threadSet: JSON.stringify(['thread1']),
        lastSeenTs: Date.now(),
        deletedAt: null,
      });
    }

    const response = await app.inject({
      method: 'GET',
      url: '/v1/recall',
      query: {
        userId: 'user1',
        maxItems: '3',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.memories).toHaveLength(3);
    expect(body.count).toBe(3);
  });

  it('should enforce maximum limit of 20 items', async () => {
    // Create 30 memories
    for (let i = 0; i < 30; i++) {
      memoryModel.create({
        userId: 'user1',
        threadId: 'thread1',
        content: `Memory ${i}`,
        entities: null,
        priority: 0.5,
        confidence: 0.8,
        redactionMap: null,
        tier: 'TIER3',
        sourceThreadId: 'thread1',
        repeats: 1,
        threadSet: JSON.stringify(['thread1']),
        lastSeenTs: Date.now(),
        deletedAt: null,
      });
    }

    const response = await app.inject({
      method: 'GET',
      url: '/v1/recall',
      query: {
        userId: 'user1',
        maxItems: '100', // Request more than max
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.memories.length).toBeLessThanOrEqual(20);
  });

  it('should respect deadline constraint', async () => {
    // Create many memories
    for (let i = 0; i < 100; i++) {
      memoryModel.create({
        userId: 'user1',
        threadId: 'thread1',
        content: `Memory ${i}`,
        entities: null,
        priority: 0.5,
        confidence: 0.8,
        redactionMap: null,
        tier: 'TIER3',
        sourceThreadId: 'thread1',
        repeats: 1,
        threadSet: JSON.stringify(['thread1']),
        lastSeenTs: Date.now(),
        deletedAt: null,
      });
    }

    const response = await app.inject({
      method: 'GET',
      url: '/v1/recall',
      query: {
        userId: 'user1',
        deadlineMs: '1', // Very short deadline
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.elapsedMs).toBeDefined();
    // With very short deadline, might timeout
    expect(body.timedOut).toBeDefined();
  });

  it('should not return deleted memories', async () => {
    // Create active memory
    memoryModel.create({
      userId: 'user1',
      threadId: 'thread1',
      content: 'Active memory',
      entities: null,
      priority: 0.8,
      confidence: 0.8,
      redactionMap: null,
      tier: 'TIER3',
      sourceThreadId: 'thread1',
      repeats: 1,
      threadSet: JSON.stringify(['thread1']),
      lastSeenTs: Date.now(),
      deletedAt: null,
    });

    // Create deleted memory
    memoryModel.create({
      userId: 'user1',
      threadId: 'thread1',
      content: 'Deleted memory',
      entities: null,
      priority: 0.9,
      confidence: 0.8,
      redactionMap: null,
      tier: 'TIER3',
      sourceThreadId: 'thread1',
      repeats: 1,
      threadSet: JSON.stringify(['thread1']),
      lastSeenTs: Date.now(),
      deletedAt: Date.now(),
    });

    const response = await app.inject({
      method: 'GET',
      url: '/v1/recall',
      query: {
        userId: 'user1',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.memories).toHaveLength(1);
    expect(body.memories[0].content).toBe('Active memory');
  });

  it('should return 400 if userId is missing', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/recall',
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.error).toBe('userId is required');
  });

  it('should return empty array if no memories found', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/recall',
      query: {
        userId: 'nonexistent',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.memories).toHaveLength(0);
    expect(body.count).toBe(0);
  });
});
