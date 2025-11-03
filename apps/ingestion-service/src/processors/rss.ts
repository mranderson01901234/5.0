/**
 * RSS Feed Processor
 * Fetches and parses RSS feeds into ingested content items
 */

import Parser from 'rss-parser';
import { createHash } from 'crypto';
import { pino } from 'pino';
import type { IngestionSource } from '../config.js';

const logger = pino({ name: 'rss-processor' });

export interface ProcessedItem {
  url: string;
  urlHash: string;
  title: string;
  summary: string;
  publishedDate: number;
  category: string;
  sourceType: string;
  sourceUrl: string;
  priority: number;
  expiresAt: number;
  metadata: Record<string, any>;
}

export interface IngestionResult {
  ingested: number;
  skipped: number;
  items: ProcessedItem[];
  error?: string;
}

const parser = new Parser({
  timeout: 30000,
  maxRedirects: 5,
  headers: {
    'User-Agent': 'Mozilla/5.0 (compatible; IngestionService/1.0)',
  },
});

/**
 * Calculate TTL expiration date based on category
 */
function calculateTTL(category: string): number {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  switch (category) {
    case 'news':
      return now + (7 * dayMs); // 7 days
    case 'tech':
      return now + (14 * dayMs); // 14 days
    case 'science':
      return now + (30 * dayMs); // 30 days
    case 'programming':
      return now + (14 * dayMs); // 14 days
    default:
      return now + (30 * dayMs); // 30 days default
  }
}

/**
 * Calculate priority score for an item
 */
function calculatePriority(
  item: any,
  source: IngestionSource,
  publishedDate: number
): number {
  let priority = source.priority;

  // Boost priority for very recent items (last 24 hours)
  const ageHours = (Date.now() - publishedDate) / (1000 * 60 * 60);
  if (ageHours < 24) {
    priority += 1;
  }

  // Boost for items with good content
  const contentLength = (item.contentSnippet || item.content || '').length;
  if (contentLength > 200) {
    priority += 0.5;
  }

  return Math.min(10, Math.max(1, priority));
}

/**
 * Process RSS feed and return items
 */
export async function processRSSFeed(
  source: IngestionSource,
  lastFetchAt?: number
): Promise<IngestionResult> {
  const startTime = Date.now();

  try {
    // Fetch RSS feed
    logger.debug({ source: source.id, url: source.url }, 'Fetching RSS feed');

    const feed = await parser.parseURL(source.url);

    if (!feed.items || feed.items.length === 0) {
      logger.debug({ source: source.id }, 'RSS feed returned no items');
      return { ingested: 0, skipped: 0, items: [] };
    }

    logger.debug({ source: source.id, itemCount: feed.items.length }, 'RSS feed parsed');

    // Process items
    const processedItems: ProcessedItem[] = [];
    let skipped = 0;

    for (const item of feed.items) {
      try {
        // Skip if item is too old (optional: can be configured)
        if (item.pubDate) {
          const pubDate = new Date(item.pubDate).getTime();
          const ageDays = (Date.now() - pubDate) / (1000 * 60 * 60 * 24);
          
          // Skip items older than 7 days for news, 30 days for others
          const maxAge = source.category === 'news' ? 7 : 30;
          if (ageDays > maxAge) {
            skipped++;
            continue;
          }
        }

        // Extract URL
        const url = item.link || item.guid || '';
        if (!url) {
          skipped++;
          continue;
        }

        // Generate URL hash for deduplication
        const urlHash = createHash('sha256').update(url).digest('hex');

        // Extract title and summary
        const title = item.title || 'Untitled';
        let summary = item.contentSnippet || item.content || item.description || '';
        
        // Clean HTML from summary
        summary = summary.replace(/<[^>]*>/g, '');
        
        // Remove RSS feed artifacts (common in Hacker News and similar feeds)
        summary = summary
          .replace(/Article URL:\s*https?:\/\/[^\s]+/gi, '')
          .replace(/Comments URL:\s*https?:\/\/[^\s]+/gi, '')
          .replace(/Points:\s*\d+/gi, '')
          .replace(/#\s*Comments:\s*\d+/gi, '')
          .replace(/Comments:\s*\d+/gi, '')
          .replace(/Examples:\s*/gi, '')
          .replace(/See more:\s*/gi, '')
          .replace(/Read more:\s*/gi, '')
          .replace(/Continue reading[^.]*\./gi, '')
          .replace(/View on.*/gi, '');
        
        // Clean up whitespace and limit length
        const cleanSummary = summary
          .replace(/\s+/g, ' ')
          .trim()
          .substring(0, 500); // Limit length

        // Extract published date
        const publishedDate = item.pubDate 
          ? new Date(item.pubDate).getTime()
          : Date.now();

        // Calculate priority
        const priority = calculatePriority(item, source, publishedDate);

        // Calculate expiration
        const expiresAt = calculateTTL(source.category);

        // Extract metadata
        const metadata: Record<string, any> = {
          author: item.creator || item.author || null,
          categories: item.categories || [],
          guid: item.guid || null,
        };

        processedItems.push({
          url,
          urlHash,
          title,
          summary: cleanSummary,
          publishedDate,
          category: source.category,
          sourceType: source.type,
          sourceUrl: source.url,
          priority: Math.round(priority),
          expiresAt,
          metadata,
        });
      } catch (itemError: any) {
        logger.warn({ error: itemError.message, source: source.id }, 'Error processing RSS item');
        skipped++;
      }
    }

    const elapsed = Date.now() - startTime;
    logger.info({
      source: source.id,
      ingested: processedItems.length,
      skipped,
      elapsed,
    }, 'RSS feed processing complete');

    return {
      ingested: processedItems.length,
      skipped,
      items: processedItems,
    };
  } catch (error: any) {
    logger.error({ error: error.message, source: source.id }, 'RSS feed processing failed');
    return {
      ingested: 0,
      skipped: 0,
      items: [],
      error: error.message,
    };
  }
}

