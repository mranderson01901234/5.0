import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { mkdirSync } from 'fs';
import { logger } from './log.js';

let db: Database.Database | null = null;

export function getDatabase(): Database.Database {
  if (!db) {
    const dbPath = process.env.DB_PATH || join(process.cwd(), 'gateway.db');
    
    // Ensure directory exists before creating database
    const dbDir = dirname(dbPath);
    try {
      mkdirSync(dbDir, { recursive: true });
    } catch (error: any) {
      if (error.code !== 'EEXIST') {
        logger.error({ error, dbDir }, 'Failed to create database directory');
        throw error;
      }
    }
    
    db = new Database(dbPath);

    // PRAGMAs - Optimized for performance and RAG readiness
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.pragma('temp_store = MEMORY');
    db.pragma('mmap_size = 268435456'); // 256MB
    db.pragma('cache_size = -80000'); // ~80MB
    db.pragma('foreign_keys = ON');
    db.pragma('page_size = 8192'); // Match memory-service for consistency
    db.pragma('auto_vacuum = INCREMENTAL'); // Optimize database growth

    // Tables
    db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        thread_id TEXT NOT NULL,
        user_id TEXT,
        role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (unixepoch('now')),
        meta JSON,
        important INTEGER NOT NULL DEFAULT 0,
        provider TEXT,
        model TEXT,
        tokens_input INTEGER,
        tokens_output INTEGER,
        deleted_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS thread_summaries (
        thread_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        summary TEXT NOT NULL,
        last_msg_id TEXT,
        token_count INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL DEFAULT (unixepoch('now')),
        deleted_at INTEGER,
        -- RAG-specific columns
        embedding_id TEXT,
        summary_embedding BLOB,
        embedding_updated_at INTEGER
      );

      -- Standard indexes (created after table creation)
      CREATE INDEX IF NOT EXISTS idx_messages_thread_time ON messages(thread_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_messages_user_thread ON messages(user_id, thread_id) WHERE deleted_at IS NULL;
      CREATE INDEX IF NOT EXISTS idx_summaries_user ON thread_summaries(user_id) WHERE deleted_at IS NULL;
      
      -- RAG-optimized indexes for query performance
      CREATE INDEX IF NOT EXISTS idx_messages_user_time 
        ON messages(user_id, created_at DESC) 
        WHERE deleted_at IS NULL;
      
      CREATE INDEX IF NOT EXISTS idx_summaries_updated 
        ON thread_summaries(updated_at DESC) 
        WHERE deleted_at IS NULL;

      -- Cost tracking table
      CREATE TABLE IF NOT EXISTS cost_tracking (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        model TEXT NOT NULL,
        input_tokens INTEGER NOT NULL,
        output_tokens INTEGER NOT NULL,
        input_cost REAL NOT NULL,
        output_cost REAL NOT NULL,
        total_cost REAL NOT NULL,
        timestamp INTEGER NOT NULL DEFAULT (unixepoch('now'))
      );

      -- Indexes for cost tracking
      CREATE INDEX IF NOT EXISTS idx_cost_tracking_user_time ON cost_tracking(user_id, timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_cost_tracking_model_time ON cost_tracking(model, timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_cost_tracking_timestamp ON cost_tracking(timestamp DESC);
    `);

    // Migration: Add missing columns to existing tables (if they don't exist)
    try {
      db.prepare('ALTER TABLE thread_summaries ADD COLUMN last_msg_id TEXT').run();
    } catch (e: any) {
      // Column may already exist, ignore
      if (!e.message?.includes('duplicate column')) {
        logger.warn({ error: e.message }, 'Failed to add last_msg_id column');
      }
    }
    
    try {
      db.prepare('ALTER TABLE thread_summaries ADD COLUMN token_count INTEGER NOT NULL DEFAULT 0').run();
    } catch (e: any) {
      if (!e.message?.includes('duplicate column')) {
        logger.warn({ error: e.message }, 'Failed to add token_count column');
      }
    }
    
    try {
      db.prepare('ALTER TABLE thread_summaries ADD COLUMN embedding_id TEXT').run();
    } catch (e: any) {
      if (!e.message?.includes('duplicate column')) {
        logger.warn({ error: e.message }, 'Failed to add embedding_id column');
      }
    }
    
    try {
      db.prepare('ALTER TABLE thread_summaries ADD COLUMN summary_embedding BLOB').run();
    } catch (e: any) {
      if (!e.message?.includes('duplicate column')) {
        logger.warn({ error: e.message }, 'Failed to add summary_embedding column');
      }
    }
    
    try {
      db.prepare('ALTER TABLE thread_summaries ADD COLUMN embedding_updated_at INTEGER').run();
    } catch (e: any) {
      if (!e.message?.includes('duplicate column')) {
        logger.warn({ error: e.message }, 'Failed to add embedding_updated_at column');
      }
    }
    
    // Update user_id to NOT NULL if it's nullable (for existing records)
    try {
      db.exec(`
        UPDATE thread_summaries SET user_id = '' WHERE user_id IS NULL;
      `);
    } catch (e: any) {
      logger.warn({ error: e.message }, 'Failed to update nullable user_id');
    }

    // Create embedding index after columns are added
    try {
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_summaries_embedding 
          ON thread_summaries(embedding_id) 
          WHERE embedding_id IS NOT NULL;
      `);
    } catch (e: any) {
      logger.warn({ error: e.message }, 'Failed to create embedding index (may not be needed yet)');
    }

    // FTS5 Full-Text Search - Re-enabled with proper migration
    // Clean up any orphaned/corrupted FTS tables from previous installations
    try {
      db.exec(`
        DROP TRIGGER IF EXISTS messages_fts_insert;
        DROP TRIGGER IF EXISTS messages_fts_update;
        DROP TRIGGER IF EXISTS messages_fts_delete;
        DROP TABLE IF EXISTS messages_fts;
        DROP TABLE IF EXISTS messages_fts_data;
        DROP TABLE IF EXISTS messages_fts_idx;
        DROP TABLE IF EXISTS messages_fts_config;
        DROP TABLE IF EXISTS messages_fts_docsize;
      `);
      logger.debug('Cleaned up old FTS tables');
    } catch (e: any) {
      logger.warn({ error: e.message }, 'Failed to drop orphaned FTS tables');
    }

    // Enable FTS5 for full-text search (hybrid semantic + keyword search)
    try {
      // Create FTS5 virtual table with external content (references messages table)
      db.exec(`
        CREATE VIRTUAL TABLE messages_fts USING fts5(
          content,
          content=messages,
          content_rowid=id,
          tokenize='porter unicode61'
        );
      `);

      // Populate FTS table with existing messages
      const existingMessagesCount = db.prepare('SELECT COUNT(*) as count FROM messages WHERE deleted_at IS NULL').get() as { count: number };
      if (existingMessagesCount.count > 0) {
        db.exec(`
          INSERT INTO messages_fts(rowid, content)
          SELECT id, content FROM messages WHERE deleted_at IS NULL;
        `);
        logger.info({ count: existingMessagesCount.count }, 'Populated FTS5 with existing messages');
      }

      // Triggers to keep FTS in sync with messages table
      db.exec(`
        -- Trigger for new message inserts
        CREATE TRIGGER messages_fts_insert AFTER INSERT ON messages BEGIN
          INSERT INTO messages_fts(rowid, content)
          VALUES (new.id, new.content);
        END;

        -- Trigger for message updates (only if content changed)
        CREATE TRIGGER messages_fts_update AFTER UPDATE ON messages
          WHEN old.content != new.content AND new.deleted_at IS NULL BEGIN
          UPDATE messages_fts SET content = new.content WHERE rowid = new.id;
        END;

        -- Trigger for message deletion (soft delete)
        CREATE TRIGGER messages_fts_delete AFTER UPDATE ON messages
          WHEN new.deleted_at IS NOT NULL BEGIN
          DELETE FROM messages_fts WHERE rowid = new.id;
        END;
      `);

      logger.info('✅ FTS5 full-text search enabled successfully');
    } catch (e: any) {
      logger.error({ error: e.message, stack: e.stack }, 'FTS5 setup failed - full-text search will be unavailable');
    }

    logger.info('Database initialized');
  }
  return db;
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

/**
 * Full-text search messages using FTS5
 * Returns messages ranked by relevance with BM25 scoring
 */
export interface FTS5SearchOptions {
  userId?: string;
  threadId?: string;
  limit?: number;
  offset?: number;
  includeSnippets?: boolean;
}

export interface FTS5SearchResult {
  id: number;
  thread_id: string;
  user_id: string;
  role: string;
  content: string;
  created_at: number;
  score: number;
  snippet?: string;
}

export function searchMessages(
  query: string,
  options: FTS5SearchOptions = {}
): FTS5SearchResult[] {
  const db = getDatabase();

  const {
    userId,
    threadId,
    limit = 20,
    offset = 0,
    includeSnippets = true,
  } = options;

  // Build WHERE clause
  const conditions: string[] = ['m.deleted_at IS NULL'];
  const params: any[] = [query];

  if (userId) {
    conditions.push('m.user_id = ?');
    params.push(userId);
  }

  if (threadId) {
    conditions.push('m.thread_id = ?');
    params.push(threadId);
  }

  params.push(limit, offset);

  const whereClause = conditions.join(' AND ');

  // Build SELECT clause
  const selectFields = includeSnippets
    ? `m.id, m.thread_id, m.user_id, m.role, m.content, m.created_at,
       bm25(messages_fts) as score,
       snippet(messages_fts, 0, '<mark>', '</mark>', '...', 32) as snippet`
    : `m.id, m.thread_id, m.user_id, m.role, m.content, m.created_at,
       bm25(messages_fts) as score`;

  const sql = `
    SELECT ${selectFields}
    FROM messages m
    JOIN messages_fts ON messages_fts.rowid = m.id
    WHERE messages_fts MATCH ? AND ${whereClause}
    ORDER BY bm25(messages_fts)
    LIMIT ? OFFSET ?
  `;

  try {
    const results = db.prepare(sql).all(...params) as FTS5SearchResult[];
    return results;
  } catch (error: any) {
    logger.error({ error: error.message, query }, 'FTS5 search failed');
    return [];
  }
}

/**
 * Check if FTS5 is available and functional
 */
export function isFTS5Available(): boolean {
  try {
    const db = getDatabase();
    const result = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='messages_fts'`).get();
    return !!result;
  } catch {
    return false;
  }
}

/**
 * Extended database interface with custom methods
 */
export interface ExtendedDatabase extends Database.Database {
  searchMessages(query: string, options?: FTS5SearchOptions): FTS5SearchResult[];
  isFTS5Available(): boolean;
}

/**
 * Get database with extended methods
 */
export function getExtendedDatabase(): ExtendedDatabase {
  const db = getDatabase() as ExtendedDatabase;
  db.searchMessages = searchMessages;
  db.isFTS5Available = isFTS5Available;
  return db;
}

