import React from 'react';
import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { withProviders } from '../../../tests/utils';

// Test error fallback components since actual MessageList/Sidebar require complex mocks
import MessageListFallback from '@/components/fallbacks/MessageListFallback';
import SidebarFallback from '@/components/fallbacks/SidebarFallback';

test('MessageListFallback shows error and retry button', () => {
  const error = new Error('Failed to load messages');
  const reset = vi.fn();
  
  render(withProviders(<MessageListFallback error={error} reset={reset} />));
  
  expect(screen.getByRole('alert')).toBeInTheDocument();
  expect(screen.getByText('Chat messages failed to render.')).toBeInTheDocument();
  expect(screen.getByLabelText(/retry rendering messages/i)).toBeInTheDocument();
});

test('SidebarFallback shows error and retry button', () => {
  const error = new Error('Failed to load conversations');
  const reset = vi.fn();
  
  render(withProviders(<SidebarFallback error={error} reset={reset} />));
  
  expect(screen.getByRole('alert')).toBeInTheDocument();
  expect(screen.getByText('Sidebar failed to load.')).toBeInTheDocument();
  expect(screen.getByLabelText(/retry loading sidebar/i)).toBeInTheDocument();
});

