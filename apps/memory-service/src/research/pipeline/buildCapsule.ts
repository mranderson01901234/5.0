/**
 * Build research capsule from reranked search items
 * Extract ≤4 claims, ≤4 sources, enforce ≤4 KB payload
 */

import { pino } from 'pino';
import type { ResearchJob, ResearchCapsule, Claim, Source, SearchItem, TTLClass } from '../types.js';

const logger = pino({ name: 'capsule-builder' });

const MAX_CLAIMS = 4;
const MAX_SOURCES = 4;
const MAX_CLAIM_LENGTH = 160;
const MAX_PAYLOAD_KB = 4;

/**
 * Extract claims from search items
 * Prefer items with dates, prioritize independent sources
 */
function extractClaims(items: SearchItem[]): Claim[] {
  const claims: Claim[] = [];
  const hostClaims = new Map<string, string[]>(); // host -> claim texts

  // Group claims by host to detect consensus
  for (const item of items) {
    if (claims.length >= MAX_CLAIMS) break;

    const text = (item.snippet || item.title).trim();
    if (!text || text.length < 10) continue;

    // Truncate to max length
    const claimText = text.length > MAX_CLAIM_LENGTH
      ? text.substring(0, MAX_CLAIM_LENGTH - 3) + '...'
      : text;

    const host = item.host;
    if (!hostClaims.has(host)) {
      hostClaims.set(host, []);
    }
    hostClaims.get(host)!.push(claimText);
  }

  // Build claims with confidence levels
  const usedHosts = new Set<string>();

  for (const item of items) {
    if (claims.length >= MAX_CLAIMS) break;

    const host = item.host;
    if (usedHosts.has(host)) continue; // Prefer diversity

    const text = (item.snippet || item.title).trim();
    if (!text || text.length < 10) continue;

    // Check for consensus (same claim from multiple hosts)
    let consensusCount = 0;
    const claimText = text.length > MAX_CLAIM_LENGTH
      ? text.substring(0, MAX_CLAIM_LENGTH - 3) + '...'
      : text;

    for (const [otherHost, texts] of hostClaims.entries()) {
      if (otherHost === host) continue;
      // Simple similarity check (can be enhanced)
      const hasSimilar = texts.some(t => 
        cosineSimilarity(claimText.toLowerCase(), t.toLowerCase()) > 0.7
      );
      if (hasSimilar && item.date) {
        consensusCount++;
      }
    }

    // Confidence: 'high' if ≥2 independent hosts align on dated claim
    const confidence: 'high' | 'med' = (consensusCount >= 1 && item.date) ? 'high' : 'med';

    claims.push({
      text: claimText,
      date: normalizeDate(item.date),
      confidence,
    });

    usedHosts.add(host);
  }

  return claims;
}

/**
 * Extract sources from search items
 */
function extractSources(items: SearchItem[]): Source[] {
  const sources: Source[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    if (sources.length >= MAX_SOURCES) break;

    const key = `${item.host}:${item.date || 'no-date'}`;
    if (seen.has(key)) continue;

    sources.push({
      host: item.host,
      date: normalizeDate(item.date),
      tier: item.tier || 2,
    });

    seen.add(key);
  }

  return sources;
}

/**
 * Normalize date to ISO format (YYYY-MM-DD)
 */
function normalizeDate(dateStr: string | undefined): string | undefined {
  if (!dateStr) return undefined;

  try {
    // Try parsing various formats
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      return undefined;
    }
    return date.toISOString().split('T')[0]; // YYYY-MM-DD
  } catch {
    return undefined;
  }
}

/**
 * Simple cosine similarity helper
 */
function cosineSimilarity(text1: string, text2: string): number {
  const words1 = new Set(text1.toLowerCase().split(/\W+/).filter(w => w.length > 2));
  const words2 = new Set(text2.toLowerCase().split(/\W+/).filter(w => w.length > 2));
  
  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);
  
  return union.size > 0 ? intersection.size / union.size : 0;
}

/**
 * Calculate capsule payload size in bytes
 */
function calculatePayloadSize(capsule: ResearchCapsule): number {
  return JSON.stringify(capsule).length;
}

/**
 * Build research capsule from job and search items
 */
export function buildCapsule(
  job: ResearchJob,
  items: SearchItem[]
): ResearchCapsule {
  if (items.length === 0) {
    throw new Error('Cannot build capsule from empty items');
  }

  // Extract claims and sources
  const claims = extractClaims(items);
  const sources = extractSources(items);

  if (claims.length === 0) {
    throw new Error('No claims extracted from items');
  }

  // Calculate TTL for expiresAt
  const ttlMap: Record<TTLClass, number> = {
    'news/current': 60 * 60 * 1000, // 1 hour
    'pricing': 24 * 60 * 60 * 1000, // 24 hours
    'releases': 72 * 60 * 60 * 1000, // 72 hours
    'docs': 7 * 24 * 60 * 60 * 1000, // 7 days
    'general': 30 * 24 * 60 * 60 * 1000, // 30 days
  };

  const fetchedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + ttlMap[job.ttlClass]).toISOString();

  let capsule: ResearchCapsule = {
    threadId: job.threadId,
    topic: job.topic,
    entities: job.entities,
    fetchedAt,
    ttlClass: job.ttlClass,
    claims,
    sources,
    expiresAt,
  };

  // Enforce payload size limit
  let payloadSize = calculatePayloadSize(capsule);
  
  if (payloadSize > MAX_PAYLOAD_KB * 1024) {
    logger.warn({ payloadSize, maxSize: MAX_PAYLOAD_KB * 1024 }, 'Capsule exceeds size limit, truncating');
    
    // Truncate claims if needed
    while (payloadSize > MAX_PAYLOAD_KB * 1024 && capsule.claims.length > 1) {
      capsule.claims.pop();
      payloadSize = calculatePayloadSize(capsule);
    }

    // Truncate sources if still too large
    while (payloadSize > MAX_PAYLOAD_KB * 1024 && capsule.sources.length > 1) {
      capsule.sources.pop();
      payloadSize = calculatePayloadSize(capsule);
    }

    // Last resort: truncate claim text
    if (payloadSize > MAX_PAYLOAD_KB * 1024 && capsule.claims.length > 0) {
      const lastClaim = capsule.claims[capsule.claims.length - 1];
      const maxTextLength = Math.max(50, MAX_CLAIM_LENGTH - Math.floor((payloadSize - MAX_PAYLOAD_KB * 1024) / 4));
      lastClaim.text = lastClaim.text.substring(0, maxTextLength) + '...';
      payloadSize = calculatePayloadSize(capsule);
    }
  }

  logger.debug({ 
    threadId: job.threadId,
    batchId: job.batchId,
    claimsCount: capsule.claims.length,
    sourcesCount: capsule.sources.length,
    payloadSize 
  }, 'Capsule built');

  return capsule;
}

