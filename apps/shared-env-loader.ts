/**
 * Unified environment variable loader
 * Always loads from root .env file for monorepo consistency
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Get root directory (1 level up from apps/)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Determine if we're in apps/ directory
const isInApps = __dirname.includes('/apps/') || __dirname.includes('\\apps\\');
const rootDir = isInApps ? resolve(__dirname, '../..') : resolve(__dirname, '..');
const rootEnvPath = resolve(rootDir, '.env');

// Load root .env file
const result = config({ path: rootEnvPath });

if (result.error) {
  console.warn(`Warning: Could not load .env from ${rootEnvPath}:`, result.error.message);
} else {
  console.debug(`Loaded environment from: ${rootEnvPath}`);
}

