// src/utils/vitals.ts

import { onCLS, onLCP, onINP, onTTFB, type Metric } from 'web-vitals';
import { useMetricsStore } from '@/store/useMetricsStore';

export function attachWebVitals() {
  const set = useMetricsStore.getState().setVital;
  onLCP((v: Metric) => set('LCP', Math.round(v.value)));
  // FID is deprecated in favor of INP, but we track it if available via INP fallback
  // INP covers interaction responsiveness which replaces FID
  onCLS((v: Metric) => set('CLS', Number(v.value.toFixed(3))));
  onINP((v: Metric) => set('INP', Math.round(v.value)));
  onTTFB((v: Metric) => set('TTFB', Math.round(v.value)));
  // Note: FID is deprecated and not available in web-vitals v5+
  // INP is the recommended replacement metric
}

