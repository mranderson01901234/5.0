import React from "react";
import { useUIStore } from "@/store/uiStore";
import { useArtifactStore, TableArtifact, Artifact } from "@/store/artifactStore";
import { useSearchParams } from "react-router-dom";
import { useChatStore } from "@/store/chatStore";
import useAutoFocusArtifact from "@/hooks/useAutoFocusArtifact";
import { TableRenderer, DocumentRenderer, SheetRenderer, ArtifactEmptyState } from "./artifacts";
import { X } from "lucide-react";

interface ArtifactPaneProps {
  width?: number; // Percentage
}

/**
 * ArtifactPane - Right panel for artifact creation
 * Shows empty state when no artifact is selected
 */
export const ArtifactPane: React.FC<ArtifactPaneProps> = ({ width = 50 }) => {
  const { currentArtifactId, setCurrentArtifact, setSplitView, setLastSplitCloseTs } = useUIStore();
  const { getArtifactById, getLatestArtifactForThread } = useArtifactStore();
  const { currentThreadId } = useChatStore();
  const [, setSearchParams] = useSearchParams();
  const [fallbackUsed, setFallbackUsed] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = React.useState(0);
  // Removed showInstrumentation state - use process.env check directly instead
  const showInstrumentation = process.env.NODE_ENV === 'development';

  // Find artifact by ID
  const artifact = currentArtifactId ? getArtifactById(currentArtifactId) : null;
  
  // Get latest artifact for thread as fallback
  const latestForThread = currentThreadId ? getLatestArtifactForThread(currentThreadId) : null;

  // Runtime instrumentation: Log scroll owners on mount (dev mode)
  React.useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      const owners = [...document.querySelectorAll('*')].filter(e => {
        const cs = getComputedStyle(e);
        return /(auto|scroll)/.test(cs.overflowY);
      }).map(e => ({
        el: e,
        className: e.className,
        id: e.id,
        overflowY: getComputedStyle(e).overflowY
      }));
      console.log('[scroll-owners]', owners);
    }
  }, []);

  // Track scroll position for instrumentation overlay
  React.useEffect(() => {
    const container = scrollRef.current;
    if (!container || process.env.NODE_ENV !== 'development') {
      return;
    }

    const handleScroll = () => {
      setScrollTop(container.scrollTop);
    };
    container.addEventListener('scroll', handleScroll);
    return () => {
      container.removeEventListener('scroll', handleScroll);
    };
  }, [artifact]); // Re-run when artifact changes

  // Auto-focus artifact when it changes
  useAutoFocusArtifact(scrollRef);
  
  // Fallback: if currentArtifactId is not found, try a one-frame defer with requestAnimationFrame
  React.useEffect(() => {
    if (!artifact && latestForThread) {
      // Defensive fallback - use requestAnimationFrame to avoid render flicker
      requestAnimationFrame(() => {
        const currentState = useUIStore.getState();
        // Double-check that we still don't have an artifact and latest is still valid
        if (!currentState.currentArtifactId && latestForThread) {
          console.log('[ArtifactPane] Fallback to latest artifact:', latestForThread.id);
          setFallbackUsed(true);
          setCurrentArtifact(latestForThread.id);
        }
      });
    } else if (artifact) {
      setFallbackUsed(false);
    }
  }, [artifact, latestForThread, setCurrentArtifact]);

  const handleClose = () => {
    setCurrentArtifact(null);
    setSplitView(false);
    setLastSplitCloseTs(Date.now()); // Track manual close for debounce
    setSearchParams({ view: "chat" }, { replace: true });
  };

  const renderArtifactContent = (artifact: Artifact) => {
    if (artifact.type === "table" && artifact.data) {
      return <TableRenderer artifact={artifact as TableArtifact} />;
    }
    if (artifact.type === "doc") {
      return <DocumentRenderer artifact={artifact} />;
    }
    if (artifact.type === "sheet") {
      return <SheetRenderer artifact={artifact} />;
    }
    return (
      <div className="text-white/70 text-sm">
        Artifact {artifact.id} - Type: {artifact.type} - Rendering not yet implemented
      </div>
    );
  };

  const showDevOverlay = process.env.NODE_ENV === 'development' && showInstrumentation && scrollRef.current;

  // Prevent any wheel/scroll events on the artifact pane
  const handleWheel = React.useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  return (
    <div
      className="artifact-pane flex flex-col backdrop-blur-xl"
      role="complementary"
      aria-label="Artifact creation pane"
      onWheel={handleWheel}
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        width: '100%',
        overflow: 'hidden',
        background: '#0f0f0f',
        borderLeft: '1px solid rgba(255,255,255,0.1)',
        pointerEvents: 'auto'
      }}
    >
      {artifact ? (
        <>
          <div className="h-full min-h-0 flex flex-col overflow-hidden">
            {/* Header */}
            <header className="sticky top-0 z-10 bg-[#0f0f0f]/80 backdrop-blur border-b border-white/10 flex-shrink-0">
              <div className="p-4">
                {/* Close button */}
                <div className="flex justify-end mb-2">
                  <button
                    onClick={handleClose}
                    className="text-white/60 hover:text-white/90 transition-colors p-1 rounded hover:bg-white/5"
                    aria-label="Close artifact pane"
                    title="Close artifact pane (Esc)"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                {/* Fallback banner */}
                {fallbackUsed && (
                  <div className="mb-2 px-3 py-1.5 bg-blue-500/10 border border-blue-500/20 rounded text-blue-400 text-xs">
                    Showing latest artifact
                  </div>
                )}
              </div>
            </header>
            {/* Content - No scrolling, static display */}
            <div 
              id="artifact-scroll"
              ref={scrollRef}
              className="flex-1 min-h-0 overflow-hidden"
            >
              <section className="p-4">
                {renderArtifactContent(artifact)}
              </section>
            </div>
            {showDevOverlay && (
              <div
                className="fixed bottom-4 right-4 z-50 bg-black/80 text-white text-xs p-2 rounded font-mono"
                style={{ pointerEvents: 'none' }}
              >
                <div>owner: {getComputedStyle(scrollRef.current!).overflowY}</div>
                <div>scrollTop: {scrollTop}</div>
              </div>
            )}
          </div>
        </>
      ) : (
        <ArtifactEmptyState />
      )}
    </div>
  );
};
