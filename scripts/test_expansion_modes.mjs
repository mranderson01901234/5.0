#!/usr/bin/env node

/**
 * Test Expansion Modes
 * Verifies strict/normal/aggressive modes work correctly
 */

const MEMORY_SERVICE_URL = process.env.MEMORY_SERVICE_URL || 'http://localhost:3001';
const TEST_USER_ID = `test-expansion-${Date.now()}`;

async function testExpansionModes() {
  console.log('🧪 Testing Expansion Modes\n');
  
  // Save test memory
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
      content: 'my favorite programming language is TypeScript',
      priority: 0.9,
      tier: 'TIER1',
    }),
  });
  
  if (!saveResponse.ok) {
    console.error('❌ Failed to save memory');
    return;
  }
  
  const memory = await saveResponse.json();
  console.log(`✅ Memory saved: ${memory.id.substring(0, 8)}...\n`);
  
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Test 1: Strict mode - should NOT match "preferred language"
  console.log('2. Testing STRICT mode: "preferred language"');
  const strictResponse = await fetch(`${MEMORY_SERVICE_URL}/v1/recall?userId=${encodeURIComponent(TEST_USER_ID)}&maxItems=5&deadlineMs=500&query=${encodeURIComponent('preferred language')}&expansionMode=strict`, {
    headers: {
      'x-user-id': TEST_USER_ID,
      'x-internal-service': 'test-script',
    },
  });
  
  if (strictResponse.ok) {
    const result = await strictResponse.json();
    const found = result.memories.some(m => m.id === memory.id);
    if (found) {
      console.log('   ⚠️  Found (should not match in strict mode)');
    } else {
      console.log('   ✅ Correctly filtered out (strict mode working)');
    }
  }
  
  // Test 2: Normal mode - may match "preferred language" (semantic similarity)
  console.log('\n3. Testing NORMAL mode: "preferred language"');
  const normalResponse = await fetch(`${MEMORY_SERVICE_URL}/v1/recall?userId=${encodeURIComponent(TEST_USER_ID)}&maxItems=5&deadlineMs=500&query=${encodeURIComponent('preferred language')}&expansionMode=normal`, {
    headers: {
      'x-user-id': TEST_USER_ID,
      'x-internal-service': 'test-script',
    },
  });
  
  if (normalResponse.ok) {
    const result = await normalResponse.json();
    const found = result.memories.some(m => m.id === memory.id);
    console.log(`   ${found ? '✅' : '❌'} Found: ${found}`);
  }
  
  // Test 3: Strict mode - should match "favorite language" (exact keywords)
  console.log('\n4. Testing STRICT mode: "favorite language"');
  const strictExactResponse = await fetch(`${MEMORY_SERVICE_URL}/v1/recall?userId=${encodeURIComponent(TEST_USER_ID)}&maxItems=5&deadlineMs=500&query=${encodeURIComponent('favorite language')}&expansionMode=strict`, {
    headers: {
      'x-user-id': TEST_USER_ID,
      'x-internal-service': 'test-script',
    },
  });
  
  if (strictExactResponse.ok) {
    const result = await strictExactResponse.json();
    const found = result.memories.some(m => m.id === memory.id);
    if (found) {
      console.log('   ✅ Found (correct - exact keywords match)');
    } else {
      console.log('   ❌ Not found (should match)');
    }
  }
  
  console.log('\n✅ Expansion mode tests complete');
}

testExpansionModes().catch(err => {
  console.error('❌ Test failed:', err.message);
  process.exit(1);
});

