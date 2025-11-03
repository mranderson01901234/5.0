import dotenv from 'dotenv';
import Database from 'better-sqlite3';
import path from 'path';

dotenv.config();

const { EmbeddingProcessor } = await import('./apps/ingestion-service/src/embeddings/processor.js');

// Use absolute path
const dbPath = path.resolve(process.env.INGESTION_DB_PATH || './apps/ingestion-service/data/ingestion.db');
console.log('Opening DB:', dbPath);

const db = new Database(dbPath);

console.log('Starting embedding pipeline...');
const processor = new EmbeddingProcessor(db);

try {
  await processor.initialize();
  
  const stats = processor.getStats();
  console.log('\nBefore embedding:');
  console.log(`  Pending: ${stats.pending}`);
  console.log(`  Embedded: ${stats.embedded}`);
  console.log(`  Total: ${stats.total}`);

  console.log('\nProcessing in batches of 50...');
  let totalProcessed = 0;
  let batchNum = 1;
  
  while (stats.pending > 0) {
    console.log(`\n📦 Batch ${batchNum}:`);
    const result = await processor.processPendingEmbeddings({ batchSize: 50 });
    totalProcessed += result.processed;
    
    console.log(`   Processed: ${result.processed}`);
    console.log(`   Tokens: ${result.totalTokens}`);
    console.log(`   Duration: ${result.duration}ms`);
    
    if (result.processed === 0) break;
    batchNum++;
  }

  const statsAfter = processor.getStats();
  console.log('\n✅ Embedding Complete!');
  console.log(`   Total processed: ${totalProcessed}`);
  console.log(`   Remaining pending: ${statsAfter.pending}`);
  console.log(`   Now embedded: ${statsAfter.embedded}`);

  process.exit(0);
} catch (error) {
  console.error('❌ Error:', error);
  process.exit(1);
} finally {
  db.close();
}
