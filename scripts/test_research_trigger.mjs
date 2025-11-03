#!/usr/bin/env node

import Redis from 'ioredis';

const redis = new Redis({
  host: 'localhost',
  port: 6379,
  lazyConnect: true,
});

await redis.connect();

const THREAD = `test-trigger-${Date.now()}`;
const USER_ID = 'test-trigger-user';

console.log(`\n🧪 Testing Research Trigger - Thread: ${THREAD}\n`);
console.log('Sending messages one at a time and checking for research activity...\n');

// Function to check for capsules
async function checkForCapsules(threadId, messageNum) {
  const keys = await redis.keys(`factPack:${threadId}:*`);
  if (keys.length > 0) {
    console.log(`  ✅ FOUND ${keys.length} capsule(s) after message ${messageNum}!`);
    for (const key of keys.slice(0, 1)) {
      const data = await redis.get(key);
      if (data) {
        const capsule = JSON.parse(data);
        console.log(`     Thread: ${capsule.threadId}`);
        console.log(`     Topic: ${capsule.topic.substring(0, 80)}`);
        console.log(`     Claims: ${capsule.claims.length}, Sources: ${capsule.sources.length}`);
      }
    }
    return true;
  }
  return false;
}

// Function to send a message
async function sendMessage(msgNum, content) {
  const response = await fetch('http://localhost:3001/v1/events/message', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': USER_ID,
      'x-internal-service': 'gateway',
    },
    body: JSON.stringify({
      userId: USER_ID,
      threadId: THREAD,
      msgId: `msg-${msgNum}`,
      role: 'user',
      content: content,
      tokens: { input: 300, output: 0 },
      timestamp: Date.now(),
    }),
  });
  
  if (!response.ok) {
    console.error(`  ❌ Message ${msgNum} failed: ${response.status}`);
    return false;
  }
  return true;
}

// Phase 1: Send messages one at a time, checking after each
console.log('📤 Phase 1: One-by-one message test (checking after each)\n');

for (let i = 1; i <= 8; i++) {
  const content = `Message ${i}: What are the latest developments in AI safety research? Tell me about recent breakthroughs in alignment.`;
  
  console.log(`[${i}] Sending message ${i}...`);
  const sent = await sendMessage(i, content);
  
  if (!sent) {
    console.log(`  ❌ Failed to send message ${i}`);
    continue;
  }
  
  // Wait a moment for processing
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Check for capsules
  const hasCapsule = await checkForCapsules(THREAD, i);
  if (!hasCapsule) {
    console.log(`  ⏳ No capsule yet (research may still be running)`);
  }
  
  // Small delay between messages
  if (i < 8) {
    await new Promise(resolve => setTimeout(resolve, 300));
  }
}

console.log(`\n⏸️  Waiting 10 seconds for research to complete...\n`);
await new Promise(resolve => setTimeout(resolve, 10000));

// Final check after Phase 1
console.log('📊 Phase 1 Final Check:\n');
const finalKeys = await redis.keys(`factPack:${THREAD}:*`);
console.log(`Total capsules found: ${finalKeys.length}`);
if (finalKeys.length > 0) {
  for (const key of finalKeys.slice(0, 1)) {
    const data = await redis.get(key);
    if (data) {
      const capsule = JSON.parse(data);
      console.log(`\n✅ CAPSULE DETAILS:`);
      console.log(`   Thread: ${capsule.threadId}`);
      console.log(`   Topic: ${capsule.topic}`);
      console.log(`   TTL Class: ${capsule.ttlClass}`);
      console.log(`   Claims: ${capsule.claims.length}`);
      console.log(`   Sources: ${capsule.sources.length}`);
      if (capsule.claims.length > 0) {
        console.log(`\n   First Claim: ${capsule.claims[0].text.substring(0, 120)}...`);
        console.log(`   Confidence: ${capsule.claims[0].confidence}`);
      }
      if (capsule.sources.length > 0) {
        console.log(`\n   First Source: ${capsule.sources[0].host} (${capsule.sources[0].date || 'no date'})`);
      }
    }
  }
}

// Phase 2: Timed messages (send more messages with delays, monitoring continuously)
console.log(`\n\n📤 Phase 2: Timed messages test (sending 12 more with monitoring)\n`);

const monitoringInterval = setInterval(async () => {
  const keys = await redis.keys(`factPack:${THREAD}:*`);
  if (keys.length > 0) {
    console.log(`  ⚡ NEW CAPSULE DETECTED! (${keys.length} total)`);
  }
}, 1000); // Check every second

for (let i = 9; i <= 20; i++) {
  const content = `Message ${i}: Continue discussing AI safety and alignment research. What are the key challenges?`;
  
  console.log(`[${i}] Sending message ${i}...`);
  await sendMessage(i, content);
  
  // Check immediately after sending
  await new Promise(resolve => setTimeout(resolve, 500));
  await checkForCapsules(THREAD, i);
  
  // Delay between messages
  await new Promise(resolve => setTimeout(resolve, 1000));
}

clearInterval(monitoringInterval);

// Final summary
console.log(`\n\n📊 Final Summary:\n`);
const allKeys = await redis.keys(`factPack:${THREAD}:*`);
console.log(`Total capsules created: ${allKeys.length}`);
if (allKeys.length > 0) {
  console.log(`\n✅ Research system is working! Capsules were created and stored.`);
  console.log(`\nCapsule keys:`);
  allKeys.forEach((key, idx) => {
    console.log(`  ${idx + 1}. ${key}`);
  });
} else {
  console.log(`\n⚠️  No capsules found. Possible reasons:`);
  console.log(`   - Research is still running (check memory-service logs)`);
  console.log(`   - Research failed (API key, rate limit, etc.)`);
  console.log(`   - Capsules expired (60s TTL)`);
}

await redis.quit();
console.log(`\n✅ Test complete!\n`);

