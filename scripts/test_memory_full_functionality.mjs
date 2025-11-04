#!/usr/bin/env node

/**
 * Comprehensive Memory System Functionality Test
 * Tests memory saving, recall, deduplication, and database integrity
 */

import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const MEMORY_SERVICE_URL = process.env.MEMORY_SERVICE_URL || 'http://localhost:3001';
const TEST_USER_ID = `test-audit-${Date.now()}`;
const TEST_THREAD_ID = `thread-audit-${Date.now()}`;

const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

function log(message, color = 'reset') {
  console.log(`${COLORS[color]}${message}${COLORS.reset}`);
}

function success(message) {
  log(`✅ ${message}`, 'green');
}

function error(message) {
  log(`❌ ${message}`, 'red');
}

function info(message) {
  log(`ℹ️  ${message}`, 'blue');
}

function warn(message) {
  log(`⚠️  ${message}`, 'yellow');
}

function section(title) {
  console.log('\n' + '='.repeat(70));
  log(title, 'cyan');
  console.log('='.repeat(70));
}

// Find database path
function findDatabase() {
  const possiblePaths = [
    join(__dirname, '../apps/memory-service/data/memory.db'),
    join(process.cwd(), 'apps/memory-service/data/memory.db'),
    './apps/memory-service/data/memory.db',
    './data/memory.db',
  ];

  for (const path of possiblePaths) {
    if (existsSync(path)) {
      return path;
    }
  }
  return null;
}

// Test 1: Service Health Check
async function testServiceHealth() {
  section('TEST 1: Service Health Check');
  
  try {
    const response = await fetch(`${MEMORY_SERVICE_URL}/v1/metrics`, {
      signal: AbortSignal.timeout(2000),
    });
    
    if (response.ok) {
      const metrics = await response.json();
      success(`Memory service is running`);
      info(`Database size: ${metrics.health?.dbSizeMb || 0} MB`);
      info(`Queue depth: ${metrics.health?.queueDepth || 0}`);
      return true;
    } else {
      error(`Service returned ${response.status}`);
      return false;
    }
  } catch (err) {
    error(`Service not accessible: ${err.message}`);
    return false;
  }
}

// Test 2: Save Various Memory Types
async function testMemorySaving() {
  section('TEST 2: Memory Saving - Various Types');
  
  const testMemories = [
    {
      name: 'Preference Memory',
      content: 'my favorite color is blue',
      priority: 0.9,
      tier: 'TIER1',
    },
    {
      name: 'Fact Memory',
      content: 'I am currently working on Project Atlas',
      priority: 0.85,
      tier: 'TIER1',
    },
    {
      name: 'Goal Memory',
      content: 'I want to finish the UI redesign by next month',
      priority: 0.8,
      tier: 'TIER2',
    },
    {
      name: 'Context Memory',
      content: 'I prefer dark mode interfaces and minimalist design',
      priority: 0.75,
      tier: 'TIER2',
    },
    {
      name: 'Low Priority Memory',
      content: 'I sometimes like to read sci-fi novels',
      priority: 0.6,
      tier: 'TIER3',
    },
  ];
  
  const savedMemories = [];
  
  for (const testMemory of testMemories) {
    try {
      info(`Saving: ${testMemory.name}`);
      
      const response = await fetch(`${MEMORY_SERVICE_URL}/v1/memories`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': TEST_USER_ID,
          'x-internal-service': 'test-script',
        },
        body: JSON.stringify({
          threadId: TEST_THREAD_ID,
          content: testMemory.content,
          priority: testMemory.priority,
          tier: testMemory.tier,
        }),
        signal: AbortSignal.timeout(5000),
      });
      
      if (response.ok) {
        const memory = await response.json();
        savedMemories.push(memory);
        success(`  Saved: ${memory.id.substring(0, 8)}... [${memory.tier}] ${memory.content.substring(0, 50)}`);
      } else {
        const errorText = await response.text();
        error(`  Failed: ${response.status} - ${errorText}`);
        return { success: false, savedMemories: [] };
      }
    } catch (err) {
      error(`  Error: ${err.message}`);
      return { success: false, savedMemories: [] };
    }
    
    // Small delay between saves
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  success(`Successfully saved ${savedMemories.length} memories`);
  return { success: true, savedMemories };
}

// Test 3: Deduplication Test
async function testDeduplication() {
  section('TEST 3: Deduplication Test');
  
  const duplicateContent = 'my favorite programming language is TypeScript';
  
  info('Saving first memory...');
  const response1 = await fetch(`${MEMORY_SERVICE_URL}/v1/memories`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': TEST_USER_ID,
      'x-internal-service': 'test-script',
    },
    body: JSON.stringify({
      threadId: TEST_THREAD_ID,
      content: duplicateContent,
      priority: 0.9,
      tier: 'TIER1',
    }),
    signal: AbortSignal.timeout(5000),
  });
  
  if (!response1.ok) {
    error('Failed to save first memory');
    return false;
  }
  
  const memory1 = await response1.json();
  success(`First memory saved: ${memory1.id.substring(0, 8)}...`);
  
  // Wait a moment
  await new Promise(resolve => setTimeout(resolve, 200));
  
  info('Attempting to save duplicate memory...');
  const response2 = await fetch(`${MEMORY_SERVICE_URL}/v1/memories`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': TEST_USER_ID,
      'x-internal-service': 'test-script',
    },
    body: JSON.stringify({
      threadId: TEST_THREAD_ID + '-2',
      content: duplicateContent,
      priority: 0.9,
      tier: 'TIER1',
    }),
    signal: AbortSignal.timeout(5000),
  });
  
  if (!response2.ok) {
    error('Failed to save duplicate memory');
    return false;
  }
  
  const memory2 = await response2.json();
  
  if (memory2.id === memory1.id) {
    success('Deduplication working: Duplicate was superceded (same ID)');
    info(`  Memory ID: ${memory2.id.substring(0, 8)}...`);
    info(`  Repeats count: ${memory2.repeats || 1}`);
    return true;
  } else {
    warn('Duplicate was created with different ID');
    warn(`  Original: ${memory1.id.substring(0, 8)}...`);
    warn(`  New: ${memory2.id.substring(0, 8)}...`);
    return false;
  }
}

// Test 4: Memory Recall Test
async function testMemoryRecall() {
  section('TEST 4: Memory Recall Test');
  
  const testQueries = [
    { query: 'favorite color', expected: 'blue' },
    { query: 'working on', expected: 'Project Atlas' },
    { query: 'UI redesign', expected: 'finish' },
    { query: 'dark mode', expected: 'prefer' },
  ];
  
  let allPassed = true;
  
  for (const test of testQueries) {
    try {
      info(`Query: "${test.query}"`);
      
      const url = `${MEMORY_SERVICE_URL}/v1/recall?userId=${encodeURIComponent(TEST_USER_ID)}&maxItems=5&deadlineMs=500&query=${encodeURIComponent(test.query)}`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'x-user-id': TEST_USER_ID,
          'x-internal-service': 'test-script',
        },
        signal: AbortSignal.timeout(3000),
      });
      
      if (response.ok) {
        const data = await response.json();
        const memories = data.memories || [];
        
        if (memories.length > 0) {
          const found = memories.find(m => 
            m.content.toLowerCase().includes(test.expected.toLowerCase())
          );
          
          if (found) {
            success(`  Found relevant memory: "${found.content.substring(0, 60)}..."`);
          } else {
            warn(`  Found ${memories.length} memories but none matched expected content`);
            memories.forEach((m, i) => {
              info(`    ${i + 1}. ${m.content.substring(0, 60)}...`);
            });
            allPassed = false;
          }
        } else {
          warn(`  No memories found for query`);
          allPassed = false;
        }
      } else {
        error(`  Recall failed: ${response.status}`);
        allPassed = false;
      }
    } catch (err) {
      error(`  Error: ${err.message}`);
      allPassed = false;
    }
  }
  
  return allPassed;
}

// Test 5: Database Verification
async function testDatabaseVerification() {
  section('TEST 5: Database Verification');
  
  const dbPath = findDatabase();
  if (!dbPath) {
    error('Database file not found');
    return false;
  }
  
  info(`Database path: ${dbPath}`);
  
  try {
    const db = new Database(dbPath, { readonly: true });
    
    // Count memories for test user
    const countResult = db.prepare(`
      SELECT COUNT(*) as count 
      FROM memories 
      WHERE userId = ? AND deletedAt IS NULL
    `).get(TEST_USER_ID);
    
    const count = countResult.count || 0;
    success(`Found ${count} active memories for test user`);
    
    // Get breakdown by tier
    const tierBreakdown = db.prepare(`
      SELECT tier, COUNT(*) as count 
      FROM memories 
      WHERE userId = ? AND deletedAt IS NULL 
      GROUP BY tier 
      ORDER BY tier
    `).all(TEST_USER_ID);
    
    info('Breakdown by tier:');
    tierBreakdown.forEach(row => {
      info(`  ${row.tier}: ${row.count}`);
    });
    
    // Get average priority
    const avgPriority = db.prepare(`
      SELECT AVG(priority) as avg 
      FROM memories 
      WHERE userId = ? AND deletedAt IS NULL
    `).get(TEST_USER_ID);
    
    info(`Average priority: ${(avgPriority.avg || 0).toFixed(3)}`);
    
    // Check for duplicates (same content, different IDs)
    const duplicates = db.prepare(`
      SELECT content, COUNT(*) as count 
      FROM memories 
      WHERE userId = ? AND deletedAt IS NULL 
      GROUP BY content 
      HAVING COUNT(*) > 1
    `).all(TEST_USER_ID);
    
    if (duplicates.length > 0) {
      warn(`Found ${duplicates.length} potential duplicate content entries:`);
      duplicates.forEach(dup => {
        warn(`  "${dup.content.substring(0, 50)}..." (${dup.count} times)`);
      });
    } else {
      success('No duplicate content found (deduplication working)');
    }
    
    db.close();
    
    return count > 0;
  } catch (err) {
    error(`Database error: ${err.message}`);
    return false;
  }
}

// Test 6: Memory List Test
async function testMemoryList() {
  section('TEST 6: Memory List/Retrieval Test');
  
  try {
    const url = `${MEMORY_SERVICE_URL}/v1/memories?userId=${encodeURIComponent(TEST_USER_ID)}&limit=10&offset=0`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'x-user-id': TEST_USER_ID,
        'x-internal-service': 'test-script',
      },
      signal: AbortSignal.timeout(3000),
    });
    
    if (response.ok) {
      const data = await response.json();
      const memories = data.memories || [];
      const total = data.total || 0;
      
      success(`Retrieved ${memories.length} memories (total: ${total})`);
      
      info('Sample memories:');
      memories.slice(0, 3).forEach((m, i) => {
        info(`  ${i + 1}. [${m.tier}] ${m.content.substring(0, 60)}...`);
      });
      
      return memories.length > 0;
    } else {
      error(`List failed: ${response.status}`);
      return false;
    }
  } catch (err) {
    error(`Error: ${err.message}`);
    return false;
  }
}

// Main test runner
async function runAllTests() {
  console.clear();
  log('\n🧪 Memory System Full Functionality Test', 'magenta');
  log(`Test User ID: ${TEST_USER_ID}`, 'magenta');
  log(`Test Thread ID: ${TEST_THREAD_ID}`, 'magenta');
  log(`Memory Service: ${MEMORY_SERVICE_URL}\n`, 'magenta');
  
  const results = {
    serviceHealth: false,
    memorySaving: false,
    deduplication: false,
    recall: false,
    databaseVerification: false,
    memoryList: false,
  };
  
  // Run tests
  results.serviceHealth = await testServiceHealth();
  if (!results.serviceHealth) {
    error('\n❌ Service not available. Cannot continue tests.');
    process.exit(1);
  }
  
  results.memorySaving = (await testMemorySaving()).success;
  await new Promise(resolve => setTimeout(resolve, 500)); // Wait for saves to commit
  
  results.deduplication = await testDeduplication();
  await new Promise(resolve => setTimeout(resolve, 500));
  
  results.recall = await testMemoryRecall();
  results.databaseVerification = await testDatabaseVerification();
  results.memoryList = await testMemoryList();
  
  // Final summary
  section('TEST SUMMARY');
  
  const passed = Object.values(results).filter(r => r).length;
  const total = Object.keys(results).length;
  
  Object.entries(results).forEach(([test, passed]) => {
    if (passed) {
      success(`${test}: PASSED`);
    } else {
      error(`${test}: FAILED`);
    }
  });
  
  console.log('\n' + '='.repeat(70));
  log(`Results: ${passed}/${total} tests passed`, passed === total ? 'green' : 'yellow');
  console.log('='.repeat(70));
  
  if (passed === total) {
    success('\n✅ ALL TESTS PASSED - Memory system is fully functional!');
    return 0;
  } else {
    error(`\n❌ ${total - passed} test(s) failed`);
    return 1;
  }
}

// Run tests
runAllTests()
  .then(exitCode => {
    process.exit(exitCode);
  })
  .catch(err => {
    error(`\nFatal error: ${err.message}`);
    console.error(err);
    process.exit(1);
  });

