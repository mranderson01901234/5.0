#!/usr/bin/env node

/**
 * End-to-End Web Search Test
 * Tests the complete flow: query → web search → LLM injection → response
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const MEMORY_SERVICE_URL = process.env.MEMORY_SERVICE_URL || 'http://localhost:3001';
const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:8787';
const TEST_USER_ID = 'test-user-web-search-' + Date.now();
const TEST_THREAD_ID = 'test-thread-web-search-' + Date.now();

// Colors for output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(color, message) {
  console.log(`${color}${message}${colors.reset}`);
}

function error(message) {
  log(colors.red, `❌ ${message}`);
}

function success(message) {
  log(colors.green, `✅ ${message}`);
}

function info(message) {
  log(colors.blue, `ℹ️  ${message}`);
}

function step(message) {
  log(colors.cyan, `\n📋 ${message}`);
}

// Check environment variables
function checkEnv() {
  step('Checking environment configuration...');
  
  try {
    const envPath = join(process.cwd(), '.env');
    const envContent = readFileSync(envPath, 'utf-8');
    
    const hasBraveKey = envContent.includes('BRAVE_API_KEY=') && 
                        !envContent.includes('BRAVE_API_KEY=""') &&
                        !envContent.includes("BRAVE_API_KEY=''");
    
    const hasOpenAIKey = envContent.includes('OPENAI_API_KEY=') && 
                         !envContent.includes('OPENAI_API_KEY=""') &&
                         !envContent.includes("OPENAI_API_KEY=''");
    
    if (!hasBraveKey) {
      error('BRAVE_API_KEY not found in .env file');
      return false;
    } else {
      success('BRAVE_API_KEY configured');
    }
    
    if (!hasOpenAIKey) {
      error('OPENAI_API_KEY not found in .env file');
      return false;
    } else {
      success('OPENAI_API_KEY configured');
    }
    
    return true;
  } catch (err) {
    error(`Failed to read .env file: ${err.message}`);
    return false;
  }
}

// Test if service is reachable
async function checkService(name, url, timeout = 3000) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
    }).catch(() => null);
    
    clearTimeout(timeoutId);
    
    if (response && response.status < 500) {
      success(`${name} is reachable at ${url}`);
      return true;
    } else {
      error(`${name} is not responding at ${url}`);
      return false;
    }
  } catch (err) {
    error(`${name} is not reachable: ${err.message}`);
    return false;
  }
}

// Test web search endpoint directly
async function testWebSearchDirect(query) {
  step(`Testing web search endpoint directly with query: "${query}"`);
  
  try {
    const startTime = Date.now();
    const response = await fetch(`${MEMORY_SERVICE_URL}/v1/web-search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': TEST_USER_ID,
        'x-internal-service': 'test-script',
      },
      body: JSON.stringify({
        query,
        threadId: TEST_THREAD_ID,
      }),
    });
    
    const elapsed = Date.now() - startTime;
    
    if (!response.ok) {
      const errorText = await response.text();
      error(`Web search endpoint returned ${response.status}: ${errorText}`);
      return null;
    }
    
    const data = await response.json();
    
    info(`Response received in ${elapsed}ms`);
    
    if (!data.summary || data.summary.trim().length === 0) {
      error('Web search returned empty summary');
      return null;
    }
    
    success(`Summary length: ${data.summary.length} characters`);
    log(colors.yellow, `Summary preview: ${data.summary.substring(0, 200)}...`);
    
    if (data.sources && data.sources.length > 0) {
      success(`Found ${data.sources.length} sources`);
      data.sources.forEach((source, idx) => {
        info(`  ${idx + 1}. ${source.host}${source.date ? ` • ${source.date}` : ''}`);
      });
    } else {
      error('No sources returned');
    }
    
    return data;
  } catch (err) {
    error(`Web search test failed: ${err.message}`);
    return null;
  }
}

// Test chat stream with web search
async function testChatStream(query) {
  step(`Testing chat stream with web search for query: "${query}"`);
  
  try {
    info('Sending chat stream request...');
    
    const response = await fetch(`${GATEWAY_URL}/v1/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-token',
      },
      body: JSON.stringify({
        thread_id: TEST_THREAD_ID,
        messages: [
          {
            role: 'user',
            content: query,
          },
        ],
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      error(`Chat stream returned ${response.status}: ${errorText}`);
      return false;
    }
    
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let hasResearchSummary = false;
    let hasSources = false;
    let researchSummary = '';
    let sources = null;
    let deltaCount = 0;
    
    info('Reading SSE stream...');
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        if (line.startsWith('event:')) {
          const event = line.slice(6).trim();
          
          if (event === 'research_summary') {
            hasResearchSummary = true;
            success('Received research_summary event');
          } else if (event === 'sources') {
            hasSources = true;
            success('Received sources event');
          } else if (event === 'token' || event === 'delta') {
            deltaCount++;
          } else if (event === 'done') {
            info('Stream completed');
          }
        } else if (line.startsWith('data:')) {
          const data = line.slice(5).trim();
          
          if (data && data !== 'null') {
            try {
              const parsed = JSON.parse(data);
              
              if (hasResearchSummary && parsed.summary) {
                researchSummary = parsed.summary;
              }
              
              if (hasSources && parsed.sources) {
                sources = parsed.sources;
              }
            } catch (e) {
              // Not JSON, ignore
            }
          }
        }
      }
    }
    
    // Report results
    console.log('\n');
    if (hasResearchSummary) {
      success(`Research summary injected: ${researchSummary ? researchSummary.length : 0} chars`);
      if (researchSummary) {
        log(colors.yellow, `Preview: ${researchSummary.substring(0, 200)}...`);
      }
    } else {
      error('No research_summary event received');
    }
    
    if (hasSources) {
      success(`Sources provided: ${sources ? sources.length : 0} sources`);
    } else {
      error('No sources event received');
    }
    
    info(`Received ${deltaCount} token/delta events`);
    
    return hasResearchSummary && hasSources;
  } catch (err) {
    error(`Chat stream test failed: ${err.message}`);
    return false;
  }
}

// Main test flow
async function runTests() {
  console.log(`${colors.bright}${colors.cyan}
╔══════════════════════════════════════════════════════════════╗
║         Web Search End-to-End Test Suite                     ║
╚══════════════════════════════════════════════════════════════╝
${colors.reset}`);

  // Check environment
  if (!checkEnv()) {
    error('Environment check failed. Please configure .env file.');
    process.exit(1);
  }

  // Check services
  step('Checking service availability...');
  const memoryServiceOk = await checkService('Memory Service', `${MEMORY_SERVICE_URL}/health`, 2000);
  const gatewayOk = await checkService('LLM Gateway', `${GATEWAY_URL}/health`, 2000);
  
  if (!memoryServiceOk || !gatewayOk) {
    error('Services are not available. Please start memory-service and llm-gateway.');
    info('\nStart services with:');
    info('  Terminal 1: cd apps/memory-service && pnpm dev');
    info('  Terminal 2: cd apps/llm-gateway && pnpm dev');
    process.exit(1);
  }

  // Test queries
  const testQueries = [
    "What's the latest news about the White House?",
    "Tell me about recent developments in artificial intelligence",
  ];

  let allPassed = true;

  for (const query of testQueries) {
    console.log(`\n${colors.bright}${'='.repeat(60)}${colors.reset}`);
    log(colors.bright, `\nTesting Query: "${query}"`);
    console.log(`${colors.bright}${'='.repeat(60)}${colors.reset}\n`);

    // Test 1: Direct web search endpoint
    const searchResult = await testWebSearchDirect(query);
    if (!searchResult) {
      allPassed = false;
      continue;
    }

    // Wait a bit before next test
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Test 2: Chat stream with web search
    const streamOk = await testChatStream(query);
    if (!streamOk) {
      allPassed = false;
    }

    // Wait between queries
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  // Final summary
  console.log(`\n${colors.bright}${'='.repeat(60)}${colors.reset}`);
  if (allPassed) {
    success('\n🎉 All tests passed! Web search is working correctly.');
  } else {
    error('\n❌ Some tests failed. Check the output above for details.');
    process.exit(1);
  }
  console.log(`${colors.bright}${'='.repeat(60)}${colors.reset}\n`);
}

// Run tests
runTests().catch(err => {
  error(`Test suite failed: ${err.message}`);
  console.error(err);
  process.exit(1);
});

