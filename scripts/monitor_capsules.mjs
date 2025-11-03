#!/usr/bin/env node

import Redis from 'ioredis';

const redis = new Redis({
  host: 'localhost',
  port: 6379,
  lazyConnect: true,
});

await redis.connect();

const THREAD = process.argv[2] || `monitor-${Date.now()}`;
const DURATION = parseInt(process.argv[3]) || 60; // seconds

console.log(`\n🔍 Monitoring for capsules on thread: ${THREAD}`);
console.log(`Duration: ${DURATION} seconds\n`);

const startTime = Date.now();
const checkInterval = 1000; // Check every second
let lastKeyCount = 0;

const interval = setInterval(async () => {
  const keys = await redis.keys(`factPack:${THREAD}:*`);
  
  if (keys.length > lastKeyCount) {
    console.log(`\n✅ NEW CAPSULE DETECTED! (${keys.length} total)\n`);
    
    for (const key of keys.slice(lastKeyCount)) {
      const data = await redis.get(key);
      if (data) {
        try {
          const capsule = JSON.parse(data);
          console.log('=== RESEARCH CAPSULE ===');
          console.log(`Key: ${key}`);
          console.log(`Thread: ${capsule.threadId}`);
          console.log(`Topic: ${capsule.topic}`);
          console.log(`TTL Class: ${capsule.ttlClass}`);
          console.log(`Fetched At: ${capsule.fetchedAt}`);
          console.log(`Expires At: ${capsule.expiresAt}`);
          console.log(`\nClaims (${capsule.claims.length}):`);
          capsule.claims.forEach((claim, i) => {
            console.log(`  ${i + 1}. ${claim.text.substring(0, 150)}...`);
            console.log(`     Confidence: ${claim.confidence}, Date: ${claim.date || 'N/A'}`);
          });
          console.log(`\nSources (${capsule.sources.length}):`);
          capsule.sources.forEach((source, i) => {
            console.log(`  ${i + 1}. ${source.host} (Date: ${source.date || 'no date'}, Tier: ${source.tier})`);
          });
          console.log(`\nEntities: ${capsule.entities.join(', ') || 'None'}`);
          console.log(`Payload size: ~${JSON.stringify(capsule).length} bytes`);
          console.log('\n');
        } catch (e) {
          console.error('Failed to parse capsule:', e.message);
        }
      }
    }
    
    lastKeyCount = keys.length;
  }
  
  if (Date.now() - startTime >= DURATION * 1000) {
    clearInterval(interval);
    console.log(`\n⏱️  Monitoring complete (${DURATION}s elapsed)`);
    const finalKeys = await redis.keys(`factPack:${THREAD}:*`);
    console.log(`Total capsules found: ${finalKeys.length}`);
    await redis.quit();
    process.exit(0);
  }
}, checkInterval);

// Also check immediately
const initialKeys = await redis.keys(`factPack:${THREAD}:*`);
lastKeyCount = initialKeys.length;
if (initialKeys.length > 0) {
  console.log(`Found ${initialKeys.length} existing capsule(s)`);
}

console.log('Monitoring... (press Ctrl+C to stop early)\n');

