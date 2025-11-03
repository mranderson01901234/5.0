#!/usr/bin/env node

/**
 * Comprehensive End-to-End Memory System Test
 * Tests the "remember this" feature with real services and user data
 */

import { readFileSync } from 'fs';
import { existsSync } from 'fs';
import { execSync } from 'child_process';

const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${COLORS[color]}${message}${COLORS.reset}`);
}

function error(message) {
  log(`❌ ${message}`, 'red');
}

function success(message) {
  log(`✅ ${message}`, 'green');
}

function warn(message) {
  log(`⚠️  ${message}`, 'yellow');
}

function info(message) {
  log(`ℹ️  ${message}`, 'blue');
}

function testSection(title) {
  console.log('\n' + '='.repeat(60));
  log(title, 'cyan');
  console.log('='.repeat(60));
}

// ============================================================================
// TEST 1: Check Services Are Running
// ============================================================================

async function checkService(url, name, port) {
  try {
    const response = await fetch(url, { 
      method: 'GET',
      signal: AbortSignal.timeout(2000)
    });
    if (response.ok || response.status === 404) {
      return true; // Service is up (404 is OK, means server responded)
    }
    return false;
  } catch (err) {
    // Try to check if port is listening
    try {
      const result = execSync(`lsof -ti:${port}`, { encoding: 'utf-8', stdio: 'pipe' });
      return result.trim().length > 0;
    } catch {
      return false;
    }
  }
}

async function testServices() {
  testSection('TEST 1: Service Health Checks');
  
  const services = [
    { name: 'Gateway', url: 'http://localhost:8787/health', port: 8787, critical: true },
    { name: 'Memory Service', url: 'http://localhost:3001/v1/metrics', port: 3001, critical: true },
    { name: 'Web App', url: 'http://localhost:5173', port: 5173, critical: false },
  ];
  
  const results = [];
  
  for (const service of services) {
    info(`Checking ${service.name}...`);
    const isUp = await checkService(service.url, service.name, service.port);
    
    if (isUp) {
      success(`${service.name} is running on port ${service.port}`);
      results.push({ service: service.name, status: 'up', critical: service.critical });
    } else {
      if (service.critical) {
        error(`${service.name} is NOT running on port ${service.port} (CRITICAL)`);
        results.push({ service: service.name, status: 'down', critical: true });
      } else {
        warn(`${service.name} is NOT running on port ${service.port} (optional)`);
        results.push({ service: service.name, status: 'down', critical: false });
      }
    }
  }
  
  const criticalDown = results.filter(r => r.critical && r.status === 'down');
  if (criticalDown.length > 0) {
    error(`CRITICAL: ${criticalDown.length} required service(s) are down`);
    log('\nTo start services, run:', 'yellow');
    log('  ./start.sh', 'yellow');
    return false;
  }
  
  return true;
}

// ============================================================================
// TEST 2: Check Environment Variables
// ============================================================================

function testEnvironment() {
  testSection('TEST 2: Environment Variables');
  
  const required = [
    'CLERK_SECRET_KEY',
    'ANTHROPIC_API_KEY', // For LLM
  ];
  
  const optional = [
    'OPENAI_API_KEY',
    'GOOGLE_API_KEY',
    'MEMORY_SERVICE_URL',
    'GATEWAY_DB_PATH',
    'DB_PATH',
    'REDIS_URL',
  ];
  
  let allGood = true;
  
  // Check if .env exists
  if (!existsSync('.env')) {
    error('.env file not found in root directory');
    log('Create .env file with required variables', 'yellow');
    return false;
  }
  
  info('Reading .env file...');
  const envContent = readFileSync('.env', 'utf-8');
  const envLines = envContent.split('\n').filter(line => line.trim() && !line.startsWith('#'));
  const envVars = {};
  
  envLines.forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim();
      envVars[key] = value;
    }
  });
  
  info(`Found ${Object.keys(envVars).length} environment variables`);
  
  // Check required vars
  log('\nRequired variables:');
  for (const key of required) {
    if (envVars[key] && envVars[key] !== '' && !envVars[key].includes('YOUR_')) {
      success(`${key} is set`);
    } else {
      error(`${key} is missing or invalid`);
      allGood = false;
    }
  }
  
  // Check optional vars
  log('\nOptional variables:');
  for (const key of optional) {
    if (envVars[key] && envVars[key] !== '' && !envVars[key].includes('YOUR_')) {
      success(`${key} is set`);
    } else {
      warn(`${key} is not set (optional)`);
    }
  }
  
  return allGood;
}

// ============================================================================
// TEST 3: Check Database Files
// ============================================================================

function testDatabases() {
  testSection('TEST 3: Database Files');
  
  const databases = [
    {
      name: 'Gateway DB',
      path: process.env.GATEWAY_DB_PATH || './apps/llm-gateway/gateway.db',
      required: true,
      description: 'Stores messages for audit jobs'
    },
    {
      name: 'Memory DB',
      path: process.env.DB_PATH || './apps/memory-service/data/memory.db',
      required: true,
      description: 'Stores user memories'
    },
  ];
  
  let allGood = true;
  
  for (const db of databases) {
    if (existsSync(db.path)) {
      const stats = execSync(`stat -f%z "${db.path}" 2>/dev/null || stat -c%s "${db.path}" 2>/dev/null`, {
        encoding: 'utf-8',
        stdio: 'pipe'
      }).trim();
      const sizeKB = Math.round(parseInt(stats) / 1024);
      success(`${db.name}: ${db.path} (${sizeKB} KB)`);
      info(`  ${db.description}`);
    } else {
      if (db.required) {
        warn(`${db.name}: ${db.path} not found (will be created on first use)`);
      } else {
        info(`${db.name}: ${db.path} not found (optional)`);
      }
    }
  }
  
  return true; // Databases will be created automatically
}

// ============================================================================
// TEST 4: Test Clerk User ID Extraction
// ============================================================================

async function testUserIDExtraction() {
  testSection('TEST 4: Clerk User ID Extraction');
  
  // This is a mock test - in real scenario, we'd need a valid Clerk token
  info('Checking Clerk authentication configuration...');
  
  if (!process.env.CLERK_SECRET_KEY || process.env.CLERK_SECRET_KEY.includes('YOUR_')) {
    warn('CLERK_SECRET_KEY not configured - auth will use AUTH_MOCK mode');
    info('In AUTH_MOCK mode, user ID is extracted from JWT token payload');
    return true;
  }
  
  success('CLERK_SECRET_KEY is configured');
  info('User ID will be extracted from Clerk JWT token');
  info('Expected format: JWT payload.sub or payload.userId');
  
  // Note: We can't test actual user ID extraction without a valid token
  // But we can verify the code path exists
  const clerkAuthPath = './apps/memory-service/src/plugins/clerkAuth.ts';
  if (existsSync(clerkAuthPath)) {
    success('Clerk auth plugin found');
    const content = readFileSync(clerkAuthPath, 'utf-8');
    if (content.includes('sub') && content.includes('userId')) {
      success('User ID extraction logic present');
    }
  }
  
  return true;
}

// ============================================================================
// TEST 5: Test Memory Save Endpoint
// ============================================================================

async function testMemorySave(userId, testToken) {
  testSection('TEST 5: Memory Save Endpoint');
  
  const MEMORY_SERVICE_URL = process.env.MEMORY_SERVICE_URL || 'http://localhost:3001';
  const testMemory = {
    threadId: `test-${Date.now()}`,
    content: 'my favorite color is blue',
    priority: 0.9,
    tier: 'TIER1'
  };
  
  info(`Testing POST ${MEMORY_SERVICE_URL}/v1/memories`);
  info(`User ID: ${userId || 'test-user'}`);
  
  try {
    const headers = {
      'Content-Type': 'application/json',
      'x-user-id': userId || 'test-user',
      'x-internal-service': 'gateway',
    };
    
    if (testToken) {
      headers['authorization'] = `Bearer ${testToken}`;
    }
    
    const response = await fetch(`${MEMORY_SERVICE_URL}/v1/memories`, {
      method: 'POST',
      headers,
      body: JSON.stringify(testMemory),
      signal: AbortSignal.timeout(5000),
    });
    
    if (response.ok) {
      const data = await response.json();
      success(`Memory saved successfully`);
      info(`  Memory ID: ${data.id}`);
      info(`  Tier: ${data.tier}`);
      info(`  Priority: ${data.priority}`);
      info(`  Content: ${data.content}`);
      return { success: true, memoryId: data.id, threadId: testMemory.threadId };
    } else {
      const errorText = await response.text();
      error(`Failed to save memory: ${response.status} ${response.statusText}`);
      error(`  Response: ${errorText}`);
      return { success: false, error: errorText };
    }
  } catch (err) {
    error(`Error testing memory save: ${err.message}`);
    return { success: false, error: err.message };
  }
}

// ============================================================================
// TEST 6: Test Memory Recall Endpoint
// ============================================================================

async function testMemoryRecall(userId, query, testToken) {
  testSection('TEST 6: Memory Recall Endpoint');
  
  const MEMORY_SERVICE_URL = process.env.MEMORY_SERVICE_URL || 'http://localhost:3001';
  
  info(`Testing GET ${MEMORY_SERVICE_URL}/v1/recall`);
  info(`Query: "${query}"`);
  
  try {
    const headers = {
      'Content-Type': 'application/json',
      'x-user-id': userId || 'test-user',
      'x-internal-service': 'gateway',
    };
    
    if (testToken) {
      headers['authorization'] = `Bearer ${testToken}`;
    }
    
    const url = `${MEMORY_SERVICE_URL}/v1/recall?userId=${encodeURIComponent(userId || 'test-user')}&maxItems=5&deadlineMs=200&query=${encodeURIComponent(query)}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(2000),
    });
    
    if (response.ok) {
      const data = await response.json();
      const memories = data.memories || [];
      
      if (memories.length > 0) {
        success(`Recalled ${memories.length} memory/memories`);
        memories.forEach((mem, idx) => {
          info(`  ${idx + 1}. [${mem.tier}] ${mem.content.substring(0, 60)}${mem.content.length > 60 ? '...' : ''}`);
        });
        return { success: true, memories };
      } else {
        warn(`Recall returned 0 memories`);
        info(`  This might be OK if no memories match the query`);
        return { success: true, memories: [] };
      }
    } else {
      const errorText = await response.text();
      error(`Failed to recall memories: ${response.status} ${response.statusText}`);
      error(`  Response: ${errorText}`);
      return { success: false, error: errorText };
    }
  } catch (err) {
    error(`Error testing memory recall: ${err.message}`);
    return { success: false, error: err.message };
  }
}

// ============================================================================
// TEST 7: End-to-End Flow Test
// ============================================================================

async function testEndToEndFlow(userId, testToken) {
  testSection('TEST 7: End-to-End Flow Test');
  
  info('Simulating: User says "remember my favorite color is blue"');
  
  // Step 1: Save memory
  const saveResult = await testMemorySave(userId, testToken);
  if (!saveResult.success) {
    error('End-to-end test failed at save step');
    return false;
  }
  
  // Wait a moment for the save to be committed
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Step 2: Recall memory
  info('\nSimulating: User asks "what is my favorite color?"');
  const recallResult = await testMemoryRecall(userId, 'what is my favorite color', testToken);
  
  if (!recallResult.success) {
    error('End-to-end test failed at recall step');
    return false;
  }
  
  // Step 3: Verify memory was found
  const relevantMemory = recallResult.memories?.find(m => 
    m.content.toLowerCase().includes('favorite color') && 
    m.content.toLowerCase().includes('blue')
  );
  
  if (relevantMemory) {
    success('✅ END-TO-END TEST PASSED');
    info('  Memory was saved and successfully recalled');
    info(`  Found: "${relevantMemory.content}"`);
    return true;
  } else {
    warn('Memory was saved but not recalled in semantic search');
    info('  This could be due to:');
    info('    1. Keyword matching needs improvement');
    info('    2. Memory needs time to index');
    info('    3. Query phrasing mismatch');
    
    if (recallResult.memories && recallResult.memories.length > 0) {
      info(`  But ${recallResult.memories.length} other memory/memories were found`);
    }
    
    return false; // Partial pass
  }
}

// ============================================================================
// MAIN TEST RUNNER
// ============================================================================

async function runAllTests() {
  console.clear();
  log('\n🔍 Memory System Comprehensive Test', 'cyan');
  log('Testing "remember this" feature with real services\n', 'cyan');
  
  // Get user ID from environment or use test
  const userId = process.env.TEST_USER_ID || 'test-user-dparker918';
  const testToken = process.env.TEST_TOKEN; // Optional: for real auth testing
  
  let allTestsPassed = true;
  
  // Test 1: Services
  const servicesOk = await testServices();
  if (!servicesOk) {
    error('\n❌ CRITICAL: Required services are not running');
    log('\nRun: ./start.sh', 'yellow');
    process.exit(1);
  }
  
  // Test 2: Environment
  const envOk = testEnvironment();
  if (!envOk) {
    error('\n❌ CRITICAL: Required environment variables missing');
    process.exit(1);
  }
  
  // Test 3: Databases
  testDatabases();
  
  // Test 4: User ID
  await testUserIDExtraction();
  
  // Test 5-7: Memory operations
  log('\n');
  info(`Using test user ID: ${userId}`);
  if (testToken) {
    info('Using provided auth token');
  } else {
    warn('No auth token provided - using internal service headers');
  }
  
  const e2eOk = await testEndToEndFlow(userId, testToken);
  if (!e2eOk) {
    allTestsPassed = false;
  }
  
  // Summary
  testSection('TEST SUMMARY');
  
  if (allTestsPassed && e2eOk) {
    success('✅ ALL TESTS PASSED');
    log('\nThe memory system is working correctly!', 'green');
  } else {
    error('❌ SOME TESTS FAILED');
    log('\nCheck the output above for details', 'yellow');
    log('Common issues:', 'yellow');
    log('  1. Services not running - run ./start.sh', 'yellow');
    log('  2. .env file missing or incomplete', 'yellow');
    log('  3. Database permissions issues', 'yellow');
    log('  4. Network connectivity between services', 'yellow');
  }
  
  log('\n');
}

// Run tests
runAllTests().catch(err => {
  error(`Test runner error: ${err.message}`);
  console.error(err);
  process.exit(1);
});

