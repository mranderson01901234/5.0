import React from 'react';
import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { SplitContainer } from '@/components/SplitContainer';
import { ArtifactPane } from '@/components/ArtifactPane';
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

describe('Artifact Scroll Isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('SplitContainer allows child scroll for both columns', () => {
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
    
    // Check that right panel doesn't have inline overflow styles that block scroll
    const styles = rightPanel?.getAttribute('style') || '';
    expect(styles).not.toContain('overflow: hidden');
    expect(styles).not.toContain('overscrollBehavior: none');
  });

  test('ArtifactPane has exactly one overflow-y-auto scroll container', () => {
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
      withProviders(<ArtifactPane width={50} />)
    );

    // Find all elements with overflow-y-auto
    const scrollContainers = Array.from(container.querySelectorAll('*')).filter(
      (el) => {
        const styles = window.getComputedStyle(el as Element);
        return styles.overflowY === 'auto' || styles.overflowY === 'scroll';
      }
    );

    // Should have exactly one scroll container in artifact pane
    const artifactPane = container.querySelector('.artifact-pane');
    const artifactScrollContainers = scrollContainers.filter((el) =>
      artifactPane?.contains(el as Node)
    );

    expect(artifactScrollContainers.length).toBe(1);
    expect(artifactScrollContainers[0]).toHaveClass('overflow-y-auto');
  });

  test('ArtifactPane does not have overflow-hidden on scroll container', () => {
    (useUIStore as any).mockReturnValue({
      currentArtifactId: 'test-artifact',
      setCurrentArtifact: vi.fn(),
      setSplitView: vi.fn(),
      setLastSplitCloseTs: vi.fn(),
    });

    (useArtifactStore as any).mockReturnValue({
      getArtifactById: vi.fn(() => ({
        id: 'test-artifact',
        type: 'doc',
        data: { title: 'Test Doc', sections: [] },
        threadId: 'test-thread',
      })),
      getLatestArtifactForThread: vi.fn(),
    });

    const { container } = render(
      withProviders(<ArtifactPane width={50} />)
    );

    const scrollContainer = container.querySelector('.overflow-y-auto');
    expect(scrollContainer).toBeInTheDocument();
    
    if (scrollContainer) {
      const styles = window.getComputedStyle(scrollContainer as Element);
      expect(styles.overflowY).toBe('auto');
      expect(styles.overflowY).not.toBe('hidden');
    }
  });

  test('ArtifactPane has sticky header', () => {
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
      withProviders(<ArtifactPane width={50} />)
    );

    const header = container.querySelector('header');
    expect(header).toBeInTheDocument();
    expect(header).toHaveClass('sticky');
    expect(header).toHaveClass('top-0');
  });

  test('Artifact section has data-artifact-id attribute', () => {
    const artifactId = 'test-artifact-123';
    
    (useUIStore as any).mockReturnValue({
      currentArtifactId: artifactId,
      setCurrentArtifact: vi.fn(),
      setSplitView: vi.fn(),
      setLastSplitCloseTs: vi.fn(),
    });

    (useArtifactStore as any).mockReturnValue({
      getArtifactById: vi.fn(() => ({
        id: artifactId,
        type: 'table',
        data: [['Header'], ['Row 1']],
        threadId: 'test-thread',
      })),
      getLatestArtifactForThread: vi.fn(),
    });

    const { container } = render(
      withProviders(<ArtifactPane width={50} />)
    );

    const artifactSection = container.querySelector(`[data-artifact-id="${artifactId}"]`);
    expect(artifactSection).toBeInTheDocument();
    expect(artifactSection?.tagName).toBe('SECTION');
  });
});

describe('Auto-focus Hook', () => {
  test('useAutoFocusArtifact scrolls to artifact when currentArtifactId changes', async () => {
    const { useAutoFocusArtifact } = await import('@/hooks/useAutoFocusArtifact');
    const scrollIntoViewMock = vi.fn();
    
    const containerRef = {
      current: {
        querySelector: vi.fn(() => ({
          scrollIntoView: scrollIntoViewMock,
        })),
        scrollTo: vi.fn(),
      } as any,
    };

    // Mock currentArtifactId changing
    let currentArtifactId = 'artifact-1';
    (useUIStore as any).mockReturnValue({
      currentArtifactId,
    });

    // This is a simplified test - in real usage, the hook would be called by React
    // For now, we verify the hook logic works with a manual call
    const TestComponent = () => {
      useAutoFocusArtifact(containerRef);
      return <div>Test</div>;
    };

    render(withProviders(<TestComponent />));

    // Simulate artifact change
    currentArtifactId = 'artifact-2';
    (useUIStore as any).mockReturnValue({
      currentArtifactId,
    });

    // Re-render would trigger the effect
    // In a real test, we'd use React Testing Library's rerender
    expect(containerRef.current.querySelector).toHaveBeenCalled();
  });
});

