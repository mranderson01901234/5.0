import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CadenceTracker } from '../src/cadence.js';

describe('Cadence Tracker', () => {
  let tracker: CadenceTracker;

  beforeEach(() => {
    tracker = new CadenceTracker();
  });

  it('should record message events', () => {
    tracker.recordMessage('user1', 'thread1', { input: 100, output: 50 });

    const state = tracker.getState('user1', 'thread1');
    expect(state).toBeTruthy();
    expect(state?.msgCount).toBe(1);
    expect(state?.tokenCount).toBe(150);
  });

  it('should accumulate messages and tokens', () => {
    tracker.recordMessage('user1', 'thread1', { input: 100, output: 50 });
    tracker.recordMessage('user1', 'thread1', { input: 200, output: 100 });
    tracker.recordMessage('user1', 'thread1', { input: 150, output: 75 });

    const state = tracker.getState('user1', 'thread1');
    expect(state?.msgCount).toBe(3);
    expect(state?.tokenCount).toBe(675); // 150 + 300 + 225
  });

  it('should trigger audit when message count >= 6', () => {
    for (let i = 0; i < 5; i++) {
      tracker.recordMessage('user1', 'thread1', { input: 10, output: 10 });
    }

    expect(tracker.shouldTriggerAudit('user1', 'thread1')).toBe(false);

    tracker.recordMessage('user1', 'thread1', { input: 10, output: 10 });
    expect(tracker.shouldTriggerAudit('user1', 'thread1')).toBe(true);
  });

  it('should trigger audit when token count >= 1500', () => {
    tracker.recordMessage('user1', 'thread1', { input: 500, output: 500 });
    expect(tracker.shouldTriggerAudit('user1', 'thread1')).toBe(false);

    tracker.recordMessage('user1', 'thread1', { input: 300, output: 300 });
    expect(tracker.shouldTriggerAudit('user1', 'thread1')).toBe(true);
  });

  it('should trigger audit when time >= 3 minutes', async () => {
    vi.useFakeTimers();
    const now = Date.now();
    vi.setSystemTime(now);

    tracker.recordMessage('user1', 'thread1', { input: 10, output: 10 });

    expect(tracker.shouldTriggerAudit('user1', 'thread1')).toBe(false);

    // Advance time by 3 minutes
    vi.setSystemTime(now + 3 * 60 * 1000);

    expect(tracker.shouldTriggerAudit('user1', 'thread1')).toBe(true);

    vi.useRealTimers();
  });

  it('should debounce audits (30s minimum)', async () => {
    vi.useFakeTimers();
    const now = Date.now();
    vi.setSystemTime(now);

    // Trigger first audit
    for (let i = 0; i < 6; i++) {
      tracker.recordMessage('user1', 'thread1', { input: 10, output: 10 });
    }

    expect(tracker.shouldTriggerAudit('user1', 'thread1')).toBe(true);
    tracker.markAuditComplete('user1', 'thread1');

    // Add more messages immediately
    for (let i = 0; i < 6; i++) {
      tracker.recordMessage('user1', 'thread1', { input: 10, output: 10 });
    }

    // Should be debounced
    expect(tracker.shouldTriggerAudit('user1', 'thread1')).toBe(false);

    // Advance time by 30 seconds
    vi.setSystemTime(now + 31 * 1000);

    // Now should trigger
    expect(tracker.shouldTriggerAudit('user1', 'thread1')).toBe(true);

    vi.useRealTimers();
  });

  it('should reset counters after audit', () => {
    for (let i = 0; i < 6; i++) {
      tracker.recordMessage('user1', 'thread1', { input: 10, output: 10 });
    }

    tracker.markAuditComplete('user1', 'thread1');

    const state = tracker.getState('user1', 'thread1');
    expect(state?.msgCount).toBe(0);
    expect(state?.tokenCount).toBe(0);
    expect(state?.lastAuditTime).toBeTruthy();
  });

  it('should handle multiple threads independently', () => {
    tracker.recordMessage('user1', 'thread1', { input: 100, output: 50 });
    tracker.recordMessage('user1', 'thread2', { input: 200, output: 100 });

    const state1 = tracker.getState('user1', 'thread1');
    const state2 = tracker.getState('user1', 'thread2');

    expect(state1?.tokenCount).toBe(150);
    expect(state2?.tokenCount).toBe(300);
  });

  it('should cleanup stale threads', async () => {
    vi.useFakeTimers();
    const now = Date.now();
    vi.setSystemTime(now);

    tracker.recordMessage('user1', 'thread1', { input: 10, output: 10 });
    tracker.recordMessage('user1', 'thread2', { input: 10, output: 10 });

    // Advance time by 25 hours
    vi.setSystemTime(now + 25 * 60 * 60 * 1000);

    const removed = tracker.cleanup();
    expect(removed).toBe(2);

    expect(tracker.getState('user1', 'thread1')).toBeUndefined();
    expect(tracker.getState('user1', 'thread2')).toBeUndefined();

    vi.useRealTimers();
  });

  it('should not cleanup recent threads', () => {
    tracker.recordMessage('user1', 'thread1', { input: 10, output: 10 });

    const removed = tracker.cleanup(1 * 60 * 60 * 1000); // 1 hour
    expect(removed).toBe(0);

    expect(tracker.getState('user1', 'thread1')).toBeTruthy();
  });

  it('should provide metrics', () => {
    tracker.recordMessage('user1', 'thread1', { input: 10, output: 10 });
    tracker.recordMessage('user2', 'thread2', { input: 10, output: 10 });

    const metrics = tracker.getMetrics();
    expect(metrics.activeThreads).toBe(2);
    expect(metrics.threads.length).toBe(2);
  });

  it('should clear specific thread', () => {
    tracker.recordMessage('user1', 'thread1', { input: 10, output: 10 });
    tracker.clearThread('user1', 'thread1');

    expect(tracker.getState('user1', 'thread1')).toBeUndefined();
  });
});
