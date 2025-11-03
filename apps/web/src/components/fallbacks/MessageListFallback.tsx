// src/components/fallbacks/MessageListFallback.tsx

import React from 'react';
import { useRetry } from '@/context/RetryContext';
import { notify } from '@/utils/toast';

type Props = {
  error: Error;
  reset: () => void;
};

const MessageListFallback: React.FC<Props> = ({ error, reset }) => {
  const { trigger } = useRetry();
  const onRetry = () => {
    notify.info('Retrying message render', error.message);
    trigger();
    reset();
  };

  return (
    <div role="alert" className="p-3 border rounded-md">
      <div className="text-sm font-semibold">Chat messages failed to render.</div>
      <pre className="mt-2 text-xs overflow-auto max-h-32" aria-label="error-message">
        {error.message}
      </pre>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onRetry}
          className="px-3 py-1 border rounded-md"
          aria-label="Retry rendering messages"
        >
          Retry
        </button>
      </div>
    </div>
  );
};

export default MessageListFallback;

