import { logger } from '../log.js';

// Simple concurrency control for image generation
// Prevents abuse and manages system load

interface UserLimit {
  concurrent: number; // Current concurrent requests
  dailyCount: number; // Images generated today
  dailyResetTime: number; // When to reset daily count
}

const USER_LIMITS = new Map<string, UserLimit>();

const MAX_CONCURRENT_PER_USER = 2; // Max 2 concurrent image generations per user
const MAX_DAILY_PER_USER = 100; // Max 100 images per day per user
const GLOBAL_MAX_CONCURRENT = 10; // Max 10 total concurrent generations across all users

let globalConcurrent = 0;

/**
 * Check if user can start a new image generation
 */
export function canGenerateImage(userId: string): { allowed: boolean; reason?: string } {
  // Check global limit
  if (globalConcurrent >= GLOBAL_MAX_CONCURRENT) {
    return {
      allowed: false,
      reason: 'System is at capacity. Please try again in a moment.'
    };
  }

  const userLimit = getUserLimit(userId);

  // Check concurrent limit
  if (userLimit.concurrent >= MAX_CONCURRENT_PER_USER) {
    return {
      allowed: false,
      reason: `You have ${userLimit.concurrent} images generating. Please wait for them to complete.`
    };
  }

  // Check daily limit
  if (userLimit.dailyCount >= MAX_DAILY_PER_USER) {
    const hoursUntilReset = Math.ceil((userLimit.dailyResetTime - Date.now()) / (60 * 60 * 1000));
    return {
      allowed: false,
      reason: `Daily limit of ${MAX_DAILY_PER_USER} images reached. Resets in ${hoursUntilReset} hours.`
    };
  }

  return { allowed: true };
}

/**
 * Acquire a generation slot for the user
 */
export function acquireGenerationSlot(userId: string): void {
  const userLimit = getUserLimit(userId);
  userLimit.concurrent++;
  globalConcurrent++;

  logger.debug({
    userId,
    userConcurrent: userLimit.concurrent,
    globalConcurrent,
    dailyCount: userLimit.dailyCount
  }, 'Image generation slot acquired');
}

/**
 * Release a generation slot and increment daily count
 */
export function releaseGenerationSlot(userId: string, success: boolean): void {
  const userLimit = getUserLimit(userId);

  if (userLimit.concurrent > 0) {
    userLimit.concurrent--;
  }

  if (globalConcurrent > 0) {
    globalConcurrent--;
  }

  // Only count successful generations toward daily limit
  if (success) {
    userLimit.dailyCount++;
  }

  logger.debug({
    userId,
    userConcurrent: userLimit.concurrent,
    globalConcurrent,
    dailyCount: userLimit.dailyCount,
    success
  }, 'Image generation slot released');
}

/**
 * Get or create user limit tracking
 */
function getUserLimit(userId: string): UserLimit {
  const now = Date.now();
  let limit = USER_LIMITS.get(userId);

  if (!limit) {
    // Create new limit
    limit = {
      concurrent: 0,
      dailyCount: 0,
      dailyResetTime: getNextMidnight()
    };
    USER_LIMITS.set(userId, limit);
  } else if (now >= limit.dailyResetTime) {
    // Reset daily count
    limit.dailyCount = 0;
    limit.dailyResetTime = getNextMidnight();
    logger.debug({ userId }, 'Daily image limit reset');
  }

  return limit;
}

/**
 * Get timestamp for next midnight (local time)
 */
function getNextMidnight(): number {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  return midnight.getTime();
}

/**
 * Get current concurrency stats
 */
export function getConcurrencyStats(): {
  globalConcurrent: number;
  globalMaxConcurrent: number;
  activeUsers: number;
} {
  return {
    globalConcurrent,
    globalMaxConcurrent: GLOBAL_MAX_CONCURRENT,
    activeUsers: USER_LIMITS.size
  };
}

/**
 * Get user's current usage
 */
export function getUserUsage(userId: string): {
  concurrent: number;
  dailyCount: number;
  dailyLimit: number;
  concurrentLimit: number;
} {
  const limit = getUserLimit(userId);

  return {
    concurrent: limit.concurrent,
    dailyCount: limit.dailyCount,
    dailyLimit: MAX_DAILY_PER_USER,
    concurrentLimit: MAX_CONCURRENT_PER_USER
  };
}

// Cleanup inactive users every hour
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;

  for (const [userId, limit] of USER_LIMITS.entries()) {
    // Remove if no concurrent requests and daily count is 0
    if (limit.concurrent === 0 && limit.dailyCount === 0) {
      USER_LIMITS.delete(userId);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    logger.debug({ cleaned }, 'Cleaned up inactive user limits');
  }
}, 60 * 60 * 1000);
