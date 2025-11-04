#!/usr/bin/env node

/**
 * Audit Memory Database
 * Counts and reports on all memories stored in the database
 */

import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Database path - try multiple possible locations
const possiblePaths = [
  join(__dirname, '../apps/memory-service/data/memory.db'),
  join(process.cwd(), 'apps/memory-service/data/memory.db'),
  './data/memory.db',
  join(process.cwd(), 'data/memory.db'),
];

let dbPath = null;
for (const path of possiblePaths) {
  if (existsSync(path)) {
    dbPath = path;
    break;
  }
}

if (!dbPath) {
  console.error('❌ Memory database not found. Tried:');
  possiblePaths.forEach(p => console.error(`   - ${p}`));
  process.exit(1);
}

console.log(`📊 Auditing memory database: ${dbPath}\n`);

try {
  const db = new Database(dbPath, { readonly: true });

  // Total active memories (not deleted)
  const activeCount = db.prepare('SELECT COUNT(*) as count FROM memories WHERE deletedAt IS NULL').get();
  console.log(`✅ Active Memories: ${activeCount.count}`);

  // Total deleted memories
  const deletedCount = db.prepare('SELECT COUNT(*) as count FROM memories WHERE deletedAt IS NOT NULL').get();
  console.log(`🗑️  Deleted Memories: ${deletedCount.count}`);

  // Total memories (all)
  const totalCount = db.prepare('SELECT COUNT(*) as count FROM memories').get();
  console.log(`📦 Total Memories: ${totalCount.count}`);

  // Breakdown by tier
  console.log('\n📊 Breakdown by Tier:');
  const tierBreakdown = db.prepare(`
    SELECT tier, COUNT(*) as count 
    FROM memories 
    WHERE deletedAt IS NULL 
    GROUP BY tier 
    ORDER BY tier
  `).all();
  tierBreakdown.forEach(row => {
    console.log(`   ${row.tier || 'NULL'}: ${row.count}`);
  });

  // Breakdown by user
  console.log('\n👥 Breakdown by User:');
  const userBreakdown = db.prepare(`
    SELECT userId, COUNT(*) as count 
    FROM memories 
    WHERE deletedAt IS NULL 
    GROUP BY userId 
    ORDER BY count DESC
  `).all();
  userBreakdown.forEach(row => {
    console.log(`   ${row.userId}: ${row.count} memories`);
  });

  // Average priority
  const avgPriority = db.prepare('SELECT AVG(priority) as avg FROM memories WHERE deletedAt IS NULL').get();
  console.log(`\n⭐ Average Priority: ${(avgPriority.avg || 0).toFixed(3)}`);

  // Memory audits count
  const auditCount = db.prepare('SELECT COUNT(*) as count FROM memory_audits').get();
  console.log(`\n🔍 Memory Audits: ${auditCount.count}`);

  // Thread summaries count
  const summaryCount = db.prepare('SELECT COUNT(*) as count FROM thread_summaries WHERE deletedAt IS NULL').get();
  console.log(`📝 Thread Summaries: ${summaryCount.count}`);

  // User profiles count
  const profileCount = db.prepare('SELECT COUNT(*) as count FROM user_profiles WHERE deletedAt IS NULL').get();
  console.log(`👤 User Profiles: ${profileCount.count}`);

  // Database size
  const dbStats = db.prepare('PRAGMA page_count').get();
  const pageSize = db.prepare('PRAGMA page_size').get();
  const dbSizeBytes = (dbStats.page_count || 0) * (pageSize.page_size || 0);
  const dbSizeMB = (dbSizeBytes / (1024 * 1024)).toFixed(2);
  console.log(`\n💾 Database Size: ${dbSizeMB} MB`);

  // Recent memories (last 24 hours)
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const recentCount = db.prepare('SELECT COUNT(*) as count FROM memories WHERE createdAt >= ? AND deletedAt IS NULL').get(dayAgo);
  console.log(`⏰ Memories saved in last 24 hours: ${recentCount.count}`);

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('📊 SUMMARY');
  console.log('='.repeat(50));
  console.log(`Total Active Memories: ${activeCount.count}`);
  console.log(`Total Deleted Memories: ${deletedCount.count}`);
  console.log(`Total Records: ${totalCount.count}`);
  console.log(`Unique Users: ${userBreakdown.length}`);
  console.log(`Database Size: ${dbSizeMB} MB`);
  console.log('='.repeat(50));

  db.close();
} catch (error) {
  console.error('❌ Error auditing database:', error.message);
  process.exit(1);
}

