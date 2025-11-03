/**
 * Quality Scorer: Q = 0.4*relevance + 0.3*importance + 0.2*recency + 0.1*coherence
 * Per MEMORY_BLUEPRINT.md scoring rules
 */

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
