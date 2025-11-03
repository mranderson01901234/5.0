/**
 * NewsData.io API fetcher
 * Fallback fetcher for low-value/news topics
 */

import { pino } from 'pino';
import type { SearchItem } from '../types.js';
import { getResearchConfig } from '../../config.js';

const logger = pino({ name: 'newsdata-fetcher' });

const NEWSDATA_API_URL = 'https://newsdata.io/api/1/news';

export interface NewsDataSearchOptions {
  limit?: number;
  timeout?: number;
}

/**
 * Fetch news results from NewsData.io API
 */
export async function fetchNewsData(
  query: string,
  options: NewsDataSearchOptions = {}
): Promise<SearchItem[]> {
  const config = getResearchConfig();
  
  if (!config.newsdataApiKey) {
    throw new Error('NEWSDATA_API_KEY not configured');
  }

  const {
    limit = 5,
    timeout = 900,
  } = options;

  const searchParams = new URLSearchParams({
    q: query,
    apikey: config.newsdataApiKey,
    language: 'en',
    size: limit.toString(),
  });

  const url = `${NEWSDATA_API_URL}?${searchParams.toString()}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      logger.error({ status: response.status, error: errorText }, 'NewsData API error');
      throw new Error(`NewsData API error: ${response.status}`);
    }

    const data = await response.json();
    const results = data.results || [];

    // Transform to SearchItem format
    const items: SearchItem[] = results.map((result: any) => {
      // Extract host from source_id or link
      let host = result.source_id || '';
      if (result.link) {
        try {
          const url = new URL(result.link);
          host = url.hostname.replace('www.', '');
        } catch {
          // Use original source_id
        }
      }

      // Format date (NewsData returns ISO strings)
      let date: string | undefined = undefined;
      if (result.pubDate) {
        try {
          date = new Date(result.pubDate).toISOString().split('T')[0]; // YYYY-MM-DD
        } catch {
          // Invalid date, skip
        }
      }

      return {
        host,
        title: result.title || '',
        date,
        url: result.link || '',
        snippet: result.description || '',
        tier: 2 as const, // NewsData sources are tier 2
      };
    });

    logger.debug({ query, count: items.length }, 'NewsData fetch complete');
    return items;
  } catch (error: any) {
    clearTimeout(timeoutId);
    
    if (error.name === 'AbortError') {
      logger.warn({ query }, 'NewsData fetch timeout');
      throw new Error('Timeout');
    }

    throw error;
  }
}

/**
 * Normalize host from various formats
 */
export function normalizeHost(host: string): string {
  return host
    .toLowerCase()
    .replace(/^www\./, '')
    .replace(/^https?:\/\//, '')
    .split('/')[0] // Remove path
    .trim();
}

