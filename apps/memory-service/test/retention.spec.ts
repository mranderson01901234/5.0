/**
 * Retention & Decay tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createDatabase, type DatabaseConnection } from '../src/db';
import { MemoryModel } from '../src/models';
import { runRetentionJob, loadRetentionConfig, type RetentionConfig } from '../src/retention';

describe('Retention Job', () => {
  let db: DatabaseConnection;
  let memoryModel: MemoryModel;
  let config: RetentionConfig;

  beforeEach(() => {
    // Create in-memory database for testing
    db = createDatabase(':memory:');
    memoryModel = new MemoryModel(db);
    config = loadRetentionConfig();
  });

  it('should apply decay to old memories', async () => {
    const now = Date.now();
    const twoWeeksAgo = now - 14 * 24 * 60 * 60 * 1000;

    // Create memory from 2 weeks ago
    const memory = memoryModel.create({
      userId: 'user1',
      threadId: 'thread1',
      content: 'Old memory content',
      entities: null,
      priority: 0.8,
      confidence: 0.8,
      redactionMap: null,
      tier: 'TIER3',
      sourceThreadId: 'thread1',
      repeats: 1,
      threadSet: JSON.stringify(['thread1']),
      lastSeenTs: twoWeeksAgo,
      deletedAt: null,
    });

    // Manually set updatedAt to 2 weeks ago
    db.prepare('UPDATE memories SET updatedAt = ? WHERE id = ?').run(twoWeeksAgo, memory.id);

    // Run retention job
    const stats = await runRetentionJob(db, config);

    // Check that decay was applied
    const updated = memoryModel.getById(memory.id);
    expect(updated).toBeDefined();
    expect(updated!.priority).toBeLessThan(0.8);
    expect(stats.decayed).toBeGreaterThan(0);
  });

  it('should expire memories past TTL', async () => {
    const now = Date.now();
    const oldDate = now - 95 * 24 * 60 * 60 * 1000; // 95 days ago (past TIER3 TTL of 90)

    // Create old TIER3 memory
    const memory = memoryModel.create({
      userId: 'user1',
      threadId: 'thread1',
      content: 'Expired memory',
      entities: null,
      priority: 0.7,
      confidence: 0.8,
      redactionMap: null,
      tier: 'TIER3',
      sourceThreadId: 'thread1',
      repeats: 1,
      threadSet: JSON.stringify(['thread1']),
      lastSeenTs: oldDate,
      deletedAt: null,
    });

    // Set createdAt and updatedAt to old date
    db.prepare('UPDATE memories SET createdAt = ?, updatedAt = ? WHERE id = ?').run(
      oldDate,
      oldDate,
      memory.id
    );

    // Run retention job
    const stats = await runRetentionJob(db, config);

    // Memory should be soft deleted
    const updated = memoryModel.getById(memory.id);
    expect(updated).toBeDefined();
    expect(updated!.deletedAt).not.toBeNull();
    expect(stats.expired).toBeGreaterThan(0);
  });

  it('should promote TIER3 to TIER1 when cross-thread criteria met', async () => {
    const now = Date.now();

    // Create TIER3 memory with cross-thread activity
    const memory = memoryModel.create({
      userId: 'user1',
      threadId: 'thread1',
      content: 'Cross-thread memory',
      entities: null,
      priority: 0.7,
      confidence: 0.8,
      redactionMap: null,
      tier: 'TIER3',
      sourceThreadId: 'thread1',
      repeats: 3,
      threadSet: JSON.stringify(['thread1', 'thread2', 'thread3']),
      lastSeenTs: now,
      deletedAt: null,
    });

    // Run retention job
    const stats = await runRetentionJob(db, config);

    // Should be promoted to TIER1
    const updated = memoryModel.getById(memory.id);
    expect(updated).toBeDefined();
    expect(updated!.tier).toBe('TIER1');
    expect(stats.promoted).toBeGreaterThan(0);
  });

  it('should demote memories below priority floor', async () => {
    const now = Date.now();
    const twoMonthsAgo = now - 60 * 24 * 60 * 60 * 1000;

    // Create TIER1 memory with low priority (below floor of 0.35)
    const memory = memoryModel.create({
      userId: 'user1',
      threadId: 'thread1',
      content: 'Low priority memory',
      entities: null,
      priority: 0.30, // Below TIER1 floor of 0.35
      confidence: 0.8,
      redactionMap: null,
      tier: 'TIER1',
      sourceThreadId: 'thread1',
      repeats: 2,
      threadSet: JSON.stringify(['thread1', 'thread2']),
      lastSeenTs: twoMonthsAgo,
      deletedAt: null,
    });

    // Run retention job
    const stats = await runRetentionJob(db, config);

    // Should be demoted to TIER3
    const updated = memoryModel.getById(memory.id);
    expect(updated).toBeDefined();
    expect(updated!.tier).toBe('TIER3');
    expect(stats.demoted).toBeGreaterThan(0);
  });

  it('should handle TIER2 with longer TTL', async () => {
    const now = Date.now();
    const sixMonthsAgo = now - 180 * 24 * 60 * 60 * 1000; // 180 days

    // Create TIER2 memory (TTL is 365 days)
    const memory = memoryModel.create({
      userId: 'user1',
      threadId: 'thread1',
      content: 'I prefer TypeScript for all projects',
      entities: null,
      priority: 0.8,
      confidence: 0.8,
      redactionMap: null,
      tier: 'TIER2',
      sourceThreadId: 'thread1',
      repeats: 1,
      threadSet: JSON.stringify(['thread1']),
      lastSeenTs: sixMonthsAgo,
      deletedAt: null,
    });

    // Set dates
    db.prepare('UPDATE memories SET createdAt = ?, updatedAt = ? WHERE id = ?').run(
      sixMonthsAgo,
      sixMonthsAgo,
      memory.id
    );

    // Run retention job
    await runRetentionJob(db, config);

    // Should still be active (not expired)
    const updated = memoryModel.getById(memory.id);
    expect(updated).toBeDefined();
    expect(updated!.deletedAt).toBeNull();
  });

  it('should apply different decay rates per tier', async () => {
    const now = Date.now();
    const twoWeeksAgo = now - 14 * 24 * 60 * 60 * 1000;

    // Create memories in different tiers with same initial priority
    const tier1 = memoryModel.create({
      userId: 'user1',
      threadId: 'thread1',
      content: 'TIER1 memory',
      entities: null,
      priority: 0.8,
      confidence: 0.8,
      redactionMap: null,
      tier: 'TIER1',
      sourceThreadId: 'thread1',
      repeats: 2,
      threadSet: JSON.stringify(['thread1', 'thread2']),
      lastSeenTs: twoWeeksAgo,
      deletedAt: null,
    });

    const tier2 = memoryModel.create({
      userId: 'user1',
      threadId: 'thread1',
      content: 'I prefer TIER2 memory',
      entities: null,
      priority: 0.8,
      confidence: 0.8,
      redactionMap: null,
      tier: 'TIER2',
      sourceThreadId: 'thread1',
      repeats: 1,
      threadSet: JSON.stringify(['thread1']),
      lastSeenTs: twoWeeksAgo,
      deletedAt: null,
    });

    const tier3 = memoryModel.create({
      userId: 'user1',
      threadId: 'thread1',
      content: 'TIER3 memory',
      entities: null,
      priority: 0.8,
      confidence: 0.8,
      redactionMap: null,
      tier: 'TIER3',
      sourceThreadId: 'thread1',
      repeats: 1,
      threadSet: JSON.stringify(['thread1']),
      lastSeenTs: twoWeeksAgo,
      deletedAt: null,
    });

    // Set all to same old date
    for (const mem of [tier1, tier2, tier3]) {
      db.prepare('UPDATE memories SET updatedAt = ? WHERE id = ?').run(twoWeeksAgo, mem.id);
    }

    // Run retention job
    await runRetentionJob(db, config);

    // Get updated priorities
    const updated1 = memoryModel.getById(tier1.id)!;
    const updated2 = memoryModel.getById(tier2.id)!;
    const updated3 = memoryModel.getById(tier3.id)!;

    // TIER2 should decay slowest (0.005/week), TIER3 fastest (0.02/week)
    // After 2 weeks:
    // TIER1: 0.8 - (2 * 0.01) = 0.78
    // TIER2: 0.8 - (2 * 0.005) = 0.79
    // TIER3: 0.8 - (2 * 0.02) = 0.76
    expect(updated2.priority).toBeGreaterThan(updated1.priority); // TIER2 > TIER1
    expect(updated1.priority).toBeGreaterThan(updated3.priority); // TIER1 > TIER3
  });
});

describe('Retention Config', () => {
  it('should load config with correct tier settings', () => {
    const config = loadRetentionConfig();

    expect(config.tiers.TIER1.ttlDays).toBe(120);
    expect(config.tiers.TIER1.decayPerWeek).toBe(0.01);
    expect(config.tiers.TIER1.promotion.minThreads).toBe(2);

    expect(config.tiers.TIER2.ttlDays).toBe(365);
    expect(config.tiers.TIER2.decayPerWeek).toBe(0.005);
    expect(config.tiers.TIER2.demotion.priorityFloor).toBe(0.5);

    expect(config.tiers.TIER3.ttlDays).toBe(90);
    expect(config.tiers.TIER3.decayPerWeek).toBe(0.02);
    expect(config.tiers.TIER3.demotion.priorityFloor).toBe(0.3);
  });
});
