// src/hooks/useShortcuts.ts

import * as React from 'react';

type Opts = { onOpenSettings?: () => void };

export function useShortcuts(opts: Opts) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === ',') {
        e.preventDefault();
        opts.onOpenSettings?.();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [opts]);
}

