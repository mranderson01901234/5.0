// src/utils/retry.ts

type RetryOpts = {
  retries?: number;             // total attempts including the first
  baseMs?: number;              // base backoff
  factor?: number;              // exponential factor
  jitter?: boolean;             // add random jitter
  retryOn?(e: unknown, attempt: number): boolean;
  signal?: AbortSignal;
};

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const id = setTimeout(resolve, ms);
    const onAbort = () => { clearTimeout(id); reject(new DOMException('Aborted', 'AbortError')); };
    if (signal) signal.addEventListener('abort', onAbort, { once: true });
  });
}

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOpts = {}): Promise<T> {
  const retries = Math.max(1, opts.retries ?? 3);
  const base = opts.baseMs ?? 250;
  const factor = opts.factor ?? 2;

  let lastErr: unknown;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const should =
        attempt < retries &&
        (opts.retryOn ? opts.retryOn(e, attempt) : true);
      if (!should) break;
      const delay = base * Math.pow(factor, attempt - 1);
      const jitter = opts.jitter !== false ? Math.random() * 0.25 * delay : 0;
      await sleep(Math.round(delay + jitter), opts.signal);
    }
  }
  throw lastErr;
}

