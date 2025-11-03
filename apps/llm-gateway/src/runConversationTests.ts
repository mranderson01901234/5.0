#!/usr/bin/env node
/**
 * CLI runner for Conversation Flow Tester
 * Usage: npx tsx apps/llm-gateway/src/runConversationTests.ts
 */

import { runTests } from './ConversationFlowTester.js';

const BASE_URL = process.env.GATEWAY_URL || 'http://localhost:8787';
const API_KEY = process.env.TEST_API_KEY || 'test-key';
const USER_ID = process.env.TEST_USER_ID || 'test-user';

async function main() {
  console.log('Starting Conversation Flow Tests...');
  console.log(`Gateway URL: ${BASE_URL}`);
  console.log(`User ID: ${USER_ID}\n`);
  
  try {
    const summary = await runTests(BASE_URL, API_KEY, USER_ID);
    
    // Exit with appropriate code
    process.exit(summary.failed > 0 ? 1 : 0);
  } catch (error: any) {
    console.error('\n❌ Test execution failed:', error.message);
    process.exit(1);
  }
}

main();

