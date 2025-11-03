import React from "react";
import { createRoot } from "react-dom/client";

import "./index.css";
import "./theme.css";
import App from "./App";
import { WithClerk } from "./auth/ClerkProvider";
import { reportError, buildPayload, bindMetrics } from '@/utils/errorReport';
import { notify } from '@/utils/toast';
import { getEnv } from '@/utils/env';
import { useMetricsStore } from '@/store/useMetricsStore';
import { attachWebVitals } from '@/utils/vitals';

// Validate environment variables early. Let ErrorBoundary/global handlers surface toasts in dev.
getEnv();

// Bind metrics incrementers at startup
bindMetrics(
  (n = 1) => useMetricsStore.getState().inc('userFriendlyErrors', n),
  (n = 1) => useMetricsStore.getState().inc('unhandledErrors', n)
);

// Attach Web Vitals collection
attachWebVitals();

// Global error listeners
window.addEventListener('error', (event) => {
  reportError(buildPayload(event.error ?? event.message, { tags: { kind: 'window.onerror' } }));
});

window.addEventListener('unhandledrejection', (event) => {
  notify.error('Unhandled error', String(event.reason ?? 'Unknown'));
  reportError(buildPayload(event.reason ?? 'unhandledrejection', { tags: { kind: 'unhandledrejection' } }));
});

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <WithClerk>
      <App />
    </WithClerk>
  </React.StrictMode>
);

