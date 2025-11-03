// src/store/useMetricsStore.ts

import { create } from 'zustand';

type Counters = {
  unhandledErrors: number;
  userFriendlyErrors: number;
  errorRecoveries: number;
  unnecessaryRerenders: number;
};

type Timers = {
  messageListRenderMs?: number;
};

type WebVitals = {
  LCP?: number;
  CLS?: number;
  INP?: number;
  TTFB?: number;
  // Note: FID is deprecated in web-vitals v5+ in favor of INP
};

type MetricsState = {
  counters: Counters;
  timers: Timers;
  vitals: WebVitals;
  inc: (key: keyof Counters, by?: number) => void;
  setTimer: (key: keyof Timers, ms: number) => void;
  setVital: (key: keyof WebVitals, val: number) => void;
  reset: () => void;
};

export const useMetricsStore = create<MetricsState>((set) => ({
  counters: {
    unhandledErrors: 0,
    userFriendlyErrors: 0,
    errorRecoveries: 0,
    unnecessaryRerenders: 0,
  },
  timers: {},
  vitals: {},
  inc: (key, by = 1) => set((s) => ({ counters: { ...s.counters, [key]: s.counters[key] + by } })),
  setTimer: (key, ms) => set((s) => ({ timers: { ...s.timers, [key]: ms } })),
  setVital: (key, val) => set((s) => ({ vitals: { ...s.vitals, [key]: val } })),
  reset: () =>
    set({
      counters: { unhandledErrors: 0, userFriendlyErrors: 0, errorRecoveries: 0, unnecessaryRerenders: 0 },
      timers: {},
      vitals: {},
    }),
}));
