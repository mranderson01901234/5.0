#!/usr/bin/env node

/**
 * Initialize Gateway Database
 * This script initializes the gateway database with all optimizations
 */

import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { mkdirSync } from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');

const GATEWAY_DB = join(ROOT, 'apps/llm-gateway/gateway.db');

console.log('🔧 Initializing Gateway Database...\n');
console.log('Database path:', GATEWAY_DB);

try {
  // Ensure directory exists
  mkdirSync(dirname(GATEWAY_DB), { recursive: true });
  
  const db = new Database(GATEWAY_DB);

  console.log('\n📋 Setting PRAGMAs...');
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('temp_store = MEMORY');
  db.pragma('mmap_size = 268435456');
  db.pragma('cache_size = -80000');
  db.pragma('foreign_keys = ON');
  db.pragma('page_size = 8192');
  db.pragma('auto_vacuum = INCREMENTAL');
  console.log('✅ PRAGMAs configured');

  console.log('\n📋 Creating tables...');
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
      embedding_id TEXT,
      summary_embedding BLOB,
      embedding_updated_at INTEGER
    );
  `);
  console.log('✅ Tables created');

  console.log('\n📋 Creating indexes...');
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_messages_thread_time ON messages(thread_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_messages_user_thread ON messages(user_id, thread_id) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_summaries_user ON thread_summaries(user_id) WHERE deleted_at IS NULL;
    
    CREATE INDEX IF NOT EXISTS idx_messages_user_content 
      ON messages(user_id, content) 
      WHERE deleted_at IS NULL;
    
    CREATE INDEX IF NOT EXISTS idx_messages_user_time 
      ON messages(user_id, created_at DESC) 
      WHERE deleted_at IS NULL;
    
    CREATE INDEX IF NOT EXISTS idx_summaries_updated 
      ON thread_summaries(updated_at DESC) 
      WHERE deleted_at IS NULL;
    
    CREATE INDEX IF NOT EXISTS idx_summaries_embedding 
      ON thread_summaries(embedding_id) 
      WHERE embedding_id IS NOT NULL;
  `);
  console.log('✅ Indexes created');

  console.log('\n📋 Setting up FTS5...');
  try {
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
        content, 
        thread_id,
        user_id,
        content=messages,
        content_rowid=id
      );

      CREATE TRIGGER IF NOT EXISTS messages_fts_insert AFTER INSERT ON messages BEGIN
        INSERT INTO messages_fts(rowid, content, thread_id, user_id) 
        VALUES (new.id, new.content, new.thread_id, new.user_id);
      END;

      CREATE TRIGGER IF NOT EXISTS messages_fts_delete AFTER UPDATE ON messages 
        WHEN new.deleted_at IS NOT NULL BEGIN
        DELETE FROM messages_fts WHERE rowid = new.id;
      END;
    `);
    console.log('✅ FTS5 configured');
  } catch (e) {
    console.log('⚠️  FTS5 not available (this is optional):', e.message);
  }

  // Verify
  console.log('\n📊 Verification:');
  const journalMode = db.pragma('journal_mode', { simple: true });
  const pageSize = db.pragma('page_size', { simple: true });
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'").all();
  
  console.log(`  Journal Mode: ${journalMode}`);
  console.log(`  Page Size: ${pageSize}`);
  console.log(`  Tables: ${tables.length}`);
  console.log(`  Indexes: ${indexes.length}`);

  db.close();
  
  console.log('\n✅ Gateway database initialized successfully!\n');
  process.exit(0);
} catch (error) {
  console.error('\n❌ Error initializing database:', error.message);
  process.exit(1);
}

