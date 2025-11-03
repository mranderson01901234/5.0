// src/utils/handleApiError.ts

import { notify } from '@/utils/toast';
import { log } from '@/utils/logger';

type Options = {
  toast?: boolean;           // show a toast to the user
  action?: string;           // e.g., 'loading messages', 'sending message'
  fallbackMessage?: string;  // default user-facing message
};

export function handleApiError(err: unknown, opts: Options = {}): never {
  const { toast = true, action, fallbackMessage = 'Request failed' } = opts;

  let message = fallbackMessage;
  if (err instanceof Error && err.message) {
    message = err.message;
  } else if (typeof err === 'string') {
    message = err;
  }

  // Developer log
  log.error(`API error${action ? ` while ${action}` : ''}:`, err);

  // User-facing toast
  if (toast) {
    const header = action ? `Error ${action}` : 'Error';
    notify.error(header, message);
  }

  throw err instanceof Error ? err : new Error(String(err));
}

