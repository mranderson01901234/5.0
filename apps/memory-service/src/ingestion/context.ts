/**
 * Ingested Content Context Retrieval
 * Retrieves relevant ingested content from ingestion database for query augmentation
 */

import { pino } from 'pino';
import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const logger = pino({ name: 'ingestion-context' });

let ingestionDb: DatabaseType | null = null;

// Resolve path relative to workspace root
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// From apps/memory-service/src/ingestion/ -> go up 4 levels to workspace root
// src/ingestion/ -> ../src/ -> ../../memory-service/ -> ../../../apps/ -> ../../../../ root
const workspaceRoot = resolve(__dirname, '../../../../');
const defaultDbPath = resolve(workspaceRoot, 'apps/ingestion-service/data/ingestion.db');
const INGESTION_DB_PATH = process.env.INGESTION_DB_PATH || defaultDbPath;

logger.debug({ dbPath: INGESTION_DB_PATH, workspaceRoot }, 'Ingestion database path resolved');

/**
 * Initialize connection to ingestion database
 */
function getIngestionDatabase(): DatabaseType | null {
  if (ingestionDb) {
    return ingestionDb;
  }

  try {
    ingestionDb = new Database(INGESTION_DB_PATH, { readonly: true });
    logger.info({ path: INGESTION_DB_PATH }, 'Ingestion database connected (read-only)');
    return ingestionDb;
  } catch (error: any) {
    logger.warn({ error: error.message, path: INGESTION_DB_PATH }, 'Failed to connect to ingestion database');
    return null;
  }
}

export interface IngestedContextItem {
  title: string;
  summary: string;
  url: string;
  category: string;
  publishedDate: number;
  source: string;
  priority: number;
}

/**
 * Retrieve relevant ingested content for a query
 * Returns top 3-5 most relevant items based on keyword matching and priority
 */
export async function retrieveIngestedContext(
  query: string,
  maxItems: number = 5
): Promise<IngestedContextItem[]> {
  const db = getIngestionDatabase();
  if (!db) {
    return [];
  }

  try {
    // Extract keywords from query (simple approach - can be enhanced with NLP)
    const keywords = query
      .toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 3)
      .slice(0, 5); // Use top 5 keywords

    if (keywords.length === 0) {
      return [];
    }

    // Search in title and summary
    // SQLite FTS5 would be better, but basic LIKE matching works for MVP
    const keywordConditions = keywords.map(() => 
      '(LOWER(title) LIKE ? OR LOWER(summary) LIKE ?)'
    ).join(' OR ');

    const params: any[] = [];
    keywords.forEach(keyword => {
      params.push(`%${keyword}%`, `%${keyword}%`);
    });

    const now = Date.now();
    const results = db.prepare(`
      SELECT 
        title,
        summary,
        url,
        category,
        published_date as publishedDate,
        source_url as source,
        priority
      FROM ingested_content
      WHERE status = 'active'
        AND expires_at > ?
        AND (${keywordConditions})
      ORDER BY priority DESC, published_date DESC
      LIMIT ?
    `).all(now, ...params, maxItems) as any[];

    if (results.length === 0) {
      logger.debug({ query, keywords }, 'No ingested content found for query');
      return [];
    }

    logger.debug({ query, keywords, found: results.length }, 'Retrieved ingested context');

    return results.map(r => ({
      title: r.title || '',
      summary: r.summary || '',
      url: r.url || '',
      category: r.category || 'general',
      publishedDate: r.publishedDate || Date.now(),
      source: r.source || '',
      priority: r.priority || 5,
    }));
  } catch (error: any) {
    logger.error({ error: error.message, query }, 'Failed to retrieve ingested context');
    return [];
  }
}

/**
 * Format ingested context as natural language for injection
 */
export function formatIngestedContext(items: IngestedContextItem[]): string {
  if (items.length === 0) {
    return '';
  }

  const formatted = items
    .slice(0, 3) // Limit to top 3 for injection
    .map((item, idx) => {
      const date = item.publishedDate 
        ? new Date(item.publishedDate).toLocaleDateString()
        : 'recent';
      return `${idx + 1}. ${item.title} (${date}): ${item.summary.substring(0, 150)}${item.summary.length > 150 ? '...' : ''}`;
    })
    .join('\n\n');

  return `Recent information from our knowledge base:\n${formatted}`;
}

