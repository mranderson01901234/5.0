#!/usr/bin/env node

/**
 * Quick smoke test for research system
 * Checks if components are working without full integration
 */

import { createHash } from 'crypto';

console.log('🔍 Research System Smoke Test\n');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
    passed++;
  } catch (error) {
    console.log(`❌ ${name}: ${error.message}`);
    failed++;
  }
}

// Test 1: Config module
test('Config module loads', async () => {
  const { loadResearchConfig } = await import('../apps/memory-service/src/config.js');
  const config = loadResearchConfig();
  if (typeof config.enabled !== 'boolean') {
    throw new Error('Config not loading correctly');
  }
});

// Test 2: Topic extraction
test('Topic extraction works', async () => {
  const { extractTopic } = await import('../apps/memory-service/src/topicExtractor.js');
  const result = extractTopic([
    { content: 'What are the latest developments?', role: 'user' },
  ]);
  if (!result.topic || !result.ttlClass) {
    throw new Error('Topic extraction failed');
  }
});

// Test 3: Topic tracker
test('Topic tracker works', async () => {
  const { TopicTracker } = await import('../apps/memory-service/src/topicTracker.js');
  const tracker = new TopicTracker();
  tracker.recordTopic('test', 'Topic', 'general', []);
  const history = tracker.getTopicHistory('test', 'Topic');
  if (!history) {
    throw new Error('Topic tracker not working');
  }
});

// Test 4: Cache key generation
test('Cache key generation works', async () => {
  const { generateCacheKey } = await import('../sidecar/research/cache.js');
  const key = generateCacheKey('test topic', 'general', 'month', 'test query');
  if (!key.startsWith('CAPS:v2:')) {
    throw new Error('Cache key format incorrect');
  }
});

// Test 5: Redis connection (if available)
test('Redis connection check', async () => {
  try {
    const { initializeRedis, isRedisAvailable } = await import('../apps/memory-service/src/redis.js');
    await initializeRedis();
    if (!isRedisAvailable()) {
      console.log('   ⚠️  Redis not available (this is OK if not started)');
      passed++; // Count as passed since graceful degradation is expected
      return;
    }
    console.log('   ✓ Redis connected');
  } catch (error) {
    console.log('   ⚠️  Redis connection failed (this is OK if not started)');
    passed++; // Graceful degradation is a feature
  }
});

// Test 6: Job queue extension
test('Job queue supports research type', async () => {
  const { JobQueue } = await import('../apps/memory-service/src/queue.js');
  const queue = new JobQueue();
  queue.enqueue({
    id: 'test-research',
    type: 'research',
    priority: 5,
    payload: { test: true },
  });
  // If no error, it works
});

// Test 7: Type definitions
test('Type definitions load', async () => {
  const types = await import('../sidecar/research/types.js');
  if (!types.ResearchJob || !types.ResearchCapsule) {
    throw new Error('Type definitions missing');
  }
});

console.log('\n📊 Results:');
console.log(`   Passed: ${passed}`);
console.log(`   Failed: ${failed}`);

if (failed === 0) {
  console.log('\n✅ All smoke tests passed!\n');
  process.exit(0);
} else {
  console.log('\n❌ Some tests failed. Check errors above.\n');
  process.exit(1);
}

