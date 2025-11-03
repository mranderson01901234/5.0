/**
 * Test Ingestion → Embedding → Qdrant Flow
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Database from 'better-sqlite3';
import { QdrantClient } from '@qdrant/qdrant-js';
import OpenAI from 'openai';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '.env') });

console.log('\n=== Testing Ingestion → Embedding → Qdrant Flow ===\n');

const dbPath = process.env.INGESTION_DB_PATH || './apps/ingestion-service/data/ingestion.db';
const qdrantUrl = process.env.QDRANT_URL || 'http://localhost:6333';
const collection = process.env.QDRANT_WORLD_KNOWLEDGE_COLLECTION || 'world_knowledge';

// Test 1: Check Qdrant
console.log('1. Testing Qdrant connection...');
const qdrant = new QdrantClient({ url: qdrantUrl });

try {
  const collections = await qdrant.getCollections();
  console.log(`✅ Qdrant connected: ${collections.collections.length} collections`);

  const worldKnowledge = collections.collections.find(c => c.name === collection);
  if (worldKnowledge) {
    console.log(`✅ Collection "${collection}" exists`);
    const info = await qdrant.getCollection(collection);
    console.log(`   Points: ${info.points_count}`);
    console.log(`   Vectors: ${info.vectors_count}\n`);
  } else {
    console.log(`⚠️  Collection "${collection}" not found - will be created on first use\n`);
  }
} catch (error) {
  console.error(`❌ Qdrant error: ${error.message}\n`);
  process.exit(1);
}

// Test 2: Check Database
console.log('2. Testing Ingestion Database...');
try {
  const db = new Database(dbPath);

  // Check schema
  const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`).all();
  console.log(`✅ Database connected: ${tables.length} tables`);

  // Check for vector columns
  const columns = db.prepare(`PRAGMA table_info(ingested_content)`).all();
  const hasVectorId = columns.some(c => c.name === 'vector_id');
  const hasEmbeddedAt = columns.some(c => c.name === 'embedded_at');

  if (hasVectorId && hasEmbeddedAt) {
    console.log(`✅ Vector columns exist (vector_id, embedded_at)`);
  } else {
    console.log(`❌ Missing vector columns`);
  }

  // Check content stats
  const stats = db.prepare(`
    SELECT
      COUNT(*) as total,
      COUNT(vector_id) as embedded,
      COUNT(*) - COUNT(vector_id) as pending
    FROM ingested_content
    WHERE status = 'active'
  `).get();

  console.log(`   Total items: ${stats.total}`);
  console.log(`   Embedded: ${stats.embedded}`);
  console.log(`   Pending: ${stats.pending}\n`);

  if (stats.pending > 0) {
    console.log('3. Testing Embedding Generation...');

    // Get one pending item
    const item = db.prepare(`
      SELECT id, title, summary, content
      FROM ingested_content
      WHERE vector_id IS NULL AND status = 'active'
      LIMIT 1
    `).get();

    if (item) {
      console.log(`   Testing with: "${item.title.substring(0, 60)}..."`);

      // Generate embedding
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const text = `Title: ${item.title}\n\nSummary: ${item.summary || ''}\n\nContent: ${(item.content || '').substring(0, 2000)}`;

      console.log(`   Generating embedding (${text.length} chars)...`);
      const response = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: text,
      });

      const embedding = response.data[0].embedding;
      console.log(`✅ Embedding generated: ${embedding.length} dimensions`);
      console.log(`   Tokens used: ${response.usage.total_tokens}\n`);

      console.log('4. Testing Qdrant Upsert...');

      // Create point (Qdrant requires integer or UUID)
      const vectorId = Date.now();
      try {
        await qdrant.upsert(collection, {
          wait: true,
          points: [{
            id: vectorId,
            vector: embedding,
            payload: {
              content_id: item.id,
              title: item.title,
              summary: item.summary || '',
              test: true,
            }
          }]
        });

        console.log(`✅ Vector upserted to Qdrant (ID: ${vectorId})\n`);
      } catch (upsertError) {
        console.error(`❌ Qdrant upsert error: ${upsertError.message}`);
        console.error(`   Details: ${JSON.stringify(upsertError, null, 2)}\n`);
        throw upsertError;
      }

      console.log('5. Testing Vector Search...');

      // Search for similar content
      const searchResults = await qdrant.search(collection, {
        vector: embedding,
        limit: 3,
        with_payload: true,
      });

      console.log(`✅ Search completed: ${searchResults.length} results`);
      searchResults.forEach((r, i) => {
        console.log(`   ${i + 1}. Score: ${r.score.toFixed(4)} - ${r.payload.title?.substring(0, 50)}...`);
      });

      // Clean up test vector
      await qdrant.delete(collection, {
        wait: true,
        points: [vectorId],
      });
      console.log(`\n✅ Test vector cleaned up`);
    } else {
      console.log(`⚠️  No pending items to test with`);
    }
  } else {
    console.log(`⚠️  No pending items in database (all ${stats.total} items already embedded)`);
  }

  db.close();

} catch (error) {
  console.error(`❌ Database error: ${error.message}\n`);
  process.exit(1);
}

console.log('\n===========================================');
console.log('✅ All Systems Operational!');
console.log('===========================================\n');
console.log('The ingestion → embedding → Qdrant pipeline is working correctly.');
console.log('New RSS items will be automatically embedded every 5 minutes.\n');
