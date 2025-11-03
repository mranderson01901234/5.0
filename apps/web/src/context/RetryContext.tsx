// src/context/RetryContext.tsx

import React, { createContext, useContext, useMemo, useState, useCallback } from 'react';
import { useMetricsStore } from '@/store/useMetricsStore';

type RetryCtx = {
  /** Incrementing value; include in deps to refetch on retries */
  token: number;
  /** Call to request refetch/retry across the app */
  trigger: () => void;
};

const Ctx = createContext<RetryCtx | null>(null);

export const RetryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState(0);
  const inc = useMetricsStore((s) => s.inc);
  const trigger = useCallback(() => {
    setToken((n) => n + 1);
    inc('errorRecoveries', 1);
  }, [inc]);
  const value = useMemo(() => ({ token, trigger }), [token, trigger]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

export const useRetry = (): RetryCtx => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useRetry must be used within <RetryProvider>');
  return ctx;
};

/** Convenience hook: returns just the token for deps */
export const useRetryToken = () => useRetry().token;

