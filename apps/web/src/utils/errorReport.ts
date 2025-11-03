// src/utils/errorReport.ts

import { log } from '@/utils/logger';
import { notify } from '@/utils/toast';
import { getEnv } from '@/utils/env';

type ReportPayload = {
  message: string;
  name?: string;
  stack?: string;
  componentStack?: string;
  url: string;
  userAgent?: string;
  ts: string;
  tags?: Record<string, string | number | boolean>;
};

const REPORT_URL = getEnv().VITE_ERROR_REPORT_URL;

// Metrics bindings - set at startup
let incUnhandledErrors: ((n?: number) => void) | null = null;

export function bindMetrics(
  _incFriendly: (n?: number) => void, // Bound but not used - ErrorBoundary calls store directly
  incUnhandled: (n?: number) => void
) {
  incUnhandledErrors = incUnhandled;
}

function beacon(url: string, data: unknown): boolean {
  try {
    if ('sendBeacon' in navigator) {
      const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
      return navigator.sendBeacon(url, blob);
    }
  } catch {}
  return false;
}

export function reportError(payload: ReportPayload, options?: { skipToast?: boolean }): void {
  try {
    log.error('Reporting error', payload);
    
    // Increment unhandled errors counter
    if (incUnhandledErrors) {
      incUnhandledErrors(1);
    }
    
    if (!options?.skipToast) {
      notify.error('Unexpected error', payload.message);
    }
    if (!REPORT_URL) return;
    const ok = beacon(REPORT_URL, payload);
    if (!ok) {
      void fetch(REPORT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
        body: JSON.stringify(payload),
      }).catch(() => {});
    }
  } catch (e) {
    log.error('reportError failed', e);
  }
}

export function buildPayload(e: unknown, extras?: Partial<ReportPayload>): ReportPayload {
  const err = e instanceof Error ? e : new Error(String(e));
  const payload: ReportPayload = {
    message: err.message,
    url: location.href,
    ts: new Date().toISOString(),
  };
  if (err.name) payload.name = err.name;
  if (err.stack) payload.stack = err.stack;
  if (navigator.userAgent) payload.userAgent = navigator.userAgent;
  if (extras) {
    Object.assign(payload, extras);
  }
  return payload;
}

