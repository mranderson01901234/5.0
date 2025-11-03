#!/usr/bin/env node
/**
 * CLI runner for Prompt Inspector
 * Usage: npx tsx apps/llm-gateway/src/runPromptInspector.ts
 */

import { run } from './PromptInspector.js';

async function main() {
  try {
    await run();
  } catch (error: any) {
    console.error('\n❌ Prompt inspection failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();

