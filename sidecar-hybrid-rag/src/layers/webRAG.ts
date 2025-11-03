/**
 * Web Research RAG Layer - Retrieves real-time web search results
 */

import { WebResult } from '../types/responses.js';
import { HybridRAGRequest } from '../types/requests.js';
import { logger } from '../utils/logger.js';
import { loadConfig } from '../config.js';

const config = loadConfig();

interface WebSearchResponse {
  query: string;
  results: Array<{
    title: string;
    host: string;
    snippet: string;
    date?: string;
  }>;
  summary?: string;
}

/**
 * Calculate relevance score for web result
 * Based on snippet quality, title match, and recency
 */
function calculateRelevanceScore(
  result: WebSearchResponse['results'][0],
  query: string
): number {
  let score = 0.5; // Base score
  
  // Title relevance
  const titleLower = result.title.toLowerCase();
  const queryWords = query.toLowerCase().split(/\s+/);
  const titleMatches = queryWords.filter(word => titleLower.includes(word)).length;
  score += (titleMatches / queryWords.length) * 0.3;
  
  // Snippet quality
  if (result.snippet && result.snippet.length > 50) {
    const snippetLower = result.snippet.toLowerCase();
    const snippetMatches = queryWords.filter(word => snippetLower.includes(word)).length;
    score += (snippetMatches / queryWords.length) * 0.15;
  }
  
  // Recency boost (if date available)
  if (result.date) {
    // Approximate: if date mentions "day" or very recent, boost
    const dateLower = result.date.toLowerCase();
    if (dateLower.includes('hour') || dateLower.includes('minute')) {
      score += 0.1;
    } else if (dateLower.includes('day')) {
      score += 0.05;
    }
  }
  
  // Authority boost (common authoritative domains)
  const authoritativeHosts = [
    'reuters', 'bbc', 'nytimes', 'wsj', 'bloomberg', 'theguardian',
    'nature', 'science', 'arxiv', 'nasa', 'nih', 'gov', 'edu'
  ];
  if (authoritativeHosts.some(domain => result.host.includes(domain))) {
    score += 0.1;
  }
  
  return Math.min(score, 1.0); // Cap at 1.0
}

export class WebRAGLayer {
  private memoryServiceUrl: string;

  constructor() {
    this.memoryServiceUrl = config.memoryServiceUrl;
  }

  /**
   * Retrieve web search results
   * Uses memory-service web search endpoint for consistency
   */
  async retrieve(request: HybridRAGRequest): Promise<WebResult[]> {
    try {
      const url = `${this.memoryServiceUrl}/v1/web-search`;
      logger.info({ userId: request.userId, query: request.query, url }, 'Web RAG retrieval starting');

      // Call memory-service web search endpoint
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': request.userId || '',
          'x-internal-service': 'hybrid-rag',
        },
        body: JSON.stringify({
          query: request.query,
          threadId: request.threadId,
        }),
        signal: AbortSignal.timeout(5000), // 5 second timeout for web search
      });

      logger.info({ status: response.status, url }, 'Web search response received');

      if (!response.ok) {
        // If web search is not available, log and return empty
        if (response.status === 503) {
          logger.debug('Web search not available (service disabled or no API key)');
          return [];
        }
        
        logger.warn({ status: response.status }, 'Web search request failed');
        return [];
      }

      const data = await response.json() as WebSearchResponse;

      if (!data.results || data.results.length === 0) {
        logger.debug('No web results found');
        return [];
      }

      // Convert to WebResult format
      const webResults: WebResult[] = data.results.map(result => ({
        content: result.snippet || result.title,
        source: {
          url: `https://${result.host}`, // Approximate URL
          host: result.host,
          date: result.date,
          tier: this.determineTier(result.host),
        },
        relevanceScore: calculateRelevanceScore(result, request.query),
        fetchedAt: Date.now(),
      }));

      logger.info({ count: webResults.length }, 'Web RAG retrieval complete');

      return webResults;
    } catch (error: any) {
      // Handle timeout or network errors gracefully
      if (error.name === 'TimeoutError' || error.name === 'AbortError') {
        logger.warn('Web search timed out');
      } else {
        logger.error({ error: error.message }, 'Web RAG retrieval failed');
      }
      return [];
    }
  }

  /**
   * Determine tier for host (authority level)
   */
  private determineTier(host: string): string {
    const hostLower = host.toLowerCase();
    
    // Tier 1: Highly authoritative
    const tier1 = /(reuters|apnews|bbc|ft|wsj|bloomberg|nytimes|theguardian|nature|science|arxiv|nasa|who|nih|ecdc|ec\.europa)/;
    if (tier1.test(hostLower)) {
      return 'tier1';
    }
    
    // Tier 2: Reputable tech/news
    const tier2 = /(theverge|techcrunch|wired|engadget|zdnet|infoq|anandtech|semianalysis|financialpost|investors|seekingalpha)/;
    if (tier2.test(hostLower)) {
      return 'tier2';
    }
    
    // Default tier
    return 'tier3';
  }

  /**
   * Hybrid retrieval - web search with optional freshness control
   */
  async hybridRetrieve(request: HybridRAGRequest): Promise<WebResult[]> {
    // For Phase 2: Basic web search
    // Future: Could add multiple queries with different freshness parameters
    return this.retrieve(request);
  }
}

