import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { withProviders } from '../../../tests/utils';

// Mock env module to prevent validation errors during import
vi.mock('@/utils/env', () => ({
  getEnv: vi.fn(() => ({
    VITE_API_BASE_URL: 'http://localhost:8787',
    VITE_CLERK_PUBLISHABLE_KEY: 'pk_test_mock',
    VITE_ERROR_REPORT_URL: undefined,
  })),
}));

function Boom() {
  throw new Error('kaboom');
}

test('shows fallback on error', async () => {
  render(
    withProviders(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    )
  );

  expect(await screen.findByRole('alert')).toBeInTheDocument();
  expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
  expect(screen.getByText('kaboom')).toBeInTheDocument();
  
  // Retry button should be present
  const retryButton = screen.getByRole('button', { name: /retry/i });
  expect(retryButton).toBeInTheDocument();
});

test('retry button can be clicked', async () => {
  const user = userEvent.setup();
  
  render(
    withProviders(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    )
  );

  await screen.findByRole('alert');
  const retryButton = screen.getByRole('button', { name: /retry/i });
  
  // Click should not throw (even though component will error again after reset)
  await expect(user.click(retryButton)).resolves.not.toThrow();
  
  // After clicking, the boundary should still show error (since Boom still throws)
  // or the alert might briefly disappear before reappearing
  await screen.findByRole('alert', {}, { timeout: 2000 });
});

test('renders children when no error', () => {
  const SafeComponent = () => <div>ok</div>;
  
  render(
    withProviders(
      <ErrorBoundary>
        <SafeComponent />
      </ErrorBoundary>
    )
  );
  
  expect(screen.getByText('ok')).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

