#!/usr/bin/env node

/**
 * Database Status Checker
 * Verifies all database optimizations are in place
 */

import Database from 'better-sqlite3';
import { join } from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');

const GATEWAY_DB = join(ROOT, 'apps/llm-gateway/gateway.db');
const MEMORY_DB = join(ROOT, 'apps/memory-service/data/memory.db');

console.log('🔍 Database Status Check\n');
console.log('='.repeat(60));

let allGood = true;

// Check Gateway Database
console.log('\n📊 Gateway Database:', GATEWAY_DB);
if (existsSync(GATEWAY_DB)) {
  try {
    const db = new Database(GATEWAY_DB);
    
    // Check PRAGMAs
    console.log('\n  PRAGMA Settings:');
    const journalMode = db.pragma('journal_mode', { simple: true });
    const pageSize = db.pragma('page_size', { simple: true });
    const autoVacuum = db.pragma('auto_vacuum', { simple: true });
    const foreignKeys = db.pragma('foreign_keys', { simple: true });
    
    console.log(`    Journal Mode: ${journalMode} ${journalMode === 'wal' ? '✅' : '❌'}`);
    console.log(`    Page Size: ${pageSize} ${[4096, 8192].includes(pageSize) ? '✅' : '⚠️'}`);
    console.log(`    Auto Vacuum: ${autoVacuum} ${autoVacuum === 2 ? '✅ (INCREMENTAL)' : autoVacuum === 0 ? '⚠️ (NONE)' : '⚠️'}`);
    console.log(`    Foreign Keys: ${foreignKeys === 1 ? '✅ ON' : '❌ OFF'}`);
    
    // Check thread_summaries schema
    console.log('\n  thread_summaries Columns:');
    const cols = db.prepare('PRAGMA table_info(thread_summaries)').all();
    const colNames = cols.map(c => c.name);
    
    const requiredCols = ['thread_id', 'user_id', 'summary', 'last_msg_id', 'token_count', 
                          'updated_at', 'deleted_at', 'embedding_id', 'summary_embedding', 
                          'embedding_updated_at'];
    
    for (const col of requiredCols) {
      const exists = colNames.includes(col);
      console.log(`    ${col}: ${exists ? '✅' : '❌'}`);
      if (!exists) allGood = false;
    }
    
    // Check indexes
    console.log('\n  RAG Indexes:');
    const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'").all().map(r => r.name);
    const requiredIndexes = ['idx_messages_user_content', 'idx_messages_user_time', 
                            'idx_summaries_updated', 'idx_summaries_embedding'];
    
    for (const idx of requiredIndexes) {
      const exists = indexes.includes(idx);
      console.log(`    ${idx}: ${exists ? '✅' : '❌'}`);
      if (!exists) allGood = false;
    }
    
    // Check FTS5
    const ftsTables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%_fts'").all();
    console.log(`\n  FTS5 Tables: ${ftsTables.length > 0 ? '✅' : '⚠️'} (${ftsTables.length} found)`);
    if (ftsTables.length > 0) {
      ftsTables.forEach(t => console.log(`    - ${t.name}`));
    }
    
    // Check data
    const summaryCount = db.prepare('SELECT COUNT(*) as count FROM thread_summaries').get();
    const nullUserIdCount = db.prepare('SELECT COUNT(*) as count FROM thread_summaries WHERE user_id IS NULL').get();
    console.log(`\n  Data: ${summaryCount.count} summaries, ${nullUserIdCount.count} with NULL user_id`);
    if (nullUserIdCount.count > 0) {
      console.log(`    ⚠️  ${nullUserIdCount.count} summaries have NULL user_id`);
    }
    
    db.close();
  } catch (error) {
    console.error('  ❌ Error:', error.message);
    allGood = false;
  }
} else {
  console.log('  ⚠️  Database does not exist yet (will be created on first run)');
}

// Check Memory Database
console.log('\n📊 Memory Service Database:', MEMORY_DB);
if (existsSync(MEMORY_DB)) {
  try {
    const db = new Database(MEMORY_DB);
    
    // Check memories table embedding columns
    console.log('\n  memories Embedding Columns:');
    const cols = db.prepare('PRAGMA table_info(memories)').all();
    const colNames = cols.map(c => c.name);
    
    const requiredEmbeddingCols = ['embedding_id', 'embedding', 'embedding_updated_at'];
    for (const col of requiredEmbeddingCols) {
      const exists = colNames.includes(col);
      console.log(`    ${col}: ${exists ? '✅' : '❌'}`);
      if (!exists) allGood = false;
    }
    
    // Check RAG tables
    console.log('\n  RAG Tables:');
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('memory_embeddings', 'memory_relationships')").all();
    const tableNames = tables.map(t => t.name);
    
    console.log(`    memory_embeddings: ${tableNames.includes('memory_embeddings') ? '✅' : '❌'}`);
    console.log(`    memory_relationships: ${tableNames.includes('memory_relationships') ? '✅' : '❌'}`);
    if (tableNames.length < 2) allGood = false;
    
    // Check RAG indexes
    console.log('\n  RAG Indexes:');
    const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'").all().map(r => r.name);
    const requiredIndexes = ['idx_memories_user_created', 'idx_memories_entities', 
                            'idx_memories_embedding', 'idx_relationships_source'];
    
    for (const idx of requiredIndexes) {
      const exists = indexes.includes(idx);
      console.log(`    ${idx}: ${exists ? '✅' : '❌'}`);
      if (!exists) allGood = false;
    }
    
    // Check FTS5
    const ftsTables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%_fts'").all();
    console.log(`\n  FTS5 Tables: ${ftsTables.length > 0 ? '✅' : '⚠️'} (${ftsTables.length} found)`);
    if (ftsTables.length > 0) {
      ftsTables.forEach(t => console.log(`    - ${t.name}`));
    }
    
    // Check data
    const memoryCount = db.prepare('SELECT COUNT(*) as count FROM memories').get();
    console.log(`\n  Data: ${memoryCount.count} memories stored`);
    
    db.close();
  } catch (error) {
    console.error('  ❌ Error:', error.message);
    allGood = false;
  }
} else {
  console.log('  ⚠️  Database does not exist yet (will be created on first run)');
}

// Summary
console.log('\n' + '='.repeat(60));
if (allGood) {
  console.log('\n✅ All database optimizations are in place!\n');
  process.exit(0);
} else {
  console.log('\n⚠️  Some optimizations may be missing. Databases will be migrated on next startup.\n');
  process.exit(1);
}

