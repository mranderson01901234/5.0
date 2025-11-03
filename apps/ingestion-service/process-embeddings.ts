import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '../../.env') });

import Database from 'better-sqlite3';
import { EmbeddingProcessor } from './src/embeddings/processor.js';

async function processEmbeddings() {
  const dbPath = process.env.INGESTION_DB_PATH || './data/ingestion.db';
  const db = new Database(dbPath);

  const processor = new EmbeddingProcessor(db);
  await processor.initialize();

  const stats = processor.getStats();
  console.log('📊 Before: Pending:', stats.pending, 'Embedded:', stats.embedded);

  console.log('\n🚀 Processing batches of 50...');
  let totalProcessed = 0;
  let batchNum = 1;

  while (stats.pending > 0) {
    console.log(`\n📦 Batch ${batchNum}...`);
    const result = await processor.processPendingEmbeddings({ batchSize: 50 });
    totalProcessed += result.processed;

    console.log(`   Processed: ${result.processed}`);
    console.log(`   Tokens: ${result.totalTokens}`);
    console.log(`   Time: ${result.duration}ms`);

    if (result.processed === 0) break;
    batchNum++;
  }

  const statsAfter = processor.getStats();
  console.log('\n✅ Done! Processed:', totalProcessed, 'Remaining:', statsAfter.pending, 'Embedded:', statsAfter.embedded);

  db.close();
}

processEmbeddings().catch(console.error);
