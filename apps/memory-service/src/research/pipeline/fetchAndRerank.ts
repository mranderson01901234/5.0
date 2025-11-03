/**
 * Fetch and rerank pipeline
 * Orchestrates: cache lookup → Brave fetch → low-value check → NewsData fallback → rerank
 * Now includes Haiku 3-based intelligent source selection
 */

// Ensure root .env is loaded
import '../../../../shared-env-loader.js';

import { pino } from 'pino';
import type { SearchItem, TTLClass, ResearchJob } from '../types.js';
import { fetchBrave, mapRecencyToFreshness } from '../fetchers/brave.js';
import { fetchNewsData } from '../fetchers/newsdata.js';
import { getCachedCapsule, hasNegativeCache, cacheNegative } from '../cache.js';
import { getResearchConfig } from '../../config.js';

const logger = pino({ name: 'fetch-rerank' });

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY?.trim() || '';
const HAIKU_MODEL = 'claude-3-haiku-20240307'; // Haiku 3 (NOT 3.5) as specified
const HAIKU_RERANK_TIMEOUT_MS = 6000; // 6 second timeout for source selection

/**
 * Simple BM25-like scoring (term frequency based)
 */
function bm25Score(query: string, text: string): number {
  const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
  const textLower = text.toLowerCase();
  
  let score = 0;
  for (const term of queryTerms) {
    const matches = (textLower.match(new RegExp(term, 'g')) || []).length;
    if (matches > 0) {
      score += Math.log(1 + matches);
    }
  }
  
  return Math.min(1.0, score / Math.max(1, queryTerms.length));
}

/**
 * Simple cosine similarity (word overlap)
 */
function cosineSimilarity(text1: string, text2: string): number {
  const words1 = new Set(text1.toLowerCase().split(/\W+/).filter(w => w.length > 2));
  const words2 = new Set(text2.toLowerCase().split(/\W+/).filter(w => w.length > 2));
  
  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);
  
  return union.size > 0 ? intersection.size / union.size : 0;
}

/**
 * Freshness score based on date recency
 */
function freshnessScore(dateStr: string | undefined, recencyHint: string): number {
  if (!dateStr) {
    return 0.5; // No date = medium score
  }

  try {
    const date = new Date(dateStr);
    const now = Date.now();
    const age = now - date.getTime();
    
    const dayMs = 24 * 60 * 60 * 1000;
    const weekMs = 7 * dayMs;
    const monthMs = 30 * dayMs;
    
    let threshold: number;
    switch (recencyHint) {
      case 'day':
        threshold = dayMs;
        break;
      case 'week':
        threshold = weekMs;
        break;
      case 'month':
        threshold = monthMs;
        break;
      default:
        threshold = monthMs;
    }
    
    if (age <= threshold) {
      return 1.0 - (age / threshold) * 0.5; // Decay within threshold
    }
    
    return Math.max(0.1, 0.5 - (age - threshold) / (threshold * 2)); // Further decay
  } catch {
    return 0.5; // Invalid date
  }
}

/**
 * Authority score based on tier
 */
function authorityScore(tier: number): number {
  switch (tier) {
    case 1:
      return 1.0;
    case 2:
      return 0.7;
    case 3:
      return 0.4;
    default:
      return 0.5;
  }
}

/**
 * Vertical affinity (placeholder - can be enhanced)
 */
function verticalAffinity(item: SearchItem, ttlClass: TTLClass): number {
  // Simple heuristic: match domain patterns to TTL class
  const host = item.host.toLowerCase();
  
  if (ttlClass === 'news/current') {
    if (host.includes('news') || host.includes('reuters') || host.includes('bbc')) {
      return 1.0;
    }
  }
  
  if (ttlClass === 'docs') {
    if (host.includes('docs.') || host.includes('documentation')) {
      return 1.0;
    }
  }
  
  return 0.5; // Default affinity
}

/**
 * User affinity (placeholder - can be enhanced with user history)
 */
function userAffinity(item: SearchItem, _entities: string[]): number {
  // Future: check user click history, pinned domains, etc.
  return 0.5; // Default
}

/**
 * Use Haiku 3 to intelligently select and rank the best sources
 * This is the "smart search algorithm" that uses Haiku 3 to analyze sources
 */
async function haikuRerankSources(
  items: SearchItem[],
  query: string,
  topic: string
): Promise<SearchItem[]> {
  if (!ANTHROPIC_API_KEY || items.length === 0) {
    return items;
  }

  // Limit to top 12 items for Haiku analysis (to avoid token limits)
  const itemsToAnalyze = items.slice(0, 12);

  const systemPrompt = `You are an expert information retrieval system. Your job is to analyze search results and select the BEST sources that would provide accurate, relevant, and authoritative information to answer the user's query.

Given a user query and a list of search results, you must:
1. Evaluate each source for relevance, authority, and information quality
2. Rank them by how well they would answer the query
3. Return ONLY a JSON array of the top sources in ranked order

Return format: A JSON array of hostnames, ranked from best to worst. Example: ["reuters.com", "bbc.com", "techcrunch.com"]

Focus on:
- Relevance to the query
- Source authority and trustworthiness
- Recency (prefer recent sources when relevant)
- Information completeness`;

  const itemsText = itemsToAnalyze.map((item, idx) => {
    const datePart = item.date ? ` (Date: ${item.date})` : '';
    return `${idx + 1}. ${item.host} - ${item.title}${datePart}\n   ${(item.snippet || '').substring(0, 150)}`;
  }).join('\n\n');

  const userPrompt = `User Query: "${query}"\nTopic: "${topic}"\n\nSearch Results:\n${itemsText}\n\nSelect and rank the top ${Math.min(6, itemsToAnalyze.length)} best sources as a JSON array of hostnames (without www.). Return ONLY the JSON array, nothing else.`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), HAIKU_RERANK_TIMEOUT_MS);

    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: HAIKU_MODEL,
        system: systemPrompt,
        messages: [
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3, // Low temperature for consistent ranking
        max_tokens: 200,
      }),
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      logger.warn({ status: response.status }, 'Haiku rerank failed, using algorithmic ranking');
      return items;
    }

    const json = await response.json() as any;
    const text = json?.content?.[0]?.text?.trim() || '';

    if (!text) {
      logger.warn('Haiku rerank returned empty response, using algorithmic ranking');
      return items;
    }

    // Extract JSON array from response (might have markdown code blocks)
    let jsonText = text;
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      jsonText = jsonMatch[0];
    }

    try {
      const rankedHosts: string[] = JSON.parse(jsonText);
      if (!Array.isArray(rankedHosts) || rankedHosts.length === 0) {
        throw new Error('Invalid format');
      }

      // Create a map for O(1) lookup
      const itemMap = new Map<string, SearchItem[]>();
      itemsToAnalyze.forEach(item => {
        const host = item.host.replace(/^www\./, '');
        if (!itemMap.has(host)) {
          itemMap.set(host, []);
        }
        itemMap.get(host)!.push(item);
      });

      // Reorder items based on Haiku ranking
      const reranked: SearchItem[] = [];
      const seen = new Set<string>();

      for (const host of rankedHosts) {
        const normalizedHost = host.replace(/^www\./, '').toLowerCase();
        const matchingItems = itemMap.get(normalizedHost) || [];
        
        for (const item of matchingItems) {
          const key = `${item.host}:${item.date || 'no-date'}`;
          if (!seen.has(key)) {
            seen.add(key);
            reranked.push(item);
          }
        }
      }

      // Add any remaining items that weren't ranked by Haiku
      for (const item of itemsToAnalyze) {
        const key = `${item.host}:${item.date || 'no-date'}`;
        if (!seen.has(key)) {
          reranked.push(item);
        }
      }

      // Add any items beyond the analyzed set
      reranked.push(...items.slice(itemsToAnalyze.length));

      logger.debug({ 
        originalCount: items.length,
        rerankedCount: reranked.length,
        haikuSelected: rankedHosts.length 
      }, 'Haiku 3 rerank completed');

      return reranked;
    } catch (parseError: any) {
      logger.warn({ error: parseError.message, text }, 'Failed to parse Haiku rerank response, using algorithmic ranking');
      return items;
    }
  } catch (error: any) {
    if (error.name === 'AbortError') {
      logger.warn('Haiku rerank timed out, using algorithmic ranking');
    } else {
      logger.warn({ error: error.message }, 'Haiku rerank failed, using algorithmic ranking');
    }
    return items;
  }
}

/**
 * Rerank search items using hybrid approach: algorithmic scoring + Haiku 3 selection
 */
export async function rerankItems(
  items: SearchItem[],
  query: string,
  topic: string,
  ttlClass: TTLClass,
  recencyHint: string,
  entities: string[]
): Promise<SearchItem[]> {
  // First, use algorithmic scoring to get initial ranking
  const scored = items.map(item => {
    const bm25 = bm25Score(query, `${item.title} ${item.snippet || ''}`);
    const cosine = cosineSimilarity(topic, `${item.title} ${item.snippet || ''}`);
    const freshness = freshnessScore(item.date, recencyHint);
    const authority = authorityScore(item.tier || 2);
    const vertical = verticalAffinity(item, ttlClass);
    const affinity = userAffinity(item, entities);

    // Weighted formula from prompt
    const score = 
      bm25 * 0.30 +
      cosine * 0.30 +
      freshness * 0.15 +
      authority * 0.10 +
      vertical * 0.10 +
      affinity * 0.05;

    return {
      ...item,
      _score: score,
    };
  });

  // Sort by score descending
  scored.sort((a, b) => b._score - a._score);
  const algorithmicallyRanked = scored.map(({ _score, ...item }) => item);

  // Then, use Haiku 3 to intelligently select and rerank the best sources
  const haikuRanked = await haikuRerankSources(algorithmicallyRanked, query, topic);

  // Return top 6
  return haikuRanked.slice(0, 6);
}

/**
 * Merge and dedupe search results from multiple sources
 */
function mergeAndDedupe(braveItems: SearchItem[], newsdataItems: SearchItem[]): SearchItem[] {
  const seen = new Set<string>();
  const merged: SearchItem[] = [];

  // Prefer Brave items (add first)
  for (const item of braveItems) {
    const key = `${item.host}:${item.date || 'no-date'}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(item);
    }
  }

  // Add NewsData items if not duplicate
  for (const item of newsdataItems) {
    const key = `${item.host}:${item.date || 'no-date'}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(item);
    }
  }

  return merged;
}

/**
 * Main fetch and rerank function
 */
export async function fetchAndRerank(job: ResearchJob): Promise<SearchItem[]> {
  const config = getResearchConfig();
  
  if (!config.enabled) {
    logger.warn('Research disabled, skipping fetch');
    return [];
  }

  // Check cache first
  const cached = await getCachedCapsule(
    job.topic,
    job.ttlClass,
    job.recencyHint,
    job.normQuery
  );

  if (cached) {
    logger.debug({ threadId: job.threadId, batchId: job.batchId }, 'Cache hit, skipping fetch');
    return []; // Cache hit means we already have a capsule
  }

  // Check negative cache
  const hasNegative = await hasNegativeCache(
    job.topic,
    job.ttlClass,
    job.recencyHint,
    job.normQuery
  );

  if (hasNegative) {
    logger.debug({ threadId: job.threadId, batchId: job.batchId }, 'Negative cache hit, skipping fetch');
    return [];
  }

  let braveItems: SearchItem[] = [];
  let newsdataItems: SearchItem[] = [];

  // Fetch from Brave (primary)
  try {
    const freshness = mapRecencyToFreshness(job.recencyHint);
    braveItems = await fetchBrave(job.normQuery, {
      count: 8,
      freshness,
      timeout: 900,
    });
    logger.debug({ count: braveItems.length }, 'Brave fetch complete');
  } catch (error: any) {
    logger.warn({ error: error.message }, 'Brave fetch failed');
    // Continue with empty Brave results
  }

  // Low-value check: <3 usable hosts OR timeout/429
  const usableHosts = new Set(braveItems.map(item => item.host)).size;
  const isLowValue = usableHosts < 3;

  // Fetch from NewsData if low-value AND fallback enabled AND news topic
  if (
    isLowValue &&
    config.newsdataFallback &&
    job.ttlClass === 'news/current'
  ) {
    try {
      newsdataItems = await fetchNewsData(job.normQuery, {
        limit: 5,
        timeout: 900,
      });
      logger.debug({ count: newsdataItems.length }, 'NewsData fetch complete');
    } catch (error: any) {
      logger.warn({ error: error.message }, 'NewsData fetch failed');
    }
  }

  // Merge and dedupe
  const merged = mergeAndDedupe(braveItems, newsdataItems);

  // Still low-value after merge? Store negative cache
  const finalUsableHosts = new Set(merged.map(item => item.host)).size;
  if (finalUsableHosts < 3) {
    await cacheNegative(job.topic, job.ttlClass, job.recencyHint, job.normQuery);
    logger.debug('Stored negative cache (low-value results)');
  }

  // Rerank using hybrid approach: algorithmic + Haiku 3 intelligent selection
  const reranked = await rerankItems(
    merged,
    job.normQuery,
    job.topic,
    job.ttlClass,
    job.recencyHint,
    job.entities
  );

  logger.info({ 
    threadId: job.threadId, 
    batchId: job.batchId,
    braveCount: braveItems.length,
    newsdataCount: newsdataItems.length,
    finalCount: reranked.length 
  }, 'Fetch and rerank complete');

  return reranked;
}

