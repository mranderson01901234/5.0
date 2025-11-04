/**
 * Logger utility
 */

import pino from 'pino';
import { createRequire } from 'module';

// Try to resolve pino-pretty, but make it optional
let pinoPrettyPath: string | undefined;
try {
  const require = createRequire(import.meta.url);
  pinoPrettyPath = require.resolve('pino-pretty');
} catch (error) {
  // pino-pretty not available, will use default JSON output
  pinoPrettyPath = undefined;
}

export const logger = pino({
  level: process.env.LOG_LEVEL || 'debug',
  transport: pinoPrettyPath ? {
    target: pinoPrettyPath,
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname',
    },
  } : undefined,
});

