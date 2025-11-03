/**
 * Brave Search API fetcher
 * Primary fetcher for web search
 */

import { pino } from 'pino';
import type { SearchItem } from '../types.js';
import { getResearchConfig } from '../../config.js';
import { cleanHtml } from '../../utils/htmlCleaner.js';

const logger = pino({ name: 'brave-fetcher' });

const BRAVE_API_URL = 'https://api.search.brave.com/res/v1/web/search';

export interface BraveSearchOptions {
  count?: number;
  freshness?: string; // 'pd' (past day), 'pw' (past week), 'pm' (past month)
  timeout?: number;
}

/**
 * Fetch search results from Brave API
 */
export async function fetchBrave(
  query: string,
  options: BraveSearchOptions = {}
): Promise<SearchItem[]> {
  const config = getResearchConfig();
  
  if (!config.braveApiKey) {
    throw new Error('BRAVE_API_KEY not configured');
  }

  const {
    count = 8,
    freshness,
    timeout = 900,
  } = options;

  const searchParams = new URLSearchParams({
    q: query,
    count: count.toString(),
  });

  if (freshness) {
    searchParams.append('freshness', freshness);
  }

  const url = `${BRAVE_API_URL}?${searchParams.toString()}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-Subscription-Token': config.braveApiKey,
        'Accept': 'application/json',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.status === 429) {
      logger.warn('Brave API rate limited');
      throw new Error('Rate limited');
    }

    if (response.status >= 500) {
      logger.warn({ status: response.status }, 'Brave API server error');
      throw new Error(`Server error: ${response.status}`);
    }

    if (!response.ok) {
      const errorText = await response.text();
      logger.error({ status: response.status, error: errorText }, 'Brave API error');
      throw new Error(`Brave API error: ${response.status}`);
    }

    const data = await response.json();
    const results = data.web?.results || [];

    // Transform to SearchItem format
    const items: SearchItem[] = results.map((result: any) => {
      // Extract host from URL
      let host = '';
      try {
        const url = new URL(result.url || '');
        host = url.hostname.replace('www.', '');
      } catch {
        host = result.url || '';
      }

      return {
        host,
        title: cleanHtml(result.title || ''),
        date: result.age || undefined,
        url: result.url || '',
        snippet: cleanHtml(result.description || ''),
        tier: 1 as const, // Default tier, can be adjusted by allowlist
      };
    });

    // Dedupe by host+date
    const seen = new Set<string>();
    const deduped: SearchItem[] = [];
    for (const item of items) {
      const key = `${item.host}:${item.date || 'no-date'}`;
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(item);
      }
    }

    logger.debug({ query, count: deduped.length }, 'Brave fetch complete');
    return deduped;
  } catch (error: any) {
    clearTimeout(timeoutId);
    
    if (error.name === 'AbortError') {
      logger.warn({ query }, 'Brave fetch timeout');
      throw new Error('Timeout');
    }

    // Retry once on 429 or 5xx
    if (error.message.includes('Rate limited') || error.message.includes('Server error')) {
      logger.info({ query }, 'Retrying Brave fetch after error');
      // Wait 500ms before retry
      await new Promise(resolve => setTimeout(resolve, 500));
      return fetchBrave(query, { ...options, timeout: Math.max(timeout - 500, 100) });
    }

    throw error;
  }
}

/**
 * Map recency hint to Brave freshness parameter
 */
export function mapRecencyToFreshness(recency: string): string | undefined {
  switch (recency) {
    case 'day':
      return 'pd'; // past day
    case 'week':
      return 'pw'; // past week
    case 'month':
      return 'pm'; // past month
    default:
      return undefined;
  }
}

