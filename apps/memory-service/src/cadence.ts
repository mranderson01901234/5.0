/**
 * Cadence Tracker: Monitors thread activity and triggers audits
 * Thresholds: msgCount>=6, tokenCount>=1500, elapsed>=3min, debounce=30s
 */

import { pino } from 'pino';

const logger = pino({ name: 'cadence' });

export interface ThreadState {
  threadId: string;
  userId: string;
  msgCount: number;
  tokenCount: number;
  lastMsgTime: number;
  lastAuditTime?: number;
  firstMsgTime?: number;
}

// Thresholds per blueprint
const MSG_THRESHOLD = 6;
const TOKEN_THRESHOLD = 1500;
const TIME_THRESHOLD_MS = 3 * 60 * 1000; // 3 minutes
const DEBOUNCE_MS = 30 * 1000; // 30 seconds

/**
 * In-memory thread state tracking
 */
export class CadenceTracker {
  private states: Map<string, ThreadState> = new Map();

  /**
   * Record a new message event
   */
  recordMessage(
    userId: string,
    threadId: string,
    tokens: { input: number; output: number },
    timestamp: number = Date.now()
  ): void {
    const key = `${userId}:${threadId}`;
    const existing = this.states.get(key);

    if (!existing) {
      this.states.set(key, {
        threadId,
        userId,
        msgCount: 1,
        tokenCount: tokens.input + tokens.output,
        lastMsgTime: timestamp,
        firstMsgTime: timestamp,
      });
    } else {
      existing.msgCount += 1;
      existing.tokenCount += tokens.input + tokens.output;
      existing.lastMsgTime = timestamp;
      this.states.set(key, existing);
    }

    logger.debug({
      userId,
      threadId,
      msgCount: this.states.get(key)!.msgCount,
      tokenCount: this.states.get(key)!.tokenCount,
    }, 'Message recorded');
  }

  /**
   * Check if audit should be triggered for a thread
   */
  shouldTriggerAudit(userId: string, threadId: string): boolean {
    const key = `${userId}:${threadId}`;
    const state = this.states.get(key);

    if (!state) {
      return false;
    }

    const now = Date.now();

    // Debounce: don't audit more often than every 30s
    if (state.lastAuditTime && now - state.lastAuditTime < DEBOUNCE_MS) {
      logger.debug({ userId, threadId, timeSinceLastAudit: now - state.lastAuditTime }, 'Audit debounced');
      return false;
    }

    // Check thresholds
    const msgMet = state.msgCount >= MSG_THRESHOLD;
    const tokenMet = state.tokenCount >= TOKEN_THRESHOLD;
    const timeMet = state.firstMsgTime ? now - state.firstMsgTime >= TIME_THRESHOLD_MS : false;

    const shouldTrigger = msgMet || tokenMet || timeMet;

    if (shouldTrigger) {
      logger.info({
        userId,
        threadId,
        msgCount: state.msgCount,
        tokenCount: state.tokenCount,
        elapsed: state.firstMsgTime ? now - state.firstMsgTime : 0,
        reason: msgMet ? 'msgCount' : tokenMet ? 'tokenCount' : 'time',
      }, 'Audit triggered');
    }

    return shouldTrigger;
  }

  /**
   * Mark audit as completed and reset counters
   */
  markAuditComplete(userId: string, threadId: string): void {
    const key = `${userId}:${threadId}`;
    const state = this.states.get(key);

    if (!state) return;

    // Reset counters, keep thread alive
    state.msgCount = 0;
    state.tokenCount = 0;
    state.lastAuditTime = Date.now();
    state.firstMsgTime = Date.now(); // Reset window

    this.states.set(key, state);

    logger.debug({ userId, threadId }, 'Audit marked complete');
  }

  /**
   * Get current state for a thread
   */
  getState(userId: string, threadId: string): ThreadState | undefined {
    return this.states.get(`${userId}:${threadId}`);
  }

  /**
   * Clear state for a thread (e.g., after inactivity)
   */
  clearThread(userId: string, threadId: string): void {
    this.states.delete(`${userId}:${threadId}`);
  }

  /**
   * Cleanup stale threads (no activity for 24h)
   */
  cleanup(maxAge: number = 24 * 60 * 60 * 1000): number {
    const now = Date.now();
    let removed = 0;

    for (const [key, state] of this.states.entries()) {
      if (now - state.lastMsgTime > maxAge) {
        this.states.delete(key);
        removed++;
      }
    }

    if (removed > 0) {
      logger.info({ removed, remaining: this.states.size }, 'Cleanup complete');
    }

    return removed;
  }

  /**
   * Get metrics
   */
  getMetrics() {
    return {
      activeThreads: this.states.size,
      threads: Array.from(this.states.values()),
    };
  }
}
