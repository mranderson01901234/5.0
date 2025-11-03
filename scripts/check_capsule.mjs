#!/usr/bin/env node

import Redis from 'ioredis';

const redis = new Redis({
  host: 'localhost',
  port: 6379,
  lazyConnect: true,
});

await redis.connect();

const keys = await redis.keys('factPack:*');
console.log(`Found ${keys.length} research capsule(s)\n`);

for (const key of keys) {
  const data = await redis.get(key);
  if (data) {
    const capsule = JSON.parse(data);
    console.log('=== RESEARCH CAPSULE ===');
    console.log(`Thread ID: ${capsule.threadId}`);
    console.log(`Topic: ${capsule.topic}`);
    console.log(`TTL Class: ${capsule.ttlClass}`);
    console.log(`Fetched At: ${capsule.fetchedAt}`);
    console.log(`Expires At: ${capsule.expiresAt}`);
    console.log(`\nClaims (${capsule.claims.length}):`);
    capsule.claims.forEach((claim, i) => {
      console.log(`  ${i + 1}. ${claim.text.substring(0, 120)}...`);
      console.log(`     Date: ${claim.date || 'N/A'}, Confidence: ${claim.confidence}`);
    });
    console.log(`\nSources (${capsule.sources.length}):`);
    capsule.sources.forEach((source, i) => {
      console.log(`  ${i + 1}. ${source.host} (${source.date || 'no date'}) - Tier ${source.tier}`);
    });
    console.log(`\nEntities: ${capsule.entities.join(', ') || 'None'}`);
    console.log(`\nPayload size: ~${JSON.stringify(capsule).length} bytes`);
    console.log('\n');
  }
}

await redis.quit();

