/**
 * Research system type definitions
 * Matches prompt specifications exactly
 */

export type TTLClass = 'news/current' | 'pricing' | 'releases' | 'docs' | 'general';
export type RecencyHint = 'day' | 'week' | 'month';
export type ConfidenceLevel = 'high' | 'med';
export type SourceTier = 1 | 2 | 3;

/**
 * Research job enqueued from memory review
 */
export interface ResearchJob {
  threadId: string;
  batchId: string;
  turnId?: string;
  topic: string;
  entities: string[];
  ttlClass: TTLClass;
  normQuery: string;
  recencyHint: RecencyHint;
}

/**
 * Claim extracted from research results
 */
export interface Claim {
  text: string;
  date?: string;
  confidence: ConfidenceLevel;
}

/**
 * Source reference (host + date only, no URLs/snippets)
 */
export interface Source {
  host: string;
  date?: string;
  tier: SourceTier;
}

/**
 * Research capsule stored in cache and published to Redis
 */
export interface ResearchCapsule {
  threadId: string;
  topic: string;
  entities: string[];
  fetchedAt: string;
  ttlClass: string;
  claims: Claim[];
  sources: Source[];
  expiresAt: string;
}

/**
 * Internal representation of search result (before capsule building)
 */
export interface SearchItem {
  host: string;
  title: string;
  date?: string;
  url: string;
  snippet?: string; // Used for reranking, NOT in capsule
  tier?: SourceTier;
}

