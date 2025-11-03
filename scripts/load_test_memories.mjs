#!/usr/bin/env node
/**
 * Script to load test memories for a specific user
 * Usage: node scripts/load_test_memories.mjs [email] [numMemories]
 */

import Database from 'better-sqlite3';
import { randomBytes } from 'crypto';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Default values
const DEFAULT_EMAIL = 'dparker918@yahoo.com';
const DEFAULT_COUNT = 10;

const email = process.argv[2] || DEFAULT_EMAIL;
const numMemories = parseInt(process.argv[3] || DEFAULT_COUNT, 10);

// Database path
const dbPath = join(__dirname, '..', 'apps', 'memory-service', 'data', 'memory.db');

console.log(`Loading ${numMemories} test memories for: ${email}`);
console.log(`Database: ${dbPath}`);

// Open database
const db = new Database(dbPath);

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL');

// Prepare insert statement (matching the exact MemoryModel.create format)
const insertStmt = db.prepare(`
  INSERT INTO memories (
    id, userId, threadId, content, entities, priority, confidence, redactionMap,
    tier, sourceThreadId, repeats, threadSet, lastSeenTs,
    createdAt, updatedAt, deletedAt
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

// Sample memory content templates
const memoryTemplates = [
  {
    content: 'User prefers dark mode UI and compact layouts',
    priority: 0.85,
    tier: 'TIER1',
    entities: JSON.stringify(['ui_preference', 'dark_mode', 'layout']),
  },
  {
    content: 'User is interested in TypeScript and React development',
    priority: 0.80,
    tier: 'TIER1',
    entities: JSON.stringify(['typescript', 'react', 'development', 'programming']),
  },
  {
    content: 'User works on distributed systems and microservices architecture',
    priority: 0.75,
    tier: 'TIER1',
    entities: JSON.stringify(['distributed_systems', 'microservices', 'architecture']),
  },
  {
    content: 'User prefers concise explanations over verbose ones',
    priority: 0.70,
    tier: 'TIER2',
    entities: JSON.stringify(['communication_style', 'preference']),
  },
  {
    content: 'User frequently asks about database optimization and query performance',
    priority: 0.75,
    tier: 'TIER1',
    entities: JSON.stringify(['database', 'optimization', 'performance', 'queries']),
  },
  {
    content: 'User is working on a memory feature for an LLM gateway system',
    priority: 0.90,
    tier: 'TIER1',
    entities: JSON.stringify(['llm', 'memory', 'gateway', 'feature_development']),
  },
  {
    content: 'User likes to test features manually before automated testing',
    priority: 0.65,
    tier: 'TIER2',
    entities: JSON.stringify(['testing', 'manual_testing', 'workflow']),
  },
  {
    content: 'User prefers Node.js and TypeScript for backend services',
    priority: 0.70,
    tier: 'TIER1',
    entities: JSON.stringify(['nodejs', 'typescript', 'backend', 'technology']),
  },
  {
    content: 'User uses SQLite databases for local development',
    priority: 0.65,
    tier: 'TIER2',
    entities: JSON.stringify(['sqlite', 'database', 'development', 'local']),
  },
  {
    content: 'User is interested in RAG (Retrieval Augmented Generation) systems',
    priority: 0.80,
    tier: 'TIER1',
    entities: JSON.stringify(['rag', 'retrieval_augmented_generation', 'ai', 'llm']),
  },
  {
    content: 'User prefers async/await over promises for async code',
    priority: 0.60,
    tier: 'TIER3',
    entities: JSON.stringify(['async', 'programming_style', 'javascript']),
  },
  {
    content: 'User frequently references documentation and prefers code examples',
    priority: 0.70,
    tier: 'TIER2',
    entities: JSON.stringify(['documentation', 'code_examples', 'learning_style']),
  },
  {
    content: 'User works with Fastify for API development',
    priority: 0.65,
    tier: 'TIER2',
    entities: JSON.stringify(['fastify', 'api', 'framework', 'backend']),
  },
  {
    content: 'User is familiar with vector databases and embeddings',
    priority: 0.75,
    tier: 'TIER1',
    entities: JSON.stringify(['vector_database', 'embeddings', 'ai', 'rag']),
  },
  {
    content: 'User prefers Git for version control and uses feature branches',
    priority: 0.60,
    tier: 'TIER3',
    entities: JSON.stringify(['git', 'version_control', 'workflow']),
  },
];

// Generate a unique ID
function generateId() {
  return randomBytes(16).toString('hex');
}

// Generate a thread ID
function generateThreadId() {
  return `thread_${randomBytes(8).toString('hex')}`;
}


// Generate memories
const memories = [];
const now = Math.floor(Date.now());
const templatesToUse = [...memoryTemplates, ...memoryTemplates]; // Duplicate to have more variety

for (let i = 0; i < numMemories; i++) {
  const template = templatesToUse[i % templatesToUse.length];
  const threadId = generateThreadId();
  const memoryId = generateId();
  
  // Vary timestamps slightly
  const createdAt = now - (i * 3600000); // Spread over hours (already integer)
  const updatedAt = createdAt + Math.floor(Math.random() * 86400000); // Updated within a day
  
  const priority = Math.max(0, Math.min(1, template.priority + (Math.random() * 0.1 - 0.05))); // Clamp to 0-1
  const confidence = Math.max(0, Math.min(1, 0.7 + (Math.random() * 0.2))); // Clamp to 0-1
  
  const createdAtInt = Math.floor(createdAt);
  const updatedAtInt = Math.floor(updatedAt);
  const lastSeenTsInt = Math.floor(updatedAt);
  
  memories.push({
    id: memoryId,
    userId: email,
    threadId: threadId,
    content: template.content,
    entities: template.entities || null,
    priority: priority,  // Already a number
    confidence: confidence,  // Already a number
    redactionMap: null,
    tier: template.tier,
    sourceThreadId: threadId || null,
    repeats: 1,
    threadSet: JSON.stringify([threadId]) || null,
    lastSeenTs: lastSeenTsInt,
    createdAt: createdAtInt,
    updatedAt: updatedAtInt,
    deletedAt: null,
  });
}

// Insert memories
try {
  // Temporarily disable FTS triggers to avoid datatype mismatch issues
  db.exec('DROP TRIGGER IF EXISTS memories_fts_insert');
  db.exec('DROP TRIGGER IF EXISTS memories_fts_delete');
  
  console.log(`Inserting ${memories.length} memories...`);
  for (const memory of memories) {
    insertStmt.run(
      memory.id,
      memory.userId,
      memory.threadId,
      memory.content,
      memory.entities,
      memory.priority,
      memory.confidence,
      memory.redactionMap,
      memory.tier,
      memory.sourceThreadId,
      memory.repeats,
      memory.threadSet,
      memory.lastSeenTs,
      memory.createdAt,
      memory.updatedAt,
      memory.deletedAt
    );
  }
  
  // Re-enable FTS triggers
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS memories_fts_insert AFTER INSERT ON memories BEGIN
      INSERT INTO memories_fts(rowid, content, userId, threadId) 
      VALUES (new.id, new.content, new.userId, new.threadId);
    END
  `);
  
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS memories_fts_delete AFTER UPDATE ON memories 
      WHEN new.deletedAt IS NOT NULL BEGIN
      DELETE FROM memories_fts WHERE rowid = new.id;
    END
  `);
  
  // Note: FTS indexing is skipped due to TEXT ID vs INTEGER rowid mismatch
  // This doesn't affect memory storage or retrieval functionality
  
  console.log(`\n✅ Successfully inserted ${memories.length} memories`);
  
  // Verify count
  const countStmt = db.prepare('SELECT COUNT(*) as count FROM memories WHERE userId = ? AND deletedAt IS NULL');
  const result = countStmt.get(email);
  console.log(`\nTotal memories for ${email}: ${result.count}`);
  
  // Show tier distribution
  const tierStmt = db.prepare(`
    SELECT tier, COUNT(*) as count 
    FROM memories 
    WHERE userId = ? AND deletedAt IS NULL 
    GROUP BY tier
  `);
  const tiers = tierStmt.all(email);
  console.log('\nTier distribution:');
  tiers.forEach(tier => {
    console.log(`  ${tier.tier}: ${tier.count}`);
  });
  
  // Show priority range
  const priorityStmt = db.prepare(`
    SELECT MIN(priority) as min, MAX(priority) as max, AVG(priority) as avg
    FROM memories 
    WHERE userId = ? AND deletedAt IS NULL
  `);
  const priority = priorityStmt.get(email);
  console.log(`\nPriority range: ${priority.min.toFixed(2)} - ${priority.max.toFixed(2)} (avg: ${priority.avg.toFixed(2)})`);
  
} catch (error) {
  console.error('\n❌ Error inserting memories:', error);
  process.exit(1);
} finally {
  db.close();
}

console.log('\n✅ Done!');

