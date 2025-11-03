#!/usr/bin/env node

/**
 * Test all services and research system readiness
 */

console.log('🔍 Testing All Services\n');

const services = [
  { name: 'Web App (Vite)', url: 'http://localhost:5176', port: 5176 },
  { name: 'Memory Service', url: 'http://localhost:3001', port: 3001 },
  { name: 'LLM Gateway', url: 'http://localhost:8787', port: 8787 },
];

async function checkService(name, url, port) {
  try {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 2000);
    const res = await fetch(url, { signal: controller.signal });
    return { running: true, status: res.status };
  } catch {
    // Check if port is in use at least
    const { execSync } = await import('child_process');
    try {
      const result = execSync(`lsof -ti:${port}`, { encoding: 'utf-8' });
      return { running: false, process: true };
    } catch {
      return { running: false, process: false };
    }
  }
}

console.log('1. Service Status:\n');
for (const svc of services) {
  const status = await checkService(svc.name, svc.url, svc.port);
  if (status.running) {
    console.log(`   ✅ ${svc.name}: Running (HTTP ${status.status})`);
  } else if (status.process) {
    console.log(`   ⚠️  ${svc.name}: Process running but not responding`);
  } else {
    console.log(`   ❌ ${svc.name}: Not running`);
  }
}

console.log('\n2. Redis Status:');
const { execSync } = await import('child_process');
try {
  execSync('redis-cli ping', { stdio: 'pipe' });
  console.log('   ✅ Redis: Running');
  
  // Check for research data
  const keys = execSync('redis-cli KEYS "factPack:*"', { encoding: 'utf-8' });
  const count = keys.trim().split('\n').filter(k => k && !k.startsWith('(empty)')).length;
  console.log(`   📨 Research capsules in Redis: ${count}`);
} catch {
  console.log('   ❌ Redis: Not running');
}

console.log('\n3. Environment Check:');
const { readFileSync, existsSync } = await import('fs');
if (existsSync('.env')) {
  const env = readFileSync('.env', 'utf-8');
  const hasKey = env.includes('BRAVE_API_KEY=') && !env.includes('BRAVE_API_KEY=""');
  const enabled = env.includes('RESEARCH_SIDECAR_ENABLED=true');
  console.log(`   ${hasKey ? '✅' : '❌'} Brave API key: ${hasKey ? 'Set' : 'Missing'}`);
  console.log(`   ${enabled ? '✅' : '⚠️ '} Research: ${enabled ? 'Enabled' : 'Disabled'}`);
} else {
  console.log('   ⚠️  .env file not found');
}

console.log('\n✅ Test complete!\n');
console.log('To test research:');
console.log('1. Send 6+ messages to trigger memory review');
console.log('2. Check memory-service logs for "Research job enqueued"');
console.log('3. Check Redis: redis-cli KEYS factPack:*');

