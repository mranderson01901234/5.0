import { logger } from '../log.js';

export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  retryableStatusCodes?: number[];
  timeoutMs?: number;
}

export interface RetryableError extends Error {
  statusCode?: number;
  retryable?: boolean;
}

export class TimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Request timed out after ${timeoutMs}ms`);
    this.name = 'TimeoutError';
  }
}

export class NonRetryableError extends Error {
  constructor(message: string, public statusCode?: number) {
    super(message);
    this.name = 'NonRetryableError';
  }
}

export async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retryOptions: RetryOptions = {}
): Promise<Response> {
  const {
    maxRetries = 3,
    initialDelayMs = 1000,
    maxDelayMs = 10000,
    retryableStatusCodes = [429, 500, 502, 503, 504],
    timeoutMs = 60000,
  } = retryOptions;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Add delay for retries
      if (attempt > 0) {
        const delayMs = Math.min(
          initialDelayMs * Math.pow(2, attempt - 1),
          maxDelayMs
        );
        logger.debug({ attempt, delayMs }, 'Retry attempt with backoff');
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }

      // Create timeout controller
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        // Handle rate limits with Retry-After header
        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After');
          if (retryAfter && attempt < maxRetries) {
            const retryAfterMs = parseInt(retryAfter, 10) * 1000;
            logger.warn({ retryAfterMs }, 'Rate limited, waiting for retry-after');
            await new Promise(resolve => setTimeout(resolve, retryAfterMs));
            continue;
          }
        }

        // Don't retry client errors (4xx) except rate limits
        if (response.status >= 400 && response.status < 500 && response.status !== 429) {
          const errorText = await response.text();
          throw new NonRetryableError(`HTTP ${response.status}: ${errorText}`, response.status);
        }

        // Retry server errors (5xx) if they're in retryable list
        if (response.status >= 500 && retryableStatusCodes.includes(response.status)) {
          const errorText = await response.text();
          lastError = new Error(`HTTP ${response.status}: ${errorText}`);
          if (attempt < maxRetries) {
            continue;
          } else {
            // Max retries exceeded for server error
            throw lastError;
          }
        }

        return response;
      } catch (error: any) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
          throw new TimeoutError(timeoutMs);
        }
        throw error;
      }
    } catch (error: any) {
      lastError = error;

      // Don't retry non-retryable errors
      if (error instanceof NonRetryableError || error instanceof TimeoutError) {
        throw error;
      }

      // Don't retry content policy violations
      if (error.message?.toLowerCase().includes('content policy')) {
        throw new NonRetryableError(error.message);
      }

      if (attempt === maxRetries) {
        logger.error({ error, attempt, maxRetries }, 'Max retries exceeded');
        throw error;
      }

      logger.warn({ error: error.message, attempt }, 'Request failed, will retry');
    }
  }

  throw lastError || new Error('Failed to fetch after retries');
}
