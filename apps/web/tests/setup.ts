import '@testing-library/jest-dom/vitest';
import { expect, vi, beforeAll } from 'vitest';

// Polyfills
import 'whatwg-fetch';

// Mock environment variables for tests - must be set before any imports that use them
Object.defineProperty(import.meta, 'env', {
  value: {
    ...import.meta.env,
    VITE_API_BASE_URL: 'http://localhost:8787',
    VITE_CLERK_PUBLISHABLE_KEY: 'pk_test_mock_key_for_tests',
    DEV: true,
    MODE: 'test',
    PROD: false,
  },
  writable: true,
  configurable: true,
});

// Also stub via vitest's stubEnv (may be redundant but ensures coverage)
beforeAll(() => {
  vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:8787');
  vi.stubEnv('VITE_CLERK_PUBLISHABLE_KEY', 'pk_test_mock_key_for_tests');
});

// Quiet noisy console in tests; allow error to surface
const origWarn = console.warn;
const origError = console.error;
beforeAll(() => {
  console.warn = (...args) => {
    const msg = args.join(' ');
    if (/deprecated|ReactDOM.render is no longer supported/i.test(msg)) return;
    origWarn(...args);
  };
});

afterAll(() => {
  console.warn = origWarn;
  console.error = origError;
});

// Custom matchers example (optional)
expect.extend({});

