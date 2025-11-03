#!/usr/bin/env node

import Redis from 'ioredis';

const redis = new Redis({
  host: 'localhost',
  port: 6379,
  lazyConnect: true,
});

await redis.connect();

console.log('\n🔍 Research Injection Diagnostics\n');

// 1. Check capsules
const factPackKeys = await redis.keys('factPack:*');
console.log(`1. FactPack capsules: ${factPackKeys.length}`);
if (factPackKeys.length > 0) {
  for (const key of factPackKeys.slice(0, 3)) {
    const data = await redis.get(key);
    if (data) {
      const capsule = JSON.parse(data);
      const expiresAt = new Date(capsule.expiresAt);
      const now = new Date();
      const expired = expiresAt <= now;
      console.log(`   ${key}`);
      console.log(`      Thread: ${capsule.threadId}`);
      console.log(`      Topic: ${capsule.topic.substring(0, 60)}`);
      console.log(`      Claims: ${capsule.claims?.length || 0}`);
      console.log(`      Expires: ${capsule.expiresAt}`);
      console.log(`      Status: ${expired ? '❌ EXPIRED' : '✅ Valid'}`);
      console.log('');
    }
  }
}

// 2. Check cached capsules
const cachedKeys = await redis.keys('CAPS:v2:*');
console.log(`2. Cached capsules: ${cachedKeys.length}`);

// 3. Check Redis connection
console.log(`3. Redis connection: ✅ Connected`);

// 4. Provide instructions
console.log('\n📋 To test injection:');
console.log('1. Send messages in your conversation (needs ~7+ for first batch)');
console.log('2. Check memory-service logs for: "Research trigger check"');
console.log('3. Check gateway logs for: "Polling for research capsules" or "Research capsule injected"');
console.log('4. Open browser console and look for: "Research capsule received"');
console.log('\n⚠️  Note: Frontend currently only LOGS capsules, doesn\'t display them yet.\n');

await redis.quit();

