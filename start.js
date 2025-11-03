#!/usr/bin/env node

/**
 * Master start script for LLM Gateway monorepo
 * Starts all services with proper logging and cleanup
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = __dirname;

// Check .env exists
if (!existsSync(join(rootDir, '.env'))) {
  console.error('❌ Error: .env file not found in root directory');
  console.error('Please create .env file with required API keys');
  process.exit(1);
}

console.log('🚀 Starting LLM Gateway Services...\n');

// Ensure logs directory exists
const logsDir = join(rootDir, 'logs');
mkdirSync(logsDir, { recursive: true });

const services = [
  {
    name: 'Gateway',
    port: 8787,
    command: 'pnpm',
    args: ['--filter', '@llm-gateway/app', 'dev'],
    cwd: rootDir,
    logFile: join(logsDir, 'gateway.log'),
  },
  {
    name: 'Memory Service',
    port: 3001,
    command: 'pnpm',
    args: ['dev'],
    cwd: join(rootDir, 'apps', 'memory-service'),
    logFile: join(logsDir, 'memory-service.log'),
  },
  {
    name: 'Web App',
    port: 5173,
    command: 'pnpm',
    args: ['dev'],
    cwd: join(rootDir, 'apps', 'web'),
    logFile: join(logsDir, 'web.log'),
  },
];

const processes = [];

// Function to kill process on port
async function killPort(port) {
  try {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    
    const { stdout } = await execAsync(`lsof -ti:${port} || true`);
    const pids = stdout.trim().split('\n').filter(Boolean);
    
    for (const pid of pids) {
      try {
        process.kill(parseInt(pid), 'SIGKILL');
      } catch (e) {
        // Process might already be gone
      }
    }
  } catch (e) {
    // Port might not be in use
  }
}

// Clean up existing processes
console.log('Cleaning up existing processes...\n');
for (const service of services) {
  await killPort(service.port);
}
await new Promise(resolve => setTimeout(resolve, 1000));

// Start services
for (const service of services) {
  console.log(`📦 Starting ${service.name} (port ${service.port})...`);
  
  const logStream = require('fs').createWriteStream(service.logFile, { flags: 'a' });
  
  const proc = spawn(service.command, service.args, {
    cwd: service.cwd,
    stdio: ['ignore', logStream, logStream],
    shell: true,
    detached: false,
  });
  
  proc.on('error', (err) => {
    console.error(`❌ Failed to start ${service.name}:`, err.message);
  });
  
  processes.push({ ...service, process: proc, pid: proc.pid });
  console.log(`   ✅ ${service.name} started (PID: ${proc.pid})\n`);
  
  // Wait a bit between starts
  await new Promise(resolve => setTimeout(resolve, 2000));
}

console.log('════════════════════════════════════════════════════════');
console.log('✅ All services started!');
console.log('');
console.log('Services:');
for (const service of services) {
  console.log(`  Gateway:       http://localhost:${service.port} (PID: ${service.process.pid})`);
}
console.log('');
console.log('Logs:');
for (const service of services) {
  console.log(`  tail -f ${service.logFile}`);
}
console.log('');
console.log('Press Ctrl+C to stop all services');
console.log('════════════════════════════════════════════════════════\n');

// Handle shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Stopping all services...');
  for (const service of processes) {
    try {
      service.process.kill('SIGTERM');
    } catch (e) {
      // Process might already be dead
    }
  }
  process.exit(0);
});

// Keep process alive
process.on('exit', () => {
  for (const service of processes) {
    try {
      service.process.kill('SIGTERM');
    } catch (e) {
      // Ignore
    }
  }
});

