/**
 * Fix artifacts table CHECK constraint to include 'image' type
 * This script migrates existing databases that have the old constraint
 * 
 * Usage: tsx scripts/fix-artifacts-constraint.ts
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

console.log(`\n🔧 Fixing artifacts table constraint in: ${dbPath}`);

if (!existsSync(dbPath)) {
  console.error(`❌ Database file not found: ${dbPath}`);
  process.exit(1);
}

const db = new Database(dbPath);

try {
  // Check if artifacts table exists and get its schema
  const tableInfo = db.prepare(`
    SELECT sql FROM sqlite_master 
    WHERE type='table' AND name='artifacts'
  `).get() as { sql: string } | undefined;
  
  if (!tableInfo) {
    console.log('❌ Artifacts table does not exist. Creating it...');
    db.exec(`
      CREATE TABLE artifacts (
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
    console.log('✅ Artifacts table created with image support!');
  } else {
    console.log('\n📋 Current artifacts table schema:');
    console.log(tableInfo.sql);
    
    // Check if 'image' is already in the CHECK constraint
    if (tableInfo.sql.includes("'image'")) {
      console.log('\n✅ Artifacts table already supports image type. No migration needed!');
    } else {
      console.log('\n🔄 Migrating artifacts table to support image type...');
      
      // Get existing data
      const existingArtifacts = db.prepare('SELECT * FROM artifacts').all();
      console.log(`   Found ${existingArtifacts.length} existing artifact(s)`);
      
      // Begin transaction and disable foreign keys
      db.exec('PRAGMA foreign_keys = OFF');
      db.exec('BEGIN TRANSACTION');
      
      try {
        // Create new table with updated constraint
        db.exec(`
          CREATE TABLE artifacts_new (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            thread_id TEXT NOT NULL,
            type TEXT NOT NULL CHECK(type IN ('table', 'doc', 'sheet', 'image')),
            data TEXT NOT NULL,
            metadata TEXT,
            created_at INTEGER NOT NULL DEFAULT (unixepoch('now')),
            deleted_at INTEGER
          );
        `);
        
        // Copy data from old table to new table
        if (existingArtifacts.length > 0) {
          console.log('   Copying existing artifacts...');
          db.exec(`
            INSERT INTO artifacts_new (id, user_id, thread_id, type, data, metadata, created_at, deleted_at)
            SELECT id, user_id, thread_id, type, data, metadata, created_at, deleted_at
            FROM artifacts;
          `);
        }
        
        // Drop old table
        db.exec('DROP TABLE artifacts');
        
        // Rename new table to artifacts
        db.exec('ALTER TABLE artifacts_new RENAME TO artifacts');
        
        // Recreate indexes
        db.exec(`
          CREATE INDEX IF NOT EXISTS idx_artifacts_user_thread ON artifacts(user_id, thread_id) WHERE deleted_at IS NULL;
          CREATE INDEX IF NOT EXISTS idx_artifacts_thread ON artifacts(thread_id, created_at DESC) WHERE deleted_at IS NULL;
        `);
        
        // Commit transaction and re-enable foreign keys
        db.exec('COMMIT');
        db.exec('PRAGMA foreign_keys = ON');
        
        console.log('✅ Migration successful!');
        
        // Verify the new schema
        const newTableInfo = db.prepare(`
          SELECT sql FROM sqlite_master 
          WHERE type='table' AND name='artifacts'
        `).get() as { sql: string };
        
        console.log('\n📋 New artifacts table schema:');
        console.log(newTableInfo.sql);
        
        // Verify data was preserved
        const newCount = db.prepare('SELECT COUNT(*) as count FROM artifacts').get() as { count: number };
        console.log(`\n✅ Verified: ${newCount.count} artifact(s) preserved`);
        
      } catch (error) {
        // Rollback on error and re-enable foreign keys
        db.exec('ROLLBACK');
        db.exec('PRAGMA foreign_keys = ON');
        throw error;
      }
    }
  }
  
  console.log('\n🎉 Database is ready for image artifacts!');
  
} catch (error: any) {
  console.error('\n❌ Migration failed:', error.message);
  console.error(error.stack);
  process.exit(1);
} finally {
  db.close();
}

