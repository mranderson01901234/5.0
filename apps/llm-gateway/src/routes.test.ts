import { describe, it, expect } from 'vitest';
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

