/**
 * Test script to manually trigger ingestion for a single source
 * Usage: tsx src/test-ingestion.ts <source-id>
 */

import '../../shared-env-loader.js';
import { createIngestionDatabase } from './db.js';
import { getEnabledSources } from './config.js';
import { processRSSFeed } from './processors/rss.js';
import { batchWriteItems, updateSourceStats } from './writers/batch.js';
import { pino } from 'pino';

const logger = pino({ name: 'test-ingestion' });

async function testIngestion(sourceId?: string) {
  const db = createIngestionDatabase('./data/ingestion.db');
  const sources = getEnabledSources(db);

  if (sourceId) {
    const source = sources.find(s => s.id === sourceId);
    if (!source) {
      logger.error({ sourceId, available: sources.map(s => s.id) }, 'Source not found');
      process.exit(1);
    }
    await processSource(source, db);
  } else {
    // Process first source as test
    const firstSource = sources[0];
    if (!firstSource) {
      logger.error('No enabled sources found');
      process.exit(1);
    }
    logger.info({ sourceId: firstSource.id }, 'Processing first source as test');
    await processSource(firstSource, db);
  }

  db.close();
  process.exit(0);
}

async function processSource(source: any, db: any) {
  logger.info({ source: source.id, url: source.url }, 'Processing source');

  const result = await processRSSFeed(source);
  
  if (result.error) {
    logger.error({ error: result.error, source: source.id }, 'Processing failed');
    return;
  }

  logger.info({ source: source.id, items: result.items.length }, 'Processing complete, writing to database');

  const writeResult = await batchWriteItems(db, result.items, 100);
  updateSourceStats(db, source.id, writeResult.ingested, writeResult.skipped, true);

  logger.info({
    source: source.id,
    ingested: writeResult.ingested,
    skipped: writeResult.skipped,
    total: result.items.length,
  }, 'Test ingestion complete');

  // Show sample items
  if (writeResult.ingested > 0) {
    const sample = db.prepare(`
      SELECT title, url, category, published_date 
      FROM ingested_content 
      WHERE source_url = ?
      ORDER BY ingested_at DESC 
      LIMIT 3
    `).all(source.url);

    logger.info({ sample }, 'Sample ingested items');
  }
}

const sourceId = process.argv[2];
testIngestion(sourceId).catch(error => {
  logger.error({ error }, 'Test failed');
  process.exit(1);
});

