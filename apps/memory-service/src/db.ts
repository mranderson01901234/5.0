// Load environment variables from root .env file
import '../../shared-env-loader.js';

import Database, { type Database as DatabaseType } from 'better-sqlite3';
import { pino } from 'pino';

const logger = pino({ name: 'memory-db' });

export function createDatabase(dbPath: string = './data/memory.db'): DatabaseType {
  const db = new Database(dbPath);

  // Optimized PRAGMAs per blueprint
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('temp_store = MEMORY');
  db.pragma('mmap_size = 268435456'); // 256MB
  db.pragma('cache_size = -80000'); // ~80MB
  db.pragma('page_size = 8192');
  db.pragma('auto_vacuum = INCREMENTAL');

  logger.info({
    journal_mode: db.pragma('journal_mode', { simple: true }),
    synchronous: db.pragma('synchronous', { simple: true }),
    mmap_size: db.pragma('mmap_size', { simple: true }),
    cache_size: db.pragma('cache_size', { simple: true }),
  });

  // Create schema
  db.exec(`
    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      threadId TEXT NOT NULL,
      content TEXT NOT NULL CHECK(length(content) <= 1024),
      entities TEXT,
      priority REAL NOT NULL DEFAULT 0.5 CHECK(priority >= 0 AND priority <= 1),
      confidence REAL NOT NULL DEFAULT 0.5 CHECK(confidence >= 0 AND confidence <= 1),
      redactionMap TEXT,
      tier TEXT CHECK(tier IN('TIER1','TIER2','TIER3')) DEFAULT 'TIER3',
      sourceThreadId TEXT,
      repeats INTEGER DEFAULT 1,
      threadSet TEXT,
      lastSeenTs INTEGER,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL,
      deletedAt INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_memories_user_thread
      ON memories(userId, threadId)
      WHERE deletedAt IS NULL;

    CREATE INDEX IF NOT EXISTS idx_memories_priority
      ON memories(priority DESC)
      WHERE deletedAt IS NULL;

    CREATE INDEX IF NOT EXISTS idx_memories_created
      ON memories(createdAt DESC);

    CREATE INDEX IF NOT EXISTS idx_memories_user_tier
      ON memories(userId, tier, updatedAt DESC);

    CREATE INDEX IF NOT EXISTS idx_memories_last_seen
      ON memories(userId, lastSeenTs DESC);

    CREATE TABLE IF NOT EXISTS memory_audits (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      threadId TEXT NOT NULL,
      startMsgId TEXT,
      endMsgId TEXT,
      tokenCount INTEGER NOT NULL CHECK(tokenCount >= 0),
      score REAL NOT NULL,
      saved INTEGER NOT NULL CHECK(saved >= 0),
      createdAt INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_audits_user_thread
      ON memory_audits(userId, threadId, createdAt DESC);

    CREATE INDEX IF NOT EXISTS idx_audits_created
      ON memory_audits(createdAt DESC);

    CREATE TABLE IF NOT EXISTS thread_summaries (
      threadId TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      summary TEXT NOT NULL,
      lastMsgId TEXT,
      tokenCount INTEGER NOT NULL DEFAULT 0,
      updatedAt INTEGER NOT NULL,
      deletedAt INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_summaries_user
      ON thread_summaries(userId, updatedAt DESC)
      WHERE deletedAt IS NULL;

    CREATE TABLE IF NOT EXISTS user_profiles (
      userId TEXT PRIMARY KEY,
      profile_json TEXT NOT NULL,
      lastUpdated INTEGER NOT NULL,
      deletedAt INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_profiles_updated
      ON user_profiles(lastUpdated DESC)
      WHERE deletedAt IS NULL;
  `);

  // Migration: Add embedding columns to memories table
  try {
    db.prepare('ALTER TABLE memories ADD COLUMN embedding_id TEXT').run();
  } catch (e: any) {
    if (!e.message?.includes('duplicate column')) {
      logger.warn({ error: e.message }, 'Failed to add embedding_id column to memories');
    }
  }
  
  try {
    db.prepare('ALTER TABLE memories ADD COLUMN embedding BLOB').run();
  } catch (e: any) {
    if (!e.message?.includes('duplicate column')) {
      logger.warn({ error: e.message }, 'Failed to add embedding column to memories');
    }
  }
  
  try {
    db.prepare('ALTER TABLE memories ADD COLUMN embedding_updated_at INTEGER').run();
  } catch (e: any) {
    if (!e.message?.includes('duplicate column')) {
      logger.warn({ error: e.message }, 'Failed to add embedding_updated_at column to memories');
    }
  }
  
  // Add deletedAt to thread_summaries if missing
  try {
    db.prepare('ALTER TABLE thread_summaries ADD COLUMN deletedAt INTEGER').run();
  } catch (e: any) {
    if (!e.message?.includes('duplicate column')) {
      logger.warn({ error: e.message }, 'Failed to add deletedAt column to thread_summaries');
    }
  }

  // RAG-optimized indexes for memory queries
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_memories_user_created 
      ON memories(userId, createdAt DESC) 
      WHERE deletedAt IS NULL;
    
    CREATE INDEX IF NOT EXISTS idx_memories_entities 
      ON memories(entities) 
      WHERE deletedAt IS NULL AND entities IS NOT NULL;
    
    CREATE INDEX IF NOT EXISTS idx_memories_embedding 
      ON memories(embedding_id) 
      WHERE embedding_id IS NOT NULL;
  `);

  // RAG-specific tables: memory_embeddings and memory_relationships
  db.exec(`
    CREATE TABLE IF NOT EXISTS memory_embeddings (
      memory_id TEXT PRIMARY KEY,
      vector_id TEXT NOT NULL UNIQUE,
      embedding_generated_at INTEGER NOT NULL,
      embedding_model TEXT NOT NULL DEFAULT 'text-embedding-3-small',
      FOREIGN KEY (memory_id) REFERENCES memories(id)
    );

    CREATE INDEX IF NOT EXISTS idx_memory_embeddings_vector 
      ON memory_embeddings(vector_id);

    CREATE TABLE IF NOT EXISTS memory_relationships (
      id TEXT PRIMARY KEY,
      source_memory_id TEXT NOT NULL,
      target_memory_id TEXT NOT NULL,
      relationship_type TEXT NOT NULL CHECK(relationship_type IN (
        'same_topic', 'temporal_sequence', 'causal', 
        'contextual', 'entity_related'
      )),
      strength REAL NOT NULL DEFAULT 0.5 CHECK(strength >= 0 AND strength <= 1),
      created_at INTEGER NOT NULL,
      FOREIGN KEY (source_memory_id) REFERENCES memories(id),
      FOREIGN KEY (target_memory_id) REFERENCES memories(id),
      UNIQUE(source_memory_id, target_memory_id, relationship_type)
    );

    CREATE INDEX IF NOT EXISTS idx_relationships_source 
      ON memory_relationships(source_memory_id, relationship_type);

    CREATE INDEX IF NOT EXISTS idx_relationships_target 
      ON memory_relationships(target_memory_id);

    CREATE INDEX IF NOT EXISTS idx_relationships_type 
      ON memory_relationships(relationship_type, strength DESC);
  `);

  // Embedding queue table for background embedding generation
  db.exec(`
    CREATE TABLE IF NOT EXISTS embedding_queue (
      id TEXT PRIMARY KEY,
      memoryId TEXT NOT NULL,
      content TEXT NOT NULL,
      retryCount INTEGER DEFAULT 0,
      createdAt INTEGER NOT NULL,
      processedAt INTEGER,
      error TEXT,
      FOREIGN KEY (memoryId) REFERENCES memories(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_embedding_queue_pending
      ON embedding_queue(processedAt, createdAt)
      WHERE processedAt IS NULL;

    CREATE INDEX IF NOT EXISTS idx_embedding_queue_memory
      ON embedding_queue(memoryId);
  `);

  // Enable FTS5 for full-text search on memories
  // FTS sync is handled manually via ftsSync.ts module to avoid trigger incompatibilities
  try {
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
        id UNINDEXED,
        content,
        userId UNINDEXED,
        threadId UNINDEXED
      );
    `);
    logger.info('FTS5 virtual table created successfully');
  } catch (e: any) {
    logger.warn({ error: e.message }, 'FTS5 setup failed (may not be available)');
  }

  logger.info('Database schema initialized');

  return db;
}

export type DatabaseConnection = DatabaseType;
