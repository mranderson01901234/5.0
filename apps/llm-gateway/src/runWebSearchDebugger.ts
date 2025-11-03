#!/usr/bin/env node
/**
 * CLI runner for Web Search Debugger
 * Usage: npx tsx apps/llm-gateway/src/runWebSearchDebugger.ts
 */

import { runWebSearchDebugger } from './WebSearchDebugger.js';

async function main() {
  try {
    runWebSearchDebugger();
  } catch (error: any) {
    console.error('\n❌ Web search debugging failed:', error.message);
    process.exit(1);
  }
}

main();

