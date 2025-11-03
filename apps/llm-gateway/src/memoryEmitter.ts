/**
 * Memory Event Emitter - Fire-and-forget HTTP POST
 * Max 50ms timeout, never blocks chat path
 */

import type { MessageEvent } from '@llm-gateway/shared';

const MEMORY_SERVICE_URL = process.env.MEMORY_SERVICE_URL || 'http://localhost:3001';
const TIMEOUT_MS = 50;

/**
 * Emit message event to memory service
 * Fire-and-forget: errors are logged but never thrown
 */
export async function emitMessageEvent(event: MessageEvent): Promise<void> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`${MEMORY_SERVICE_URL}/v1/events/message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': event.userId, // Pass userId for internal service auth
        'x-internal-service': 'gateway', // Mark as internal call
      },
      body: JSON.stringify(event),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn('Memory service returned non-ok status', {
        status: response.status,
        statusText: response.statusText,
      });
    }
  } catch (error) {
    clearTimeout(timeoutId);

    // Silently log timeout/network errors
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        console.debug('Memory event timed out (>50ms)', { userId: event.userId, threadId: event.threadId });
      } else {
        console.warn('Memory event failed', { error: error.message, userId: event.userId });
      }
    }
  }
}
