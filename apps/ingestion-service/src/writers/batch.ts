/**
 * Batch Writer
 * Efficiently writes processed items to database in batches
 */

import { createHash } from 'crypto';
import { pino } from 'pino';
import type { IngestionDatabase } from '../db.js';
import type { ProcessedItem } from '../processors/rss.js';

const logger = pino({ name: 'batch-writer' });

/**
 * Check if items are duplicates (already in database)
 */
function findDuplicates(
  db: IngestionDatabase,
  urlHashes: string[]
): Set<string> {
  if (urlHashes.length === 0) return new Set();

  // Use IN clause (SQLite supports up to 999 parameters)
  const placeholders = urlHashes.map(() => '?').join(',');
  const rows = db.prepare(`
    SELECT url_hash FROM ingested_content 
    WHERE url_hash IN (${placeholders})
  `).all(...urlHashes) as Array<{ url_hash: string }>;

  return new Set(rows.map(r => r.url_hash));
}

/**
 * Batch insert items into database
 */
export async function batchWriteItems(
  db: IngestionDatabase,
  items: ProcessedItem[],
  batchSize: number = 100
): Promise<{ ingested: number; skipped: number }> {
  if (items.length === 0) {
    return { ingested: 0, skipped: 0 };
  }

  // Generate IDs and check for duplicates
  const itemsWithIds = items.map(item => ({
    ...item,
    id: item.urlHash.substring(0, 16) + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 9),
  }));

  const urlHashes = itemsWithIds.map(item => item.urlHash);
  const duplicates = findDuplicates(db, urlHashes);

  // Filter out duplicates
  const newItems = itemsWithIds.filter(item => !duplicates.has(item.urlHash));
  const skipped = items.length - newItems.length;

  if (newItems.length === 0) {
    logger.debug({ total: items.length, duplicates: skipped }, 'All items were duplicates');
    return { ingested: 0, skipped };
  }

  // Prepare insert statement
  const insertStmt = db.prepare(`
    INSERT INTO ingested_content (
      id, source_type, source_url, url, url_hash, title, summary,
      published_date, ingested_at, expires_at, category,
      metadata, priority, source_authority, content_hash, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
  `);

  // Batch insert
  const insertBatch = db.transaction((batch: typeof newItems) => {
    for (const item of batch) {
      const contentHash = item.summary 
        ? createHash('sha256').update(item.summary).digest('hex').substring(0, 16)
        : null;

      insertStmt.run(
        item.id,
        item.sourceType,
        item.sourceUrl,
        item.url,
        item.urlHash,
        item.title,
        item.summary,
        item.publishedDate,
        Date.now(),
        item.expiresAt,
        item.category,
        JSON.stringify(item.metadata),
        item.priority,
        0.5, // Default source authority (can be enhanced later)
        contentHash
      );
    }
  });

  // Process in batches
  let ingested = 0;
  for (let i = 0; i < newItems.length; i += batchSize) {
    const batch = newItems.slice(i, i + batchSize);
    try {
      insertBatch(batch);
      ingested += batch.length;
      logger.debug({ batchSize: batch.length, total: ingested }, 'Batch inserted');
    } catch (error: any) {
      logger.error({ error: error.message, batchStart: i }, 'Batch insert failed');
      // Continue with next batch
    }
  }

  logger.info({
    total: items.length,
    ingested,
    skipped: skipped + (items.length - ingested - skipped),
  }, 'Batch write complete');

  return { ingested, skipped: skipped + (items.length - ingested - skipped) };
}

/**
 * Update source last fetch time and statistics
 */
export function updateSourceStats(
  db: IngestionDatabase,
  sourceId: string,
  ingested: number,
  skipped: number,
  success: boolean
): void {
  const now = Date.now();
  
  if (success) {
    db.prepare(`
      UPDATE sources
      SET last_fetch_at = ?,
          success_count = success_count + 1,
          failure_count = CASE WHEN failure_count > 0 THEN failure_count - 1 ELSE 0 END
      WHERE id = ?
    `).run(now, sourceId);
  } else {
    db.prepare(`
      UPDATE sources
      SET failure_count = failure_count + 1
      WHERE id = ?
    `).run(sourceId);
  }
}

