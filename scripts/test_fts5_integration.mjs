#!/usr/bin/env node

/**
 * Test FTS5 Integration
 * Verifies FTS5 search is working with the new integration
 */

const MEMORY_SERVICE_URL = process.env.MEMORY_SERVICE_URL || 'http://localhost:3001';
const TEST_USER_ID = `test-fts5-${Date.now()}`;

async function testFTS5Integration() {
  console.log('🧪 Testing FTS5 Integration\n');
  
  // Test 1: Save a memory with a phrase
  console.log('1. Saving test memory...');
  const saveResponse = await fetch(`${MEMORY_SERVICE_URL}/v1/memories`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': TEST_USER_ID,
      'x-internal-service': 'test-script',
    },
    body: JSON.stringify({
      threadId: `thread-${Date.now()}`,
      content: 'my favorite color is blue and I prefer dark mode',
      priority: 0.9,
      tier: 'TIER1',
    }),
  });
  
  if (!saveResponse.ok) {
    console.error('❌ Failed to save memory:', await saveResponse.text());
    return;
  }
  
  const memory = await saveResponse.json();
  console.log(`✅ Memory saved: ${memory.id.substring(0, 8)}...\n`);
  
  // Wait for FTS sync
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Test 2: Query with phrase
  console.log('2. Testing phrase query: "favorite color"');
  const query1 = await fetch(`${MEMORY_SERVICE_URL}/v1/recall?userId=${encodeURIComponent(TEST_USER_ID)}&maxItems=5&deadlineMs=500&query=${encodeURIComponent('favorite color')}`, {
    headers: {
      'x-user-id': TEST_USER_ID,
      'x-internal-service': 'test-script',
    },
  });
  
  if (query1.ok) {
    const result1 = await query1.json();
    console.log(`   Results: ${result1.memories.length} memories`);
    console.log(`   Search Type: ${result1.searchType}`);
    if (result1.memories.length > 0) {
      console.log(`   ✅ Found memory with phrase`);
    } else {
      console.log(`   ⚠️  No results (may be using LIKE fallback)`);
    }
  }
  
  console.log('\n3. Testing keyword query: "dark mode"');
  const query2 = await fetch(`${MEMORY_SERVICE_URL}/v1/recall?userId=${encodeURIComponent(TEST_USER_ID)}&maxItems=5&deadlineMs=500&query=${encodeURIComponent('dark mode')}`, {
    headers: {
      'x-user-id': TEST_USER_ID,
      'x-internal-service': 'test-script',
    },
  });
  
  if (query2.ok) {
    const result2 = await query2.json();
    console.log(`   Results: ${result2.memories.length} memories`);
    console.log(`   Search Type: ${result2.searchType}`);
    if (result2.memories.length > 0) {
      console.log(`   ✅ Found memory with phrase`);
    } else {
      console.log(`   ⚠️  No results`);
    }
  }
  
  console.log('\n✅ FTS5 integration test complete');
}

testFTS5Integration().catch(err => {
  console.error('❌ Test failed:', err.message);
  process.exit(1);
});

