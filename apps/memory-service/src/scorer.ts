/**
 * Quality Scorer: Q = 0.4*relevance + 0.3*importance + 0.2*recency + 0.1*coherence
 * Per MEMORY_BLUEPRINT.md scoring rules
 * Tier-aware: Applies tier-specific weights and detection
 */

import type { Memory } from '@llm-gateway/shared';

export interface ScoringFactors {
  relevance: number;     // 0-1: Entity density, technical terms, specificity
  importance: number;    // 0-1: User preferences, decisions, constraints
  recency: number;       // 0-1: Recent messages score higher
  coherence: number;     // 0-1: Length, structure, completeness
}

export interface ScoringInput {
  content: string;
  role: 'user' | 'assistant' | 'system';
  timestamp: number;
  threadStartTime?: number;
  userId?: string;       // For cross-thread detection
  threadId?: string;     // For cross-thread detection
}

export type MemoryTier = 'TIER1' | 'TIER2' | 'TIER3';

export interface TierConfig {
  name: string;
  scoreWeights: {
    relevance: number;
    importance: number;
    recency: number;
    coherence: number;
  };
  saveThreshold: number;
  ttlDays: number;
  decayPerWeek: number;
}

// LRU cache for cross-thread detection (userId -> Set<content hashes>)
class CrossThreadCache {
  private cache = new Map<string, Map<string, { threadId: string; timestamp: number }>>();
  private maxEntriesPerUser = 500;

  add(userId: string, contentHash: string, threadId: string): boolean {
    if (!this.cache.has(userId)) {
      this.cache.set(userId, new Map());
    }

    const userCache = this.cache.get(userId)!;
    const existing = userCache.get(contentHash);

    // If found in different thread, it's cross-thread
    if (existing && existing.threadId !== threadId) {
      existing.timestamp = Date.now();
      return true;
    }

    // Add new entry
    if (!existing) {
      userCache.set(contentHash, { threadId, timestamp: Date.now() });

      // Evict oldest if exceeds limit
      if (userCache.size > this.maxEntriesPerUser) {
        let oldest: string | null = null;
        let oldestTs = Infinity;

        for (const [hash, data] of userCache.entries()) {
          if (data.timestamp < oldestTs) {
            oldestTs = data.timestamp;
            oldest = hash;
          }
        }

        if (oldest) userCache.delete(oldest);
      }
    }

    return false;
  }

  clear(userId?: string) {
    if (userId) {
      this.cache.delete(userId);
    } else {
      this.cache.clear();
    }
  }
}

const crossThreadCache = new CrossThreadCache();

// Simple hash function for content
function hashContent(content: string): string {
  const normalized = content.toLowerCase().replace(/\s+/g, ' ').trim();
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return hash.toString(36);
}

const RELEVANCE_KEYWORDS = [
  'prefer', 'like', 'want', 'need', 'always', 'never', 'remember',
  'important', 'critical', 'must', 'should', 'requirement', 'constraint',
  'use', 'avoid', 'implement', 'design', 'architecture', 'pattern',
];

const ENTITY_MARKERS = ['@', '#', 'http://', 'https://', '.com', '.org', '.io'];

/**
 * Calculate relevance: entity density + technical terms + specificity
 */
function scoreRelevance(content: string, role: string): number {
  let score = 0.3; // Base score

  const lower = content.toLowerCase();

  // Entity density (URLs, mentions, hashtags)
  const entityCount = ENTITY_MARKERS.reduce((count, marker) => {
    return count + (content.match(new RegExp(marker.replace(/\./g, '\\.'), 'gi'))?.length || 0);
  }, 0);
  score += Math.min(0.3, entityCount * 0.05);

  // Keyword matching
  const keywordCount = RELEVANCE_KEYWORDS.reduce((count, keyword) => {
    return count + (lower.includes(keyword) ? 1 : 0);
  }, 0);
  score += Math.min(0.3, keywordCount * 0.05);

  // Specificity (longer content with detail)
  if (content.length > 100) score += 0.1;
  if (content.length > 300) score += 0.1;

  // User statements carry more weight
  if (role === 'user') score += 0.1;

  return Math.min(1.0, score);
}

/**
 * Calculate importance: user preferences, decisions, constraints
 */
function scoreImportance(content: string, role: string): number {
  let score = 0.2; // Base score

  const lower = content.toLowerCase();

  // Strong preference indicators
  const strongIndicators = ['always', 'never', 'must', 'critical', 'important', 'requirement'];
  const hasStrong = strongIndicators.some(ind => lower.includes(ind));
  if (hasStrong) score += 0.4;

  // Decision indicators
  const decisions = ['decided', 'chosen', 'selected', 'prefer', 'use'];
  const hasDecision = decisions.some(d => lower.includes(d));
  if (hasDecision) score += 0.2;

  // Questions indicate importance (seeking clarification)
  if (content.includes('?')) score += 0.1;

  // User role bump
  if (role === 'user') score += 0.1;

  return Math.min(1.0, score);
}

/**
 * Calculate recency: more recent messages score higher
 */
function scoreRecency(timestamp: number, threadStartTime?: number): number {
  if (!threadStartTime) return 0.8; // Default high score

  const threadDuration = Date.now() - threadStartTime;
  const msgAge = Date.now() - timestamp;

  // Exponential decay
  const ratio = msgAge / Math.max(threadDuration, 60000); // At least 1 minute
  return Math.max(0.1, 1.0 - ratio);
}

/**
 * Calculate coherence: length, structure, completeness
 */
function scoreCoherence(content: string): number {
  let score = 0.3; // Base score

  const length = content.trim().length;

  // Length appropriateness (not too short, not too long)
  if (length > 20 && length < 500) score += 0.3;
  else if (length >= 500) score += 0.2;

  // Structure (has punctuation, capitalization)
  if (/[.!?]/.test(content)) score += 0.2;
  if (/[A-Z]/.test(content)) score += 0.1;

  // Completeness (no truncation markers)
  if (!content.endsWith('...') && !content.includes('[truncated]')) score += 0.1;

  return Math.min(1.0, score);
}

/**
 * Calculate overall quality score
 * Returns: Q = 0.4*r + 0.3*i + 0.2*c + 0.1*h
 */
export function calculateQualityScore(input: ScoringInput): number {
  const factors: ScoringFactors = {
    relevance: scoreRelevance(input.content, input.role),
    importance: scoreImportance(input.content, input.role),
    recency: scoreRecency(input.timestamp, input.threadStartTime),
    coherence: scoreCoherence(input.content),
  };

  const Q =
    0.4 * factors.relevance +
    0.3 * factors.importance +
    0.2 * factors.coherence +
    0.1 * factors.recency;

  return Math.min(1.0, Math.max(0.0, Q));
}

/**
 * Get detailed scoring breakdown for observability
 */
export function getDetailedScore(input: ScoringInput) {
  const factors: ScoringFactors = {
    relevance: scoreRelevance(input.content, input.role),
    importance: scoreImportance(input.content, input.role),
    recency: scoreRecency(input.timestamp, input.threadStartTime),
    coherence: scoreCoherence(input.content),
  };

  const Q =
    0.4 * factors.relevance +
    0.3 * factors.importance +
    0.2 * factors.coherence +
    0.1 * factors.recency;

  return {
    score: Math.min(1.0, Math.max(0.0, Q)),
    factors,
  };
}

// ============================================================================
// TIER-AWARE SCORING
// ============================================================================

const TIER2_PATTERNS = [
  /\b(prefer|like|want|need|always|never)\b/i,
  /\b(goal|objective|aim|target|plan)\b/i,
  /\b(avoid|use|require|must|should)\b/i,
  /\b(setting|preference|config|option)\b/i,
];

/**
 * Detect memory tier based on content
 */
export function detectTier(input: ScoringInput): MemoryTier {
  const lower = input.content.toLowerCase();

  // TIER2: Preferences and goals
  const matchesTier2 = TIER2_PATTERNS.some(pattern => pattern.test(input.content));
  if (matchesTier2) return 'TIER2';

  // TIER1: Cross-thread (requires userId and threadId)
  if (input.userId && input.threadId) {
    const hash = hashContent(input.content);
    const isCrossThread = crossThreadCache.add(input.userId, hash, input.threadId);
    if (isCrossThread) return 'TIER1';
  }

  // Default: TIER3 (general)
  return 'TIER3';
}

/**
 * Calculate quality score with tier-specific weights
 */
export function calculateTierAwareScore(
  input: ScoringInput,
  tierConfig: TierConfig
): { score: number; tier: MemoryTier; factors: ScoringFactors } {
  const tier = detectTier(input);
  const config = tierConfig;

  const factors: ScoringFactors = {
    relevance: scoreRelevance(input.content, input.role),
    importance: scoreImportance(input.content, input.role),
    recency: scoreRecency(input.timestamp, input.threadStartTime),
    coherence: scoreCoherence(input.content),
  };

  // Apply tier-specific weights
  const Q =
    config.scoreWeights.relevance * factors.relevance +
    config.scoreWeights.importance * factors.importance +
    config.scoreWeights.recency * factors.recency +
    config.scoreWeights.coherence * factors.coherence;

  return {
    score: Math.min(1.0, Math.max(0.0, Q)),
    tier,
    factors,
  };
}

/**
 * Load tier config from memory.json
 */
export function loadTierConfig(tier: MemoryTier): TierConfig {
  // In production, load from config file
  // For now, return hardcoded defaults matching memory.json
  const configs: Record<MemoryTier, TierConfig> = {
    TIER1: {
      name: 'cross_recent',
      scoreWeights: { relevance: 0.45, importance: 0.25, recency: 0.25, coherence: 0.05 },
      saveThreshold: 0.62,
      ttlDays: 120,
      decayPerWeek: 0.01,
    },
    TIER2: {
      name: 'prefs_goals',
      scoreWeights: { relevance: 0.30, importance: 0.45, recency: 0.15, coherence: 0.10 },
      saveThreshold: 0.70,
      ttlDays: 365,
      decayPerWeek: 0.005,
    },
    TIER3: {
      name: 'general',
      scoreWeights: { relevance: 0.40, importance: 0.20, recency: 0.30, coherence: 0.10 },
      saveThreshold: 0.70,
      ttlDays: 90,
      decayPerWeek: 0.02,
    },
  };

  return configs[tier];
}

/**
 * Clear cross-thread cache (for testing)
 */
export function clearCrossThreadCache(userId?: string) {
  crossThreadCache.clear(userId);
}

