/**
 * Relevance Scoring for Memory Search
 * Provides advanced scoring functions for better result ranking
 * 
 * Phase 4: Improved Relevance Scoring
 */

import type { Memory } from '@llm-gateway/shared';
import type { ProcessedQuery } from './query-preprocessor.js';

export interface RelevanceScoreOptions {
  boostPhrases?: boolean;        // Boost exact phrase matches
  boostPosition?: boolean;       // Boost terms at start of content
  boostTier?: boolean;           // Boost TIER1 memories
  boostPriority?: boolean;       // Boost high priority memories
  boostRecency?: boolean;        // Boost recent memories (24h)
}

/**
 * Calculate term position score
 * Terms at the start of content are more relevant
 */
function calculatePositionScore(
  content: string,
  term: string,
  isPhrase: boolean
): number {
  const lowerContent = content.toLowerCase();
  const lowerTerm = term.toLowerCase();
  
  // Find position of term in content
  const position = lowerContent.indexOf(lowerTerm);
  
  if (position === -1) return 0;
  
  // Normalize position (0 = start, 1 = end)
  const normalizedPosition = position / Math.max(content.length, 1);
  
  // Boost for early position
  // Position 0-20%: 1.5x boost
  // Position 20-50%: 1.2x boost
  // Position 50-100%: 1.0x (no boost)
  if (normalizedPosition < 0.2) {
    return 1.5;
  } else if (normalizedPosition < 0.5) {
    return 1.2;
  } else {
    return 1.0;
  }
}

/**
 * Calculate phrase match boost
 * Exact phrase matches get higher boost than partial matches
 */
function calculatePhraseBoost(
  content: string,
  phrase: string
): number {
  const lowerContent = content.toLowerCase();
  const lowerPhrase = phrase.toLowerCase();
  
  // Exact phrase match
  if (lowerContent.includes(lowerPhrase)) {
    return 2.0; // 2x boost for exact phrase
  }
  
  // Check if all words in phrase are present (partial match)
  const phraseWords = lowerPhrase.split(/\s+/).filter(w => w.length > 2);
  const contentWords = new Set(lowerContent.split(/\s+/));
  
  const wordsFound = phraseWords.filter(w => contentWords.has(w)).length;
  const matchRatio = wordsFound / phraseWords.length;
  
  if (matchRatio >= 0.8) {
    return 1.5; // 1.5x boost for near-complete phrase
  } else if (matchRatio >= 0.5) {
    return 1.2; // 1.2x boost for partial phrase
  }
  
  return 1.0; // No boost
}

/**
 * Calculate tier boost
 * TIER1 memories are more important
 */
function calculateTierBoost(tier: string): number {
  switch (tier) {
    case 'TIER1':
      return 1.2; // 20% boost
    case 'TIER2':
      return 1.1; // 10% boost
    case 'TIER3':
    default:
      return 1.0; // No boost
  }
}

/**
 * Calculate priority boost
 * High priority memories are more relevant
 */
function calculatePriorityBoost(priority: number): number {
  if (priority >= 0.9) {
    return 1.2; // 20% boost for very high priority
  } else if (priority >= 0.8) {
    return 1.1; // 10% boost for high priority
  } else if (priority >= 0.7) {
    return 1.05; // 5% boost for medium-high priority
  }
  return 1.0; // No boost
}

/**
 * Calculate recency boost
 * Recent memories (last 24h) are more relevant
 */
function calculateRecencyBoost(updatedAt: number): number {
  const now = Date.now();
  const ageMs = now - updatedAt;
  const ageHours = ageMs / (1000 * 60 * 60);
  
  if (ageHours < 24) {
    return 1.1; // 10% boost for last 24h
  } else if (ageHours < 168) { // 1 week
    return 1.05; // 5% boost for last week
  }
  return 1.0; // No boost
}

/**
 * Calculate enhanced relevance score for a memory
 * Combines multiple scoring factors
 */
export function calculateRelevanceScore(
  memory: Memory,
  processedQuery: ProcessedQuery,
  baseScore: number,
  options: RelevanceScoreOptions = {}
): number {
  const {
    boostPhrases = true,
    boostPosition = true,
    boostTier = true,
    boostPriority = true,
    boostRecency = true,
  } = options;
  
  let score = baseScore;
  
  // Apply phrase boosts (use maximum boost, not multiplicative)
  if (boostPhrases && processedQuery.phrases.length > 0) {
    let maxPhraseBoost = 1.0;
    for (const phrase of processedQuery.phrases) {
      const phraseBoost = calculatePhraseBoost(memory.content, phrase);
      maxPhraseBoost = Math.max(maxPhraseBoost, phraseBoost);
    }
    score *= maxPhraseBoost;
  }
  
  // Apply position boosts for keywords
  if (boostPosition && processedQuery.keywords.length > 0) {
    let positionBoostSum = 0;
    for (const keyword of processedQuery.keywords) {
      const positionBoost = calculatePositionScore(memory.content, keyword, false);
      positionBoostSum += positionBoost;
    }
    // Average position boost
    const avgPositionBoost = positionBoostSum / processedQuery.keywords.length;
    score *= avgPositionBoost;
  }
  
  // Apply tier boost
  if (boostTier) {
    const tierBoost = calculateTierBoost(memory.tier || 'TIER3');
    score *= tierBoost;
  }
  
  // Apply priority boost
  if (boostPriority) {
    const priorityBoost = calculatePriorityBoost(memory.priority);
    score *= priorityBoost;
  }
  
  // Apply recency boost
  if (boostRecency) {
    const recencyBoost = calculateRecencyBoost(memory.updatedAt);
    score *= recencyBoost;
  }
  
  return Math.min(1.0, score); // Cap at 1.0
}

/**
 * Calculate term frequency score (simplified TF)
 * Multiple occurrences of a term increase relevance
 */
export function calculateTermFrequencyScore(
  content: string,
  terms: string[]
): number {
  const lowerContent = content.toLowerCase();
  let totalMatches = 0;
  
  for (const term of terms) {
    const lowerTerm = term.toLowerCase();
    // Count occurrences (simple approach)
    const matches = (lowerContent.match(new RegExp(lowerTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
    totalMatches += matches;
  }
  
  // Normalize: 1-2 matches = 1.0, 3-5 = 1.2, 6+ = 1.5
  if (totalMatches <= 2) {
    return 1.0;
  } else if (totalMatches <= 5) {
    return 1.2;
  } else {
    return 1.5;
  }
}

/**
 * Sort memories by enhanced relevance
 */
export function sortByRelevance(
  memories: Memory[],
  processedQuery: ProcessedQuery,
  baseScores: Map<string, number>, // Map of memory ID to base score
  options: RelevanceScoreOptions = {}
): Memory[] {
  // Calculate enhanced scores
  const enhancedScores = new Map<string, number>();
  
  for (const memory of memories) {
    const baseScore = baseScores.get(memory.id) || 0;
    const enhancedScore = calculateRelevanceScore(memory, processedQuery, baseScore, options);
    enhancedScores.set(memory.id, enhancedScore);
  }
  
  // Sort by enhanced score
  return memories.sort((a, b) => {
    const scoreA = enhancedScores.get(a.id) || 0;
    const scoreB = enhancedScores.get(b.id) || 0;
    
    // Primary: enhanced score
    if (Math.abs(scoreA - scoreB) > 0.01) {
      return scoreB - scoreA; // Higher score first
    }
    
    // Secondary: recency (if scores are equal)
    if (a.updatedAt !== b.updatedAt) {
      return b.updatedAt - a.updatedAt;
    }
    
    // Tertiary: tier
    const tierOrder: Record<string, number> = { TIER1: 1, TIER2: 2, TIER3: 3 };
    const tierA = tierOrder[a.tier || 'TIER3'] || 4;
    const tierB = tierOrder[b.tier || 'TIER3'] || 4;
    if (tierA !== tierB) {
      return tierA - tierB;
    }
    
    // Quaternary: priority
    return b.priority - a.priority;
  });
}

