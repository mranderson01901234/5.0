/**
 * Ingestion Service Database
 * Separate database for ingested content (isolated from main app)
 */

import Database, { type Database as DatabaseType } from 'better-sqlite3';
import { pino } from 'pino';
import { mkdirSync } from 'fs';
import { dirname } from 'path';

const logger = pino({ name: 'ingestion-db' });

export function createIngestionDatabase(dbPath: string = './data/ingestion.db'): DatabaseType {
  // Ensure data directory exists
  mkdirSync(dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);

  // Optimized PRAGMAs for ingestion workload
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('temp_store = MEMORY');
  db.pragma('mmap_size = 268435456'); // 256MB
  db.pragma('cache_size = -80000'); // ~80MB
  db.pragma('page_size = 8192');
  db.pragma('auto_vacuum = INCREMENTAL');

  logger.info({
    dbPath,
    journal_mode: db.pragma('journal_mode', { simple: true }),
    synchronous: db.pragma('synchronous', { simple: true }),
  });

  // Create schema
  db.exec(`
    -- Ingested content from all sources
    CREATE TABLE IF NOT EXISTS ingested_content (
      id TEXT PRIMARY KEY,
      source_type TEXT NOT NULL,
      source_url TEXT NOT NULL,
      url TEXT NOT NULL,
      url_hash TEXT NOT NULL UNIQUE,
      title TEXT,
      content TEXT,
      summary TEXT,
      published_date INTEGER,
      ingested_at INTEGER NOT NULL,
      expires_at INTEGER,
      category TEXT,
      metadata TEXT,
      priority INTEGER DEFAULT 5,
      source_authority REAL DEFAULT 0.5,
      content_hash TEXT,
      status TEXT DEFAULT 'active',
      vector_id TEXT,
      embedded_at INTEGER,
      embedding_model TEXT
    );

    -- Indexes for fast retrieval
    CREATE INDEX IF NOT EXISTS idx_category_date 
      ON ingested_content(category, published_date DESC)
      WHERE status = 'active';

    CREATE INDEX IF NOT EXISTS idx_expires 
      ON ingested_content(expires_at) 
      WHERE expires_at IS NOT NULL AND status = 'active';

    CREATE INDEX IF NOT EXISTS idx_source_ingested 
      ON ingested_content(source_type, source_url, ingested_at DESC);

    CREATE INDEX IF NOT EXISTS idx_url_hash 
      ON ingested_content(url_hash);

    CREATE INDEX IF NOT EXISTS idx_priority_date
      ON ingested_content(priority DESC, published_date DESC)
      WHERE status = 'active';

    CREATE INDEX IF NOT EXISTS idx_vector_pending
      ON ingested_content(ingested_at DESC)
      WHERE vector_id IS NULL AND status = 'active';

    -- Track ingestion jobs
    CREATE TABLE IF NOT EXISTS ingestion_jobs (
      id TEXT PRIMARY KEY,
      source_type TEXT NOT NULL,
      source_identifier TEXT NOT NULL,
      status TEXT NOT NULL,
      started_at INTEGER,
      completed_at INTEGER,
      items_ingested INTEGER DEFAULT 0,
      items_skipped INTEGER DEFAULT 0,
      error TEXT,
      next_run_at INTEGER,
      last_success_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_jobs_status 
      ON ingestion_jobs(status, next_run_at);

    CREATE INDEX IF NOT EXISTS idx_jobs_source 
      ON ingestion_jobs(source_type, source_identifier);

    -- Track crawled URLs (for future sitemap support)
    CREATE TABLE IF NOT EXISTS crawled_urls (
      url_hash TEXT PRIMARY KEY,
      url TEXT NOT NULL,
      domain TEXT NOT NULL,
      last_crawled INTEGER,
      content_hash TEXT,
      crawl_count INTEGER DEFAULT 1,
      last_status_code INTEGER,
      etag TEXT,
      last_modified TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_crawled_domain 
      ON crawled_urls(domain, last_crawled DESC);

    -- Source configuration
    CREATE TABLE IF NOT EXISTS sources (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      url TEXT NOT NULL UNIQUE,
      name TEXT,
      category TEXT,
      enabled BOOLEAN DEFAULT true,
      update_interval INTEGER,
      priority INTEGER DEFAULT 5,
      rate_limit_per_hour INTEGER DEFAULT 60,
      last_fetch_at INTEGER,
      success_count INTEGER DEFAULT 0,
      failure_count INTEGER DEFAULT 0,
      metadata TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_sources_enabled
      ON sources(enabled, type) WHERE enabled = true;
  `);

  // Migration: Add embedding-related columns to existing tables
  try {
    db.prepare('ALTER TABLE ingested_content ADD COLUMN vector_id TEXT').run();
  } catch (e: any) {
    if (!e.message?.includes('duplicate column')) {
      logger.warn({ error: e.message }, 'Failed to add vector_id column');
    }
  }

  try {
    db.prepare('ALTER TABLE ingested_content ADD COLUMN embedded_at INTEGER').run();
  } catch (e: any) {
    if (!e.message?.includes('duplicate column')) {
      logger.warn({ error: e.message }, 'Failed to add embedded_at column');
    }
  }

  try {
    db.prepare('ALTER TABLE ingested_content ADD COLUMN embedding_model TEXT').run();
  } catch (e: any) {
    if (!e.message?.includes('duplicate column')) {
      logger.warn({ error: e.message }, 'Failed to add embedding_model column');
    }
  }

  // Create index for pending embeddings
  try {
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_vector_pending
        ON ingested_content(ingested_at DESC)
        WHERE vector_id IS NULL AND status = 'active';
    `);
  } catch (e: any) {
    logger.warn({ error: e.message }, 'Failed to create idx_vector_pending index');
  }

  logger.info('Ingestion database schema initialized');

  return db;
}

export type IngestionDatabase = DatabaseType;

