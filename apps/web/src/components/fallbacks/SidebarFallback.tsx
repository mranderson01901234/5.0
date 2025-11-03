// src/components/fallbacks/SidebarFallback.tsx

import React from 'react';
import { useRetry } from '@/context/RetryContext';
import { notify } from '@/utils/toast';

type Props = {
  error: Error;
  reset: () => void;
};

const SidebarFallback: React.FC<Props> = ({ error, reset }) => {
  const { trigger } = useRetry();
  const onRetry = () => {
    notify.info('Retrying sidebar load', error.message);
    trigger();
    reset();
  };

  return (
    <aside role="complementary" className="p-3 border-r">
      <div role="alert" className="p-3 border rounded-md">
        <div className="text-sm font-semibold">Sidebar failed to load.</div>
        <pre className="mt-2 text-xs overflow-auto max-h-28" aria-label="error-message">
          {error.message}
        </pre>
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 px-3 py-1 border rounded-md"
          aria-label="Retry loading sidebar"
        >
          Retry
        </button>
      </div>
    </aside>
  );
};

export default SidebarFallback;

