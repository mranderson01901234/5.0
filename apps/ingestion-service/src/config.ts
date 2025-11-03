/**
 * Ingestion Service Configuration
 * Manages RSS feed sources and ingestion settings
 */

import { pino } from 'pino';

const logger = pino({ name: 'ingestion-config' });

export interface IngestionSource {
  id: string;
  type: 'rss' | 'sitemap' | 'news_api';
  url: string;
  name: string;
  category: string;
  enabled: boolean;
  updateInterval: number; // minutes
  priority: number; // 1-10
  rateLimitPerHour: number;
}

export interface IngestionConfig {
  enabled: boolean;
  dbPath: string;
  maxItemsPerHour: number;
  batchSize: number;
}

/**
 * Default RSS feed sources (Phase 1: 10 feeds)
 */
export const DEFAULT_RSS_SOURCES: IngestionSource[] = [
  // Technology
  {
    id: 'hackernews',
    type: 'rss',
    url: 'https://hnrss.org/frontpage',
    name: 'Hacker News',
    category: 'tech',
    enabled: true,
    updateInterval: 60,
    priority: 8,
    rateLimitPerHour: 60,
  },
  {
    id: 'techcrunch',
    type: 'rss',
    url: 'https://techcrunch.com/feed/',
    name: 'TechCrunch',
    category: 'tech',
    enabled: true,
    updateInterval: 60,
    priority: 7,
    rateLimitPerHour: 60,
  },
  {
    id: 'theverge',
    type: 'rss',
    url: 'https://www.theverge.com/rss/index.xml',
    name: 'The Verge',
    category: 'tech',
    enabled: true,
    updateInterval: 60,
    priority: 7,
    rateLimitPerHour: 60,
  },
  {
    id: 'ars-technica',
    type: 'rss',
    url: 'https://feeds.arstechnica.com/arstechnica/index',
    name: 'Ars Technica',
    category: 'tech',
    enabled: true,
    updateInterval: 60,
    priority: 6,
    rateLimitPerHour: 60,
  },
  // News
  {
    id: 'bbc-tech',
    type: 'rss',
    url: 'https://feeds.bbci.co.uk/news/technology/rss.xml',
    name: 'BBC Technology',
    category: 'news',
    enabled: true,
    updateInterval: 60,
    priority: 8,
    rateLimitPerHour: 60,
  },
  {
    id: 'reuters-tech',
    type: 'rss',
    url: 'https://www.reuters.com/technology/rss',
    name: 'Reuters Technology',
    category: 'news',
    enabled: true,
    updateInterval: 60,
    priority: 8,
    rateLimitPerHour: 60,
  },
  {
    id: 'guardian-tech',
    type: 'rss',
    url: 'https://www.theguardian.com/technology/rss',
    name: 'The Guardian Technology',
    category: 'news',
    enabled: true,
    updateInterval: 60,
    priority: 7,
    rateLimitPerHour: 60,
  },
  // Science
  {
    id: 'nature-news',
    type: 'rss',
    url: 'https://www.nature.com/nature.rss',
    name: 'Nature News',
    category: 'science',
    enabled: true,
    updateInterval: 120,
    priority: 9,
    rateLimitPerHour: 30,
  },
  {
    id: 'scientific-american',
    type: 'rss',
    url: 'https://rss.sciam.com/ScientificAmerican-Global',
    name: 'Scientific American',
    category: 'science',
    enabled: true,
    updateInterval: 120,
    priority: 7,
    rateLimitPerHour: 30,
  },
  // Programming
  {
    id: 'github-trending',
    type: 'rss',
    url: 'https://github.com/trending.atom',
    name: 'GitHub Trending',
    category: 'programming',
    enabled: true,
    updateInterval: 180,
    priority: 6,
    rateLimitPerHour: 20,
  },
];

export function loadIngestionConfig(): IngestionConfig {
  const enabled = process.env.INGESTION_ENABLED !== 'false';
  const dbPath = process.env.INGESTION_DB_PATH || './data/ingestion.db';
  const maxItemsPerHour = parseInt(process.env.INGESTION_MAX_ITEMS_PER_HOUR || '500', 10);
  const batchSize = parseInt(process.env.INGESTION_BATCH_SIZE || '100', 10);

  return {
    enabled,
    dbPath,
    maxItemsPerHour,
    batchSize,
  };
}

/**
 * Initialize sources in database
 */
export function initializeSources(db: any): void {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO sources (id, type, url, name, category, enabled, update_interval, priority, rate_limit_per_hour)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insert = db.transaction((sources: IngestionSource[]) => {
    for (const source of sources) {
      stmt.run(
        source.id,
        source.type,
        source.url,
        source.name,
        source.category,
        source.enabled ? 1 : 0,
        source.updateInterval,
        source.priority,
        source.rateLimitPerHour
      );
    }
  });

  insert(DEFAULT_RSS_SOURCES);
  logger.info({ count: DEFAULT_RSS_SOURCES.length }, 'Sources initialized');
}

/**
 * Get enabled sources from database
 */
export function getEnabledSources(db: any): IngestionSource[] {
  const rows = db.prepare(`
    SELECT * FROM sources WHERE enabled = 1
  `).all() as any[];

  return rows.map(row => ({
    id: row.id,
    type: row.type as 'rss' | 'sitemap' | 'news_api',
    url: row.url,
    name: row.name,
    category: row.category,
    enabled: row.enabled === 1,
    updateInterval: row.update_interval,
    priority: row.priority,
    rateLimitPerHour: row.rate_limit_per_hour,
  }));
}

