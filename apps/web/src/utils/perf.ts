/**
 * Performance measurement utilities for React components
 */

export function mark(name: string): void {
  if (typeof performance !== 'undefined' && performance.mark) {
    performance.mark(name);
  }
}

export function measure(name: string, start: string, end: string): number {
  if (typeof performance !== 'undefined' && performance.measure) {
    performance.measure(name, start, end);
    const entries = performance.getEntriesByName(name);
    return entries[entries.length - 1]?.duration ?? 0;
  }
  return 0;
}

