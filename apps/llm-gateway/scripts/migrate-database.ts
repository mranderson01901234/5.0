/**
 * Database migration script
 * Run this to ensure all tables exist in the gateway database
 * 
 * Usage: tsx scripts/migrate-database.ts
 */

import Database from 'better-sqlite3';
import { join } from 'path';
import { existsSync } from 'fs';

// Load environment variables from local .env first
import { config } from 'dotenv';
import { resolve } from 'path';

// Load local .env first, then fall back to shared
config({ path: resolve(process.cwd(), '.env') });

const dbPath = process.env.DB_PATH || join(process.cwd(), 'gateway.db');

console.log(`Migrating database at: ${dbPath}`);

if (!existsSync(dbPath)) {
  console.error(`Database file not found: ${dbPath}`);
  process.exit(1);
}

const db = new Database(dbPath);

try {
  // Check current tables
  const tables = db.prepare(`
    SELECT name FROM sqlite_master WHERE type='table' ORDER BY name
  `).all() as { name: string }[];
  
  console.log('\nExisting tables:', tables.map(t => t.name).join(', '));

  // Create artifacts table if missing
  console.log('\n✓ Creating artifacts table (if not exists)...');
  db.exec(`
    CREATE TABLE IF NOT EXISTS artifacts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      thread_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('table', 'doc', 'sheet', 'image')),
      data TEXT NOT NULL,
      metadata TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch('now')),
      deleted_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_artifacts_user_thread ON artifacts(user_id, thread_id) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_artifacts_thread ON artifacts(thread_id, created_at DESC) WHERE deleted_at IS NULL;
  `);

  // Create exports table if missing
  console.log('✓ Creating exports table (if not exists)...');
  db.exec(`
    CREATE TABLE IF NOT EXISTS exports (
      id TEXT PRIMARY KEY,
      artifact_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      format TEXT NOT NULL CHECK(format IN ('pdf', 'docx', 'xlsx')),
      url TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('queued', 'processing', 'completed', 'failed')) DEFAULT 'queued',
      created_at INTEGER NOT NULL DEFAULT (unixepoch('now')),
      FOREIGN KEY (artifact_id) REFERENCES artifacts(id)
    );

    CREATE INDEX IF NOT EXISTS idx_exports_artifact ON exports(artifact_id);
    CREATE INDEX IF NOT EXISTS idx_exports_user ON exports(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_exports_status ON exports(status, created_at DESC);
  `);

  // Create cost_tracking table if missing
  console.log('✓ Creating cost_tracking table (if not exists)...');
  db.exec(`
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

    CREATE INDEX IF NOT EXISTS idx_cost_tracking_user_time ON cost_tracking(user_id, timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_cost_tracking_model_time ON cost_tracking(model, timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_cost_tracking_timestamp ON cost_tracking(timestamp DESC);
  `);

  // Verify all tables now exist
  const updatedTables = db.prepare(`
    SELECT name FROM sqlite_master WHERE type='table' ORDER BY name
  `).all() as { name: string }[];
  
  console.log('\n✓ Migration complete!');
  console.log('Final tables:', updatedTables.map(t => t.name).join(', '));
  
  // Check if required tables exist
  const requiredTables = ['artifacts', 'exports', 'cost_tracking'];
  const missingTables = requiredTables.filter(
    table => !updatedTables.find(t => t.name === table)
  );
  
  if (missingTables.length > 0) {
    console.error('\n❌ Missing required tables:', missingTables.join(', '));
    process.exit(1);
  }
  
  console.log('\n✅ All required tables exist!');
  
} catch (error: any) {
  console.error('\n❌ Migration failed:', error.message);
  console.error(error.stack);
  process.exit(1);
} finally {
  db.close();
}

