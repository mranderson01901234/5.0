#!/usr/bin/env node
/**
 * Script to migrate memories from one userId to another
 * Usage: node scripts/migrate_memories_userid.mjs <oldUserId> <newUserId>
 */

import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const oldUserId = process.argv[2];
const newUserId = process.argv[3];

if (!oldUserId || !newUserId) {
  console.error('Usage: node scripts/migrate_memories_userid.mjs <oldUserId> <newUserId>');
  console.error('\nExample:');
  console.error('  node scripts/migrate_memories_userid.mjs dparker918@yahoo.com user_2abc123def');
  process.exit(1);
}

const dbPath = join(__dirname, '..', 'apps', 'memory-service', 'data', 'memory.db');

console.log(`Migrating memories from "${oldUserId}" to "${newUserId}"`);
console.log(`Database: ${dbPath}\n`);

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

// Check if old user has memories
const countStmt = db.prepare('SELECT COUNT(*) as count FROM memories WHERE userId = ? AND deletedAt IS NULL');
const oldCount = countStmt.get(oldUserId);
console.log(`Found ${oldCount.count} memories for old userId: ${oldUserId}`);

if (oldCount.count === 0) {
  console.log('No memories to migrate.');
  db.close();
  process.exit(0);
}

// Check if new user already has memories
const newCount = countStmt.get(newUserId);
console.log(`New userId "${newUserId}" currently has ${newCount.count} memories\n`);

// Update memories
const updateStmt = db.prepare('UPDATE memories SET userId = ?, updatedAt = ? WHERE userId = ? AND deletedAt IS NULL');
const result = db.transaction(() => {
  return updateStmt.run(newUserId, Date.now(), oldUserId);
})();

console.log(`✅ Migrated ${result.changes} memories`);

// Verify
const verifyCount = countStmt.get(newUserId);
console.log(`New userId "${newUserId}" now has ${verifyCount.count} memories`);

db.close();
console.log('\n✅ Migration complete!');

