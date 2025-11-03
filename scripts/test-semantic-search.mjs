/**
 * Test script for semantic search implementation
 * Tests embedding generation, vector search, and hybrid search
 */

import { createDatabase } from '../apps/memory-service/src/db.js';
import { generateEmbedding, getOrGenerateEmbedding, addToEmbeddingQueue } from '../apps/memory-service/src/embedding-service.js';
import { findSimilarMemories, hybridSearch, keywordOnlySearch } from '../apps/memory-service/src/vector-search.js';
import { pino } from 'pino';

const logger = pino({ name: 'test-semantic-search', level: 'info' });

// Test user ID
const TEST_USER_ID = 'test-user-semantic-search';
const TEST_THREAD_ID = 'test-thread-1';

async function testDatabaseSchema() {
  logger.info('Testing database schema...');
  
  const db = createDatabase('./data/memory-test.db');
  
  // Check if embedding_queue table exists
  const tables = db.prepare(`
    SELECT name FROM sqlite_master 
    WHERE type='table' AND name='embedding_queue'
  `).all();
  
  if (tables.length > 0) {
    logger.info('✅ embedding_queue table exists');
  } else {
    logger.error('❌ embedding_queue table missing');
    return false;
  }
  
  // Check if embedding column exists in memories table
  const columns = db.prepare(`PRAGMA table_info(memories)`).all();
  const hasEmbedding = columns.some(col => col.name === 'embedding');
  
  if (hasEmbedding) {
    logger.info('✅ embedding column exists in memories table');
  } else {
    logger.error('❌ embedding column missing in memories table');
    return false;
  }
  
  db.close();
  return true;
}

async function testEmbeddingGeneration() {
  logger.info('Testing embedding generation...');
  
  if (!process.env.OPENAI_API_KEY) {
    logger.warn('⚠️  OPENAI_API_KEY not set, skipping embedding generation test');
    return false;
  }
  
  try {
    const testText = 'My favorite color is blue';
    const embedding = await generateEmbedding(testText);
    
    if (embedding && Array.isArray(embedding) && embedding.length > 0) {
      logger.info(`✅ Embedding generated: ${embedding.length} dimensions`);
      return true;
    } else {
      logger.error('❌ Embedding generation returned invalid result');
      return false;
    }
  } catch (error) {
    logger.error({ error: error.message }, '❌ Embedding generation failed');
    return false;
  }
}

async function testVectorSearch() {
  logger.info('Testing vector search...');
  
  const db = createDatabase('./data/memory-test.db');
  
  // Create test memories
  const memory1 = {
    id: 'test-memory-1',
    userId: TEST_USER_ID,
    threadId: TEST_THREAD_ID,
    content: 'My favorite color is blue',
    embedding: Buffer.from(JSON.stringify([0.1, 0.2, 0.3].concat(new Array(509).fill(0.0)))),
    priority: 0.9,
    confidence: 0.8,
    tier: 'TIER1',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    deletedAt: null,
    entities: null,
    redactionMap: null,
    sourceThreadId: null,
    repeats: 1,
    threadSet: null,
    lastSeenTs: null,
  };
  
  const memory2 = {
    id: 'test-memory-2',
    userId: TEST_USER_ID,
    threadId: TEST_THREAD_ID,
    content: 'I like red cars',
    embedding: Buffer.from(JSON.stringify([0.9, 0.8, 0.7].concat(new Array(509).fill(0.0)))),
    priority: 0.8,
    confidence: 0.7,
    tier: 'TIER2',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    deletedAt: null,
    entities: null,
    redactionMap: null,
    sourceThreadId: null,
    repeats: 1,
    threadSet: null,
    lastSeenTs: null,
  };
  
  // Insert test memories
  db.prepare(`
    INSERT OR REPLACE INTO memories (
      id, userId, threadId, content, embedding, priority, confidence,
      tier, createdAt, updatedAt, deletedAt, entities, redactionMap,
      sourceThreadId, repeats, threadSet, lastSeenTs
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    memory1.id, memory1.userId, memory1.threadId, memory1.content, memory1.embedding,
    memory1.priority, memory1.confidence, memory1.tier, memory1.createdAt,
    memory1.updatedAt, memory1.deletedAt, memory1.entities, memory1.redactionMap,
    memory1.sourceThreadId, memory1.repeats, memory1.threadSet, memory1.lastSeenTs
  );
  
  db.prepare(`
    INSERT OR REPLACE INTO memories (
      id, userId, threadId, content, embedding, priority, confidence,
      tier, createdAt, updatedAt, deletedAt, entities, redactionMap,
      sourceThreadId, repeats, threadSet, lastSeenTs
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    memory2.id, memory2.userId, memory2.threadId, memory2.content, memory2.embedding,
    memory2.priority, memory2.confidence, memory2.tier, memory2.createdAt,
    memory2.updatedAt, memory2.deletedAt, memory2.entities, memory2.redactionMap,
    memory2.sourceThreadId, memory2.repeats, memory2.threadSet, memory2.lastSeenTs
  );
  
  // Test vector search
  const queryEmbedding = [0.15, 0.25, 0.35].concat(new Array(509).fill(0.0));
  const results = findSimilarMemories(db, TEST_USER_ID, queryEmbedding, 5, 0.5);
  
  if (results.length > 0) {
    logger.info(`✅ Vector search found ${results.length} similar memories`);
    logger.info(`   Top result: ${results[0].memory.content} (similarity: ${results[0].similarity.toFixed(3)})`);
    return true;
  } else {
    logger.error('❌ Vector search returned no results');
    return false;
  }
}

async function testHybridSearch() {
  logger.info('Testing hybrid search...');
  
  const db = createDatabase('./data/memory-test.db');
  
  if (!process.env.OPENAI_API_KEY) {
    logger.warn('⚠️  OPENAI_API_KEY not set, testing keyword-only fallback');
    
    const results = keywordOnlySearch(db, TEST_USER_ID, 'favorite color', 5);
    
    if (results.length > 0) {
      logger.info(`✅ Keyword-only search found ${results.length} memories`);
      return true;
    } else {
      logger.error('❌ Keyword-only search returned no results');
      return false;
    }
  }
  
  try {
    const queryEmbedding = await generateEmbedding('favorite color preferences');
    
    if (!queryEmbedding) {
      logger.warn('⚠️  Could not generate query embedding, using keyword-only');
      const results = keywordOnlySearch(db, TEST_USER_ID, 'favorite color', 5);
      return results.length > 0;
    }
    
    const results = await hybridSearch(
      db,
      TEST_USER_ID,
      'favorite color',
      queryEmbedding,
      { maxItems: 5 }
    );
    
    if (results.length > 0) {
      logger.info(`✅ Hybrid search found ${results.length} memories`);
      results.forEach((mem, idx) => {
        logger.info(`   ${idx + 1}. ${mem.content.substring(0, 50)}...`);
      });
      return true;
    } else {
      logger.error('❌ Hybrid search returned no results');
      return false;
    }
  } catch (error) {
    logger.error({ error: error.message }, '❌ Hybrid search failed');
    return false;
  }
}

async function testEmbeddingQueue() {
  logger.info('Testing embedding queue...');
  
  const db = createDatabase('./data/memory-test.db');
  
  // Add a memory to the queue
  const memoryId = 'test-queue-memory-' + Date.now();
  await addToEmbeddingQueue(db, memoryId, 'Test memory for queue processing');
  
  // Check if it was added
  const queued = db.prepare(`
    SELECT * FROM embedding_queue 
    WHERE memoryId = ? AND processedAt IS NULL
  `).get(memoryId);
  
  if (queued) {
    logger.info('✅ Memory successfully added to embedding queue');
    return true;
  } else {
    logger.error('❌ Failed to add memory to embedding queue');
    return false;
  }
}

async function testGetOrGenerateEmbedding() {
  logger.info('Testing getOrGenerateEmbedding...');
  
  if (!process.env.OPENAI_API_KEY) {
    logger.warn('⚠️  OPENAI_API_KEY not set, skipping embedding generation test');
    return false;
  }
  
  const db = createDatabase('./data/memory-test.db');
  
  try {
    const memoryId = 'test-embedding-memory-' + Date.now();
    const content = 'My favorite programming language is TypeScript';
    
    // Create a test memory first
    db.prepare(`
      INSERT INTO memories (id, userId, threadId, content, priority, confidence, tier, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(memoryId, TEST_USER_ID, TEST_THREAD_ID, content, 0.9, 0.8, 'TIER1', Date.now(), Date.now());
    
    // Test getOrGenerateEmbedding
    const embedding = await getOrGenerateEmbedding(db, memoryId, content);
    
    if (embedding && Array.isArray(embedding) && embedding.length > 0) {
      logger.info(`✅ getOrGenerateEmbedding successful: ${embedding.length} dimensions`);
      
      // Verify it was saved to database
      const saved = db.prepare('SELECT embedding FROM memories WHERE id = ?').get(memoryId);
      if (saved && saved.embedding) {
        logger.info('✅ Embedding saved to database');
        return true;
      } else {
        logger.error('❌ Embedding not saved to database');
        return false;
      }
    } else {
      logger.error('❌ getOrGenerateEmbedding returned invalid result');
      return false;
    }
  } catch (error) {
    logger.error({ error: error.message }, '❌ getOrGenerateEmbedding failed');
    return false;
  }
}

async function runAllTests() {
  logger.info('🚀 Starting semantic search tests...\n');
  
  const results = {
    databaseSchema: false,
    embeddingGeneration: false,
    vectorSearch: false,
    hybridSearch: false,
    embeddingQueue: false,
    getOrGenerateEmbedding: false,
  };
  
  try {
    results.databaseSchema = await testDatabaseSchema();
    console.log('');
    
    results.embeddingGeneration = await testEmbeddingGeneration();
    console.log('');
    
    results.vectorSearch = await testVectorSearch();
    console.log('');
    
    results.hybridSearch = await testHybridSearch();
    console.log('');
    
    results.embeddingQueue = await testEmbeddingQueue();
    console.log('');
    
    results.getOrGenerateEmbedding = await testGetOrGenerateEmbedding();
    console.log('');
    
  } catch (error) {
    logger.error({ error }, 'Test suite failed');
  }
  
  // Summary
  logger.info('📊 Test Results Summary:');
  logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  Object.entries(results).forEach(([test, passed]) => {
    const status = passed ? '✅' : '❌';
    const name = test.replace(/([A-Z])/g, ' $1').trim();
    logger.info(`${status} ${name}: ${passed ? 'PASSED' : 'FAILED'}`);
  });
  
  const passedCount = Object.values(results).filter(Boolean).length;
  const totalCount = Object.keys(results).length;
  
  logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  logger.info(`Total: ${passedCount}/${totalCount} tests passed`);
  
  if (passedCount === totalCount) {
    logger.info('🎉 All tests passed!');
    process.exit(0);
  } else {
    logger.warn(`⚠️  ${totalCount - passedCount} test(s) failed`);
    process.exit(1);
  }
}

// Run tests
runAllTests().catch((error) => {
  logger.error({ error }, 'Test suite crashed');
  process.exit(1);
});

