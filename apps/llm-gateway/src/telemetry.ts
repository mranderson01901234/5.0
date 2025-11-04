/**
 * Telemetry Event Store
 * Uses Redis pub/sub for distributed telemetry with in-memory fallback
 */

import { getRedis, isRedisAvailable } from './redis.js';
import { logger } from './log.js';

export interface TelemetryEvent {
  event: string;
  userId?: string;
  threadId?: string;
  artifactId?: string;
  exportId?: string;
  format?: string;
  timestamp: number;
  [key: string]: unknown;
}

const TELEMETRY_CHANNEL = 'telemetry_events';
const TELEMETRY_HISTORY_KEY = 'telemetry:history';
const MAX_HISTORY_EVENTS = 1000; // Keep last 1000 events in Redis

class TelemetryStore {
  private events: TelemetryEvent[] = []; // In-memory fallback
  private maxEvents = 1000; // Keep last 1000 events in memory
  private listeners: Set<(event: TelemetryEvent) => void> = new Set();
  private redisSubscriber: any = null;

  /**
   * Add a telemetry event (publishes to Redis if available)
   */
  async addEvent(event: TelemetryEvent): Promise<void> {
    // Ensure timestamp is set
    if (!event.timestamp) {
      event.timestamp = Date.now();
    }

    // Add to in-memory store (always, for fallback)
    this.events.push(event);
    
    // Trim old events
    if (this.events.length > this.maxEvents) {
      this.events.shift();
    }

    // Publish to Redis if available
    const redis = getRedis();
    if (redis && isRedisAvailable()) {
      try {
        // Publish to channel for real-time subscribers
        await redis.publish(TELEMETRY_CHANNEL, JSON.stringify(event));

        // Store in history list (keep last N events)
        await redis.lpush(TELEMETRY_HISTORY_KEY, JSON.stringify(event));
        await redis.ltrim(TELEMETRY_HISTORY_KEY, 0, MAX_HISTORY_EVENTS - 1);
      } catch (error: any) {
        logger.warn({ error: error.message }, 'Failed to publish telemetry event to Redis');
      }
    }

    // Notify local listeners
    this.listeners.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        // Ignore listener errors
      }
    });
  }

  /**
   * Get recent events from Redis (if available) or in-memory fallback
   */
  async getRecentEvents(limit: number = 100): Promise<TelemetryEvent[]> {
    const redis = getRedis();
    
    if (redis && isRedisAvailable()) {
      try {
        // Get from Redis history
        const events = await redis.lrange(TELEMETRY_HISTORY_KEY, 0, limit - 1);
        return events
          .map((e: string) => {
            try {
              return JSON.parse(e) as TelemetryEvent;
            } catch {
              return null;
            }
          })
          .filter((e: TelemetryEvent | null): e is TelemetryEvent => e !== null)
          .reverse(); // Most recent first
      } catch (error: any) {
        logger.warn({ error: error.message }, 'Failed to get events from Redis, using in-memory fallback');
      }
    }

    // Fallback to in-memory
    return this.events.slice(-limit);
  }

  /**
   * Get events by type
   */
  async getEventsByType(eventType: string, limit: number = 100): Promise<TelemetryEvent[]> {
    const allEvents = await this.getRecentEvents(MAX_HISTORY_EVENTS);
    return allEvents
      .filter(e => e.event === eventType)
      .slice(0, limit);
  }

  /**
   * Get events since timestamp
   */
  async getEventsSince(timestamp: number): Promise<TelemetryEvent[]> {
    const allEvents = await this.getRecentEvents(MAX_HISTORY_EVENTS);
    return allEvents.filter(e => e.timestamp >= timestamp);
  }

  /**
   * Subscribe to new events (via Redis pub/sub if available, otherwise in-memory)
   */
  subscribe(listener: (event: TelemetryEvent) => void): () => void {
    const redis = getRedis();
    
    if (redis && isRedisAvailable() && !this.redisSubscriber) {
      // Subscribe to Redis channel
      this.redisSubscriber = redis.duplicate();
      this.redisSubscriber.subscribe(TELEMETRY_CHANNEL);
      
      this.redisSubscriber.on('message', (channel: string, message: string) => {
        try {
          const event = JSON.parse(message) as TelemetryEvent;
          this.listeners.forEach(l => {
            try {
              l(event);
            } catch (error) {
              // Ignore listener errors
            }
          });
        } catch (error) {
          logger.warn({ error }, 'Failed to parse telemetry event from Redis');
        }
      });
    }

    // Always add to local listeners (for in-memory fallback)
    this.listeners.add(listener);
    
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Get counts by event type
   */
  async getCounts(): Promise<Record<string, number>> {
    const allEvents = await this.getRecentEvents(MAX_HISTORY_EVENTS);
    const counts: Record<string, number> = {};
    allEvents.forEach(event => {
      counts[event.event] = (counts[event.event] || 0) + 1;
    });
    return counts;
  }

  /**
   * Cleanup Redis subscriber
   */
  async close(): Promise<void> {
    if (this.redisSubscriber) {
      await this.redisSubscriber.unsubscribe();
      await this.redisSubscriber.quit();
      this.redisSubscriber = null;
    }
  }
}

export const telemetryStore = new TelemetryStore();

