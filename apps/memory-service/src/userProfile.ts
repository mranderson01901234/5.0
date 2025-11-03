/**
 * User Profile System - Phase 1
 * 
 * Extracts user preferences and behavior patterns from memories to personalize chat experience
 * 
 * Features:
 * - Profile extraction from TIER1/TIER2 memories
 * - Redis caching for fast access
 * - SQLite persistence for profile history
 * - Automatic profile updates
 */

import { pino } from 'pino';
import type { Memory } from '@llm-gateway/shared';
import { get, set, del } from './redis.js';

const logger = pino({ name: 'userProfile' });

// Profile cache TTL: 1 hour
const PROFILE_CACHE_TTL = 3600;

/**
 * Extract tech stack from memories
 * Looks for technologies mentioned multiple times across TIER1/TIER2 memories
 */
function extractTechStack(memories: Memory[]): string[] {
  const techKeywords = new Map<string, number>();
  
  // Common tech stack patterns
  const techPatterns = [
    // Languages
    /\b(typescript|javascript|python|java|c\+\+|go|rust|kotlin|swift|php|ruby|scala)\b/gi,
    // Frameworks
    /\b(react|vue|angular|next\.js|nuxt|svelte|express|fastapi|flask|django|spring|nestjs|fastify)\b/gi,
    // Databases
    /\b(postgresql|mysql|mongodb|redis|cassandra|dynamodb|sqlite|elasticsearch)\b/gi,
    // Tools
    /\b(webpack|vite|docker|kubernetes|aws|azure|gcp|terraform|ansible)\b/gi,
  ];
  
  for (const memory of memories) {
    const content = memory.content.toLowerCase();
    
    for (const pattern of techPatterns) {
      const matches = content.match(pattern);
      if (matches) {
        for (const match of matches) {
          const normalized = match.toLowerCase();
          techKeywords.set(normalized, (techKeywords.get(normalized) || 0) + memory.priority);
        }
      }
    }
  }
  
  // Return top technologies by frequency * priority
  return Array.from(techKeywords.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([tech]) => tech);
}

/**
 * Extract domains of interest from memories
 * Looks for topic clusters in TIER2 (preferences/goals) memories
 */
function extractDomainsOfInterest(memories: Memory[]): string[] {
  const domainKeywords = new Map<string, number>();
  
  // Domain patterns
  const domainPatterns = [
    // Development areas
    /\b(frontend|backend|full.?stack|mobile|android|ios|desktop|web.?app)\b/gi,
    // Specializations
    /\b(ai|machine.?learning|ml|data.?science|devops|security|cloud|blockchain)\b/gi,
    // Application types
    /\b(saas|e.?commerce|fintech|healthtech|edtech|social.?media|gaming)\b/gi,
  ];
  
  for (const memory of memories) {
    if (memory.tier !== 'TIER2') continue; // Only from preferences
    
    const content = memory.content.toLowerCase();
    
    for (const pattern of domainPatterns) {
      const matches = content.match(pattern);
      if (matches) {
        for (const match of matches) {
          const normalized = match.toLowerCase().replace(/\s+/g, '-');
          domainKeywords.set(normalized, (domainKeywords.get(normalized) || 0) + memory.priority);
        }
      }
    }
  }
  
  // Return top domains by frequency * priority
  return Array.from(domainKeywords.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([domain]) => domain);
}

/**
 * Infer expertise level from memory patterns
 */
function inferExpertiseLevel(memories: Memory[]): 'beginner' | 'intermediate' | 'expert' | undefined {
  if (memories.length === 0) return undefined;
  
  // Simple heuristics based on content complexity and technical terms
  let expertiseScore = 0;
  
  const expertIndicators = [
    /\b(architect|design|pattern|implementation|optimization|scalability|microservices)\b/gi,
    /\b(algorithm|complexity|time.?complexity|space.?complexity)\b/gi,
    /\b(refactor|refactoring|legacy|maintenance|technical.?debt)\b/gi,
  ];
  
  const beginnerIndicators = [
    /\b(how do i|getting started|tutorial|learn|new to)\b/gi,
    /\b(what is|what does|basics|introduction|beginner)\b/gi,
    /\b(first time|never used|never tried|dont understand)\b/gi,
  ];
  
  for (const memory of memories) {
    const content = memory.content.toLowerCase();
    
    // Check for expert indicators
    for (const pattern of expertIndicators) {
      if (pattern.test(content)) {
        expertiseScore += 2 * memory.priority;
      }
    }
    
    // Check for beginner indicators
    for (const pattern of beginnerIndicators) {
      if (pattern.test(content)) {
        expertiseScore -= 1.5 * memory.priority;
      }
    }
  }
  
  // Normalize by number of memories
  expertiseScore = expertiseScore / memories.length;
  
  if (expertiseScore > 0.3) return 'expert';
  if (expertiseScore < -0.2) return 'beginner';
  return 'intermediate';
}

/**
 * Infer communication style preference from interaction patterns
 */
function inferCommunicationStyle(memories: Memory[]): 'concise' | 'balanced' | 'detailed' | undefined {
  if (memories.length < 3) return undefined;
  
  // Count preference indicators
  let conciseCount = 0;
  let detailedCount = 0;
  
  const conciseIndicators = [
    /\b(brief|short|quick|simple|just|only)\b/gi,
    /\b(summary|tl.?dr|in.?one.?sentence)\b/gi,
  ];
  
  const detailedIndicators = [
    /\b(detail|comprehensive|explain|elaborate|in.?depth|thorough)\b/gi,
    /\b(how.?does?.?it?.?work|why|mechanism|implementation)\b/gi,
  ];
  
  for (const memory of memories) {
    const content = memory.content.toLowerCase();
    
    for (const pattern of conciseIndicators) {
      if (pattern.test(content)) conciseCount++;
    }
    
    for (const pattern of detailedIndicators) {
      if (pattern.test(content)) detailedCount++;
    }
  }
  
  if (detailedCount > conciseCount * 1.5) return 'detailed';
  if (conciseCount > detailedCount * 1.5) return 'concise';
  return 'balanced';
}

/**
 * Build user profile from memories
 */
export async function buildUserProfile(userId: string, memories: Memory[]): Promise<any> {
  // Filter to TIER1 (cross-thread) and TIER2 (preferences) memories
  const relevantMemories = memories.filter(m => m.tier === 'TIER1' || m.tier === 'TIER2');
  
  if (relevantMemories.length === 0) {
    logger.debug({ userId }, 'No relevant memories for profile building');
    return null;
  }
  
  const techStack = extractTechStack(relevantMemories);
  const domainsOfInterest = extractDomainsOfInterest(relevantMemories);
  const expertiseLevel = inferExpertiseLevel(relevantMemories);
  const communicationStyle = inferCommunicationStyle(relevantMemories);
  
  const profile = {
    userId,
    lastUpdated: Date.now(),
    techStack,
    domainsOfInterest,
    expertiseLevel,
    communicationStyle,
    preferredComplexity: undefined,
    avgQuestionsPerSession: 0,
    topicsPerWeek: [],
    trustedDomains: {},
    dislikedFormats: [],
  };
  
  logger.info({ 
    userId, 
    techStackCount: techStack.length, 
    domainsCount: domainsOfInterest.length,
    expertiseLevel,
    communicationStyle 
  }, 'User profile built');
  
  return profile;
}

/**
 * Get user profile from cache, DB, or build it
 */
export async function getUserProfile(userId: string, profileModel: any): Promise<any | null> {
  // Try cache first
  const cacheKey = `userProfile:${userId}`;
  try {
    const cached = await get(cacheKey);
    if (cached) {
      const profile = JSON.parse(cached);
      logger.debug({ userId }, 'Profile cache hit');
      return profile;
    }
  } catch (error) {
    logger.debug({ error, userId }, 'Failed to get profile from cache');
  }
  
  // Try DB next
  try {
    const dbProfile = profileModel.get(userId);
    if (dbProfile) {
      logger.debug({ userId }, 'Profile DB hit');
      // Update cache
      try {
        await set(cacheKey, JSON.stringify(dbProfile), PROFILE_CACHE_TTL);
      } catch (error) {
        logger.debug({ error, userId }, 'Failed to cache profile from DB');
      }
      return dbProfile;
    }
  } catch (error) {
    logger.debug({ error, userId }, 'Failed to get profile from DB');
  }
  
  // Build profile from memories
  try {
    const db = profileModel.db; // Access underlying db
    const memories = db.prepare(`
      SELECT * FROM memories 
      WHERE userId = ? AND deletedAt IS NULL
      ORDER BY priority DESC, updatedAt DESC
      LIMIT 100
    `).all(userId) as Memory[];
    
    const profile = await buildUserProfile(userId, memories);
    
    // Save to DB if profile was built
    if (profile) {
      try {
        profileModel.save(userId, profile);
        logger.debug({ userId }, 'Profile saved to DB');
      } catch (error) {
        logger.warn({ error, userId }, 'Failed to save profile to DB');
      }
      
      // Cache the profile
      try {
        await set(cacheKey, JSON.stringify(profile), PROFILE_CACHE_TTL);
        logger.debug({ userId }, 'Profile cached');
      } catch (error) {
        logger.warn({ error, userId }, 'Failed to cache profile');
      }
    }
    
    return profile;
  } catch (error) {
    logger.error({ error, userId }, 'Failed to build user profile');
    return null;
  }
}

/**
 * Invalidate user profile cache (call when memories change)
 */
export async function invalidateUserProfile(userId: string): Promise<void> {
  const cacheKey = `userProfile:${userId}`;
  try {
    await del(cacheKey);
    logger.debug({ userId }, 'Profile cache invalidated');
  } catch (error) {
    logger.debug({ error, userId }, 'Failed to invalidate profile cache');
  }
}

