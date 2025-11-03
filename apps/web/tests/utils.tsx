import React from 'react';
import { RetryProvider } from '@/context/RetryContext';
import { Toaster } from 'sonner';

export function withProviders(children: React.ReactNode) {
  return (
    <RetryProvider>
      <Toaster />
      {children}
    </RetryProvider>
  );
}

