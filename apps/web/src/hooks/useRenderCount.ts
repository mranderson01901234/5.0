// src/hooks/useRenderCount.ts

import * as React from 'react';

export function useRenderCount(threshold = 1) {
  const ref = React.useRef(0);
  ref.current += 1;
  return { renders: ref.current, isUnnecessary: ref.current > threshold };
}
