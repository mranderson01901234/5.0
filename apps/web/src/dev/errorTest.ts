// src/dev/errorTest.ts
export function maybeThrowDevError() {
  if (!import.meta.env.DEV) return;
  const params = new URLSearchParams(location.search);
  if (params.get('throw') === '1') {
    throw new Error('Dev forced error via ?throw=1');
  }
}

