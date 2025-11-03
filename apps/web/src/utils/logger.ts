// src/utils/logger.ts

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const isProd = import.meta.env.PROD === true;

// Use native console methods directly but only for logger implementation
// This file is the exception to no-console rule
/* eslint-disable no-console */
function emit(level: LogLevel, ...args: unknown[]) {
  // In prod, keep errors and warns. In dev, allow all.
  if (isProd && level === 'debug') return;
  // Access console methods safely
  const consoleMethod = console[level];
  if (typeof consoleMethod === 'function') {
    consoleMethod(...args);
  }
}
/* eslint-enable no-console */

export const log = {
  debug: (...a: unknown[]) => emit('debug', '[DEBUG]', ...a),
  info:  (...a: unknown[]) => emit('info',  '[INFO]',  ...a),
  warn:  (...a: unknown[]) => emit('warn',  '[WARN]',  ...a),
  error: (...a: unknown[]) => emit('error', '[ERROR]', ...a),
} as const;

