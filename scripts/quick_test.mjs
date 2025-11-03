#!/usr/bin/env node

/**
 * Quick test - verify setup and check Redis
 */

console.log('🔍 Quick Research System Test\n');

// Test 1: Redis
console.log('1. Checking Redis...');
import { execSync } from 'child_process';
try {
  const result = execSync('redis-cli ping', { encoding: 'utf-8' });
  if (result.trim() === 'PONG') {
    console.log('   ✅ Redis is running\n');
  } else {
    console.log('   ❌ Redis not responding\n');
  }
} catch (error) {
  console.log('   ❌ Redis not running - start with: redis-server\n');
}

// Test 2: Check .env
console.log('2. Checking environment...');
import { readFileSync, existsSync } from 'fs';
if (existsSync('.env')) {
  const envContent = readFileSync('.env', 'utf-8');
  const hasBraveKey = envContent.includes('BRAVE_API_KEY=') && 
                      !envContent.includes('BRAVE_API_KEY=""');
  const hasResearchEnabled = envContent.includes('RESEARCH_SIDECAR_ENABLED=true');
  
  console.log(`   ✅ .env file exists`);
  console.log(`   ${hasBraveKey ? '✅' : '⚠️ '} Brave API key ${hasBraveKey ? 'set' : 'missing'}`);
  console.log(`   ${hasResearchEnabled ? '✅' : '⚠️ '} Research ${hasResearchEnabled ? 'enabled' : 'disabled'}\n`);
} else {
  console.log('   ⚠️  .env file not found\n');
}

// Test 3: Check services
console.log('3. Checking services...');

async function checkService(name, url, timeout = 2000) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    return response.status < 500;
  } catch {
    return false;
  }
}

const services = [
  { name: 'Memory Service', url: 'http://localhost:3001' },
  { name: 'LLM Gateway', url: 'http://localhost:8787' },
];

for (const service of services) {
  const isRunning = await checkService(service.name, service.url);
  console.log(`   ${isRunning ? '✅' : '❌'} ${service.name} ${isRunning ? 'running' : 'not running'}`);
}
console.log('');

// Test 4: Check Redis keys
console.log('4. Checking Redis for research data...');
try {
  const keys = execSync('redis-cli KEYS "CAPS:v2:*"', { encoding: 'utf-8' });
  const factPackKeys = execSync('redis-cli KEYS "factPack:*"', { encoding: 'utf-8' });
  
  const cacheCount = keys.trim().split('\n').filter(k => k).length;
  const capsuleCount = factPackKeys.trim().split('\n').filter(k => k).length;
  
  console.log(`   📦 Cached capsules: ${cacheCount}`);
  console.log(`   📨 Published capsules: ${capsuleCount}\n`);
} catch (error) {
  console.log('   ⚠️  Could not check Redis keys\n');
}

console.log('✅ Quick test complete!');
console.log('\nNext steps:');
console.log('1. If services are running, send messages to trigger research');
console.log('2. Check memory-service logs for: "Research job enqueued"');
console.log('3. Check Redis: redis-cli KEYS factPack:*');

