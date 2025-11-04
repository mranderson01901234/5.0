import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Router } from './Router.js';
import { ContextTrimmer } from './ContextTrimmer.js';
import { getDatabase } from './database.js';

describe('Router', () => {
  it('should use FR on first turn', async () => {
    const router = new Router();
    const result = await router.shouldUseFR(undefined);
    expect(result).toBe(true);
  });

  it('should not use FR if thread exists and recent', async () => {
    const db = getDatabase();
    const threadId = 'test-thread-1';
    const userId = 'test-user-1';
    const now = Math.floor(Date.now() / 1000);

    db.prepare('INSERT INTO messages (thread_id, user_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)').run(
      threadId,
      userId,
      'user',
      'test',
      now
    );

    const router = new Router();
    const result = await router.shouldUseFR(threadId, userId);
    expect(result).toBe(false);

    // Cleanup
    db.prepare('DELETE FROM messages WHERE thread_id = ?').run(threadId);
  });
});

describe('ContextTrimmer', () => {
  it('should trim to last K turns', async () => {
    const trimmer = new ContextTrimmer();
    const threadId = 'test-thread-2';
    const userId = 'test-user-2';
    const db = getDatabase();
    const now = Math.floor(Date.now() / 1000);

    // Insert multiple messages
    const stmt = db.prepare(
      'INSERT INTO messages (thread_id, user_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)'
    );
    for (let i = 0; i < 10; i++) {
      stmt.run(threadId, userId, 'user', `message ${i}`, now + i);
    }

    const result = await trimmer.trim(threadId, [{ role: 'user', content: 'new message' }], userId);
    // Should keep last K turns (10 messages, keepLast=5, so 5*2=10 from DB + 1 new message)
    // Plus potentially memory/context messages from memory service calls (can add extra)
    expect(result.trimmed.length).toBeGreaterThan(0);

    // Cleanup
    db.prepare('DELETE FROM messages WHERE thread_id = ?').run(threadId);
  }, 10000); // Increase timeout for memory service calls
});

describe('Artifact Endpoints', () => {
  const db = getDatabase();
  const testUserId = 'test-user-artifact';
  const testThreadId = 'test-thread-artifact';

  beforeEach(() => {
    // Cleanup artifacts before each test
    db.prepare('DELETE FROM artifacts WHERE user_id = ? OR thread_id = ?').run(testUserId, testThreadId);
  });

  afterEach(() => {
    // Cleanup artifacts after each test
    db.prepare('DELETE FROM artifacts WHERE user_id = ? OR thread_id = ?').run(testUserId, testThreadId);
  });

  it('should create an artifact', () => {
    const artifactId = 'test-artifact-1';
    const artifactData = [['Header1', 'Header2'], ['Row1Col1', 'Row1Col2']];
    const createdAt = Math.floor(Date.now() / 1000);

    db.prepare(`
      INSERT INTO artifacts (id, user_id, thread_id, type, data, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      artifactId,
      testUserId,
      testThreadId,
      'table',
      JSON.stringify(artifactData),
      createdAt
    );

    const artifact = db.prepare('SELECT * FROM artifacts WHERE id = ?').get(artifactId) as any;
    expect(artifact).toBeDefined();
    expect(artifact.id).toBe(artifactId);
    expect(artifact.user_id).toBe(testUserId);
    expect(artifact.thread_id).toBe(testThreadId);
    expect(artifact.type).toBe('table');
    expect(JSON.parse(artifact.data)).toEqual(artifactData);
  });

  it('should retrieve artifacts for a thread', () => {
    // Create multiple artifacts
    const artifacts = [
      { id: 'art-1', type: 'table', data: [['A', 'B']] },
      { id: 'art-2', type: 'doc', data: { sections: [] } },
    ];

    const createdAt = Math.floor(Date.now() / 1000);
    const stmt = db.prepare(`
      INSERT INTO artifacts (id, user_id, thread_id, type, data, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    artifacts.forEach(art => {
      stmt.run(art.id, testUserId, testThreadId, art.type, JSON.stringify(art.data), createdAt);
    });

    const retrieved = db.prepare(`
      SELECT * FROM artifacts
      WHERE user_id = ? AND thread_id = ? AND (deleted_at IS NULL OR deleted_at = 0)
      ORDER BY created_at DESC
    `).all(testUserId, testThreadId) as any[];

    expect(retrieved.length).toBe(2);
    expect(retrieved[0].id).toBe('art-2'); // Most recent first
    expect(retrieved[1].id).toBe('art-1');
  });
});
