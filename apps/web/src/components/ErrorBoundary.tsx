// src/components/ErrorBoundary.tsx
import React from 'react';
import { reportError, buildPayload } from '@/utils/errorReport';
import { notify } from '@/utils/toast';

type FallbackProps = {
  error: Error;
  reset: () => void;
};

type ErrorBoundaryProps = {
  children: React.ReactNode;
  FallbackComponent?: React.ComponentType<FallbackProps>;
  onError?(error: Error, info: React.ErrorInfo): void;
  onReset?(): void;
  /** When any value in this array changes, the boundary resets its state */
  resetKeys?: ReadonlyArray<unknown>;
};

type ErrorBoundaryState = {
  hasError: boolean;
  error: Error | null;
};

const DefaultFallback: React.FC<FallbackProps> = ({ error, reset }) => {
  return (
    <div role="alert" className="p-4 border rounded-md">
      <h2 className="text-base font-semibold">Something went wrong.</h2>
      <pre className="mt-2 text-sm overflow-auto max-h-40">{error.message}</pre>
      <button
        type="button"
        onClick={reset}
        className="mt-3 px-3 py-1 border rounded-md"
        aria-label="Retry last action"
      >
        Retry
      </button>
    </div>
  );
};

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  override state: ErrorBoundaryState = { hasError: false, error: null };
  private prevResetKeys?: ReadonlyArray<unknown>;

  override componentDidCatch(error: Error, info: React.ErrorInfo) {
    notify.error('Application error', error.message);
    // User-friendly toast shown - increment counter
    try {
      const { useMetricsStore } = require('@/store/useMetricsStore') as typeof import('@/store/useMetricsStore');
      useMetricsStore.getState()?.inc?.('userFriendlyErrors', 1);
    } catch {
      // Silently fail if store not available
    }
    reportError(buildPayload(error, { ...(info.componentStack && { componentStack: info.componentStack }), tags: { kind: 'react-boundary' } }), { skipToast: true });
    this.props.onError?.(error, info);
  }

  override componentDidUpdate(_prevProps: ErrorBoundaryProps) {
    const { resetKeys } = this.props;
    if (!resetKeys) return;

    // Shallow compare resetKeys for changes
    const prev = this.prevResetKeys ?? [];
    const curr = resetKeys;
    const changed =
      prev.length !== curr.length ||
      prev.some((v, i) => Object.is(v, curr[i]) === false);

    if (changed) {
      this.reset();
      this.prevResetKeys = [...curr];
    }
  }

  reset = () => {
    if (this.state.hasError) {
      this.setState({ hasError: false, error: null });
      this.props.onReset?.();
    }
  };

  override render(): React.ReactNode {
    const { hasError, error } = this.state;
    const Fallback = this.props.FallbackComponent ?? DefaultFallback;

    if (hasError && error) {
      return <Fallback error={error} reset={this.reset} />;
    }
    return this.props.children;
  }
}

