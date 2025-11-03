/**
 * Retention & Decay Job
 *
 * Handles:
 * - Tier-based TTL enforcement
 * - Weekly decay of priority scores
 * - Promotion/demotion between tiers
 * - Soft deletion of expired memories
 */

import type { DatabaseConnection } from './db';
import type { Memory } from '@llm-gateway/shared';
import { pino } from 'pino';
import { loadTierConfig, type MemoryTier } from './scorer';

const logger = pino({ name: 'retention' });

export interface RetentionConfig {
  tiers: Record<
    MemoryTier,
    {
      name: string;
      ttlDays: number;
      decayPerWeek: number;
      promotion: {
        minThreads?: number;
        minRepeats?: number;
        pinOnEdit?: boolean;
      };
      demotion: {
        priorityFloor: number;
      };
    }
  >;
}

export interface RetentionStats {
  decayed: number;
  promoted: number;
  demoted: number;
  expired: number;
  scanned: number;
}

/**
 * Run retention job - applies decay, TTL, and tier transitions
 */
export async function runRetentionJob(
  db: DatabaseConnection,
  config: RetentionConfig
): Promise<RetentionStats> {
  const stats: RetentionStats = {
    decayed: 0,
    promoted: 0,
    demoted: 0,
    expired: 0,
    scanned: 0,
  };

  const now = Date.now();
  const oneWeekMs = 7 * 24 * 60 * 60 * 1000;

  try {
    // Get all active memories
    const memories = db
      .prepare(
        `SELECT * FROM memories
         WHERE deletedAt IS NULL
         ORDER BY tier, updatedAt DESC`
      )
      .all() as Memory[];

    stats.scanned = memories.length;

    for (const memory of memories) {
      const tier = (memory.tier || 'TIER3') as MemoryTier;
      const tierConfig = config.tiers[tier];

      // Calculate age
      const ageMs = now - memory.updatedAt;
      const ageDays = ageMs / (24 * 60 * 60 * 1000);
      const ageWeeks = ageMs / oneWeekMs;

      // 1. TTL Check - Soft delete if expired
      if (ageDays > tierConfig.ttlDays) {
        db.prepare(
          `UPDATE memories
           SET deletedAt = ?, updatedAt = ?
           WHERE id = ?`
        ).run(now, now, memory.id);

        stats.expired++;
        logger.debug({ memoryId: memory.id, tier, ageDays }, 'Memory expired');
        continue;
      }

      // 2. Apply Weekly Decay
      const decayAmount = tierConfig.decayPerWeek * Math.floor(ageWeeks);
      if (decayAmount > 0) {
        const newPriority = Math.max(0, memory.priority - decayAmount);

        db.prepare(
          `UPDATE memories
           SET priority = ?, updatedAt = ?
           WHERE id = ?`
        ).run(newPriority, now, memory.id);

        stats.decayed++;
        logger.debug(
          { memoryId: memory.id, oldPriority: memory.priority, newPriority, decayAmount },
          'Applied decay'
        );

        // Update memory reference for demotion check
        memory.priority = newPriority;
      }

      // 3. Check for Promotion
      const promoted = checkPromotion(db, memory, tier, tierConfig, now);
      if (promoted) stats.promoted++;

      // 4. Check for Demotion (priority floor)
      const demoted = checkDemotion(db, memory, tier, tierConfig, now);
      if (demoted) stats.demoted++;
    }

    logger.info(stats, 'Retention job completed');
    return stats;
  } catch (error) {
    logger.error({ error }, 'Retention job failed');
    throw error;
  }
}

/**
 * Check if memory should be promoted to higher tier
 */
function checkPromotion(
  db: DatabaseConnection,
  memory: Memory,
  currentTier: MemoryTier,
  tierConfig: RetentionConfig['tiers'][MemoryTier],
  now: number
): boolean {
  // Parse threadSet
  let threadSet: string[] = [];
  try {
    threadSet = memory.threadSet ? JSON.parse(memory.threadSet) : [];
  } catch {
    threadSet = [];
  }

  const repeats = memory.repeats || 1;

  // TIER3 -> TIER1 (cross-thread)
  if (currentTier === 'TIER3') {
    const minThreads = tierConfig.promotion.minThreads || 2;
    const minRepeats = tierConfig.promotion.minRepeats || 2;

    if (threadSet.length >= minThreads && repeats >= minRepeats) {
      db.prepare(
        `UPDATE memories
         SET tier = 'TIER1', updatedAt = ?
         WHERE id = ?`
      ).run(now, memory.id);

      logger.info(
        { memoryId: memory.id, from: 'TIER3', to: 'TIER1', threads: threadSet.length, repeats },
        'Promoted memory'
      );
      return true;
    }
  }

  return false;
}

/**
 * Check if memory should be demoted to lower tier
 */
function checkDemotion(
  db: DatabaseConnection,
  memory: Memory,
  currentTier: MemoryTier,
  tierConfig: RetentionConfig['tiers'][MemoryTier],
  now: number
): boolean {
  const priorityFloor = tierConfig.demotion.priorityFloor;

  // If priority falls below floor, demote to TIER3
  if (memory.priority < priorityFloor && currentTier !== 'TIER3') {
    db.prepare(
      `UPDATE memories
       SET tier = 'TIER3', updatedAt = ?
       WHERE id = ?`
    ).run(now, memory.id);

    logger.info(
      { memoryId: memory.id, from: currentTier, to: 'TIER3', priority: memory.priority },
      'Demoted memory'
    );
    return true;
  }

  return false;
}

/**
 * Schedule retention job to run periodically
 */
export function scheduleRetentionJob(
  db: DatabaseConnection,
  config: RetentionConfig,
  intervalMs: number = 24 * 60 * 60 * 1000 // Default: daily
): NodeJS.Timeout {
  logger.info({ intervalMs }, 'Scheduling retention job');

  const timer = setInterval(async () => {
    try {
      await runRetentionJob(db, config);
    } catch (error) {
      logger.error({ error }, 'Retention job failed');
    }
  }, intervalMs);

  // Run immediately on startup
  runRetentionJob(db, config).catch(error => {
    logger.error({ error }, 'Initial retention job failed');
  });

  return timer;
}

/**
 * Load retention config from memory.json structure
 */
export function loadRetentionConfig(): RetentionConfig {
  // In production, load from config file
  // For now, return hardcoded defaults matching memory.json
  return {
    tiers: {
      TIER1: {
        name: 'cross_recent',
        ttlDays: 120,
        decayPerWeek: 0.01,
        promotion: {
          minThreads: 2,
          minRepeats: 2,
        },
        demotion: {
          priorityFloor: 0.35,
        },
      },
      TIER2: {
        name: 'prefs_goals',
        ttlDays: 365,
        decayPerWeek: 0.005,
        promotion: {
          pinOnEdit: true,
          minRepeats: 1,
        },
        demotion: {
          priorityFloor: 0.5,
        },
      },
      TIER3: {
        name: 'general',
        ttlDays: 90,
        decayPerWeek: 0.02,
        promotion: {
          minThreads: 3,
          minRepeats: 3,
        },
        demotion: {
          priorityFloor: 0.3,
        },
      },
    },
  };
}
