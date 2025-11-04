import React from 'react';
import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { SplitContainer } from '@/components/SplitContainer';
import { ArtifactPane } from '@/components/ArtifactPane';
import ArtifactPortal from '@/components/ArtifactPortal';
import { useUIStore } from '@/store/uiStore';
import { useArtifactStore } from '@/store/artifactStore';
import { withProviders } from '../../../tests/utils';

// Mock stores
vi.mock('@/store/uiStore', () => ({
  useUIStore: vi.fn(),
}));

vi.mock('@/store/artifactStore', () => ({
  useArtifactStore: vi.fn(),
}));

vi.mock('@/store/chatStore', () => ({
  useChatStore: vi.fn(() => ({ currentThreadId: 'test-thread' })),
}));

vi.mock('react-router-dom', () => ({
  useSearchParams: vi.fn(() => [new URLSearchParams(), vi.fn()]),
}));

vi.mock('@clerk/clerk-react', () => ({
  useAuth: vi.fn(() => ({ getToken: vi.fn(() => Promise.resolve('mock-token')) })),
}));

vi.mock('@/services/gateway', () => ({
  exportArtifact: vi.fn(),
  getExportStatus: vi.fn(),
}));

vi.mock('@/hooks/useAutoFocusArtifact', () => ({
  default: vi.fn(),
}));

describe('ArtifactPortal Isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('SplitContainer creates artifact-root portal target', () => {
    const { container } = render(
      withProviders(
        <SplitContainer leftWidth={50} rightWidth={50}>
          <div>Left</div>
          <div>Divider</div>
          <div>Right</div>
        </SplitContainer>
      )
    );

    const artifactRoot = container.querySelector('#artifact-root');
    expect(artifactRoot).toBeInTheDocument();
    expect(artifactRoot).toHaveClass('min-h-0');
    expect(artifactRoot).toHaveClass('h-full');
  });

  test('ArtifactPortal renders children into artifact-root', () => {
    const { container } = render(
      withProviders(
        <SplitContainer leftWidth={50} rightWidth={50}>
          <div>Left</div>
          <div>Divider</div>
          <ArtifactPortal>
            <div data-testid="portal-content">Portal Content</div>
          </ArtifactPortal>
        </SplitContainer>
      )
    );

    const artifactRoot = container.querySelector('#artifact-root');
    expect(artifactRoot).toBeInTheDocument();
    
    const portalContent = screen.getByTestId('portal-content');
    expect(portalContent).toBeInTheDocument();
    expect(artifactRoot?.contains(portalContent)).toBe(true);
  });

  test('ArtifactPane has id="artifact-scroll" when rendered via portal', () => {
    (useUIStore as any).mockReturnValue({
      currentArtifactId: 'test-artifact',
      setCurrentArtifact: vi.fn(),
      setSplitView: vi.fn(),
      setLastSplitCloseTs: vi.fn(),
    });

    (useArtifactStore as any).mockReturnValue({
      getArtifactById: vi.fn(() => ({
        id: 'test-artifact',
        type: 'table',
        data: [['Header'], ['Row 1']],
        threadId: 'test-thread',
      })),
      getLatestArtifactForThread: vi.fn(),
    });

    const { container } = render(
      withProviders(
        <SplitContainer leftWidth={50} rightWidth={50}>
          <div>Left</div>
          <div>Divider</div>
          <ArtifactPortal>
            <ArtifactPane width={50} />
          </ArtifactPortal>
        </SplitContainer>
      )
    );

    const artifactScroll = container.querySelector('#artifact-scroll');
    expect(artifactScroll).toBeInTheDocument();
    expect(artifactScroll).toHaveClass('overflow-y-auto');
  });

  test('artifact-scroll has computed overflowY of auto', () => {
    (useUIStore as any).mockReturnValue({
      currentArtifactId: 'test-artifact',
      setCurrentArtifact: vi.fn(),
      setSplitView: vi.fn(),
      setLastSplitCloseTs: vi.fn(),
    });

    (useArtifactStore as any).mockReturnValue({
      getArtifactById: vi.fn(() => ({
        id: 'test-artifact',
        type: 'table',
        data: [['Header'], ['Row 1']],
        threadId: 'test-thread',
      })),
      getLatestArtifactForThread: vi.fn(),
    });

    const { container } = render(
      withProviders(
        <SplitContainer leftWidth={50} rightWidth={50}>
          <div>Left</div>
          <div>Divider</div>
          <ArtifactPortal>
            <ArtifactPane width={50} />
          </ArtifactPortal>
        </SplitContainer>
      )
    );

    const artifactScroll = container.querySelector('#artifact-scroll');
    expect(artifactScroll).toBeInTheDocument();
    
    if (artifactScroll) {
      const styles = window.getComputedStyle(artifactScroll as Element);
      expect(styles.overflowY).toBe('auto');
    }
  });

  test('Right panel wrapper does not have overflow-hidden', () => {
    const { container } = render(
      withProviders(
        <SplitContainer leftWidth={50} rightWidth={50}>
          <div>Left</div>
          <div>Divider</div>
          <div>Right</div>
        </SplitContainer>
      )
    );

    const rightPanel = container.querySelector('[style*="width: 50%"]');
    expect(rightPanel).toBeInTheDocument();
    
    if (rightPanel) {
      const styles = window.getComputedStyle(rightPanel as Element);
      // Should not have overflow hidden - let children handle scrolling
      expect(styles.overflow).not.toBe('hidden');
    }
  });
});

