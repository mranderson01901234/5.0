#!/usr/bin/env node

/**
 * Integration test script for research system
 * Tests full flow: memory review → research job → capsule → Redis
 */

import { randomUUID } from 'crypto';

const MEMORY_SERVICE_URL = process.env.MEMORY_SERVICE_URL || 'http://localhost:3001';
const USER_ID = process.env.TEST_USER_ID || 'test-user-' + randomUUID();
const THREAD_ID = process.env.TEST_THREAD_ID || 'test-thread-' + randomUUID();

// Mock auth token (adjust based on your auth system)
const AUTH_TOKEN = process.env.TEST_AUTH_TOKEN || 'test-token';

console.log('🧪 Research Integration Test\n');
console.log(`User ID: ${USER_ID}`);
console.log(`Thread ID: ${THREAD_ID}\n`);

/**
 * Send message event to memory service
 */
async function sendMessageEvent(role, content, msgNum) {
  const response = await fetch(`${MEMORY_SERVICE_URL}/v1/events/message`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${AUTH_TOKEN}`,
    },
    body: JSON.stringify({
      userId: USER_ID,
      threadId: THREAD_ID,
      msgId: `msg-${msgNum}`,
      role,
      content,
      tokens: { input: Math.floor(content.length / 4), output: role === 'assistant' ? Math.floor(content.length / 4) : 0 },
      timestamp: Date.now(),
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Message event failed: ${response.status} ${error}`);
  }

  return response.json();
}

/**
 * Wait for condition
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check Redis for capsule (requires redis-cli)
 */
async function checkRedisCapsule(threadId) {
  // This would require redis client - simplified for now
  console.log(`   ℹ️  Check Redis for factPack:${threadId}:*`);
  console.log(`   Run: redis-cli KEYS factPack:${threadId}:*`);
}

/**
 * Main test flow
 */
async function runTest() {
  console.log('📤 Step 1: Sending messages to trigger memory review...\n');

  const messages = [
    { role: 'user', content: 'What are the latest developments in TypeScript and React?' },
    { role: 'assistant', content: 'TypeScript 5.3 was recently released with improved type inference.' },
    { role: 'user', content: 'Tell me more about the new features in React 19.' },
    { role: 'assistant', content: 'React 19 includes new compiler optimizations and server components.' },
    { role: 'user', content: 'Are there any breaking changes I should know about?' },
    { role: 'assistant', content: 'React 19 has some breaking changes in the Context API.' },
    { role: 'user', content: 'What about performance improvements?' },
    { role: 'assistant', content: 'The new compiler reduces bundle size significantly.' },
  ];

  let msgNum = 1;
  for (const msg of messages) {
    try {
      const result = await sendMessageEvent(msg.role, msg.content, msgNum++);
      console.log(`   ✓ Message ${msgNum - 1} sent (${msg.role})`);
      
      // Small delay to avoid rate limiting
      await sleep(100);
    } catch (error) {
      console.error(`   ✗ Failed to send message ${msgNum - 1}:`, error.message);
      return;
    }
  }

  console.log('\n⏳ Step 2: Waiting for memory review to trigger...\n');
  console.log('   (Memory review triggers after 6+ messages, 1500+ tokens, or 3min)\n');
  
  // Wait for audit to process
  await sleep(2000);

  console.log('🔍 Step 3: Checking for research job enqueue...\n');
  console.log('   Check memory-service logs for:');
  console.log('   - "Research job enqueued"');
  console.log('   - "Processing research job"');
  console.log('   - "Starting research pipeline"\n');

  await sleep(3000);

  console.log('📦 Step 4: Checking Redis for capsule...\n');
  await checkRedisCapsule(THREAD_ID);

  console.log('\n✅ Test complete!\n');
  console.log('Next steps:');
  console.log('1. Check memory-service logs for research pipeline execution');
  console.log('2. Verify capsule in Redis: redis-cli KEYS factPack:*');
  console.log('3. Test early-window injection with chat stream\n');
}

// Run test
runTest().catch(error => {
  console.error('\n❌ Test failed:', error);
  process.exit(1);
});

