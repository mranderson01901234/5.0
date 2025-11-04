import { useEffect, useRef } from "react";
import { useArtifactStore } from "../store/artifactStore";
import { useUIStore } from "../store/uiStore";

/**
 * Hook to auto-scroll artifact pane to the current artifact when it changes
 * 
 * @param containerRef - Ref to the scrollable container element
 */
export function useArtifactAutoscroll(containerRef: React.RefObject<HTMLElement>) {
  const currentArtifactId = useUIStore((s) => s.currentArtifactId);
  const autoScrollArtifacts = useUIStore((s) => s.autoScrollArtifacts ?? true);
  const lastIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!containerRef.current || !currentArtifactId || !autoScrollArtifacts) return;
    if (currentArtifactId === lastIdRef.current) return;

    // Debug logging
    console.log('[artifact-scroll] Auto-scrolling to artifact:', currentArtifactId);
    console.log('[artifact-scroll] Container height:', containerRef.current.clientHeight);

    // Small delay to ensure DOM is updated
    const timeoutId = setTimeout(() => {
      if (!containerRef.current) return;

      // Try to find a child element with data-artifact-id
      const node = containerRef.current.querySelector<HTMLElement>(
        `[data-artifact-id="${currentArtifactId}"]`
      );

      if (node) {
        console.log('[artifact-scroll] Element found, scrolling to artifact');
        // Align to top of its own scroll container
        node.scrollIntoView({ 
          block: "start", 
          inline: "nearest", 
          behavior: "smooth" 
        });
        lastIdRef.current = currentArtifactId;
      } else {
        console.log('[artifact-scroll] Element not found, scrolling to top');
        // Fallback: scroll to top (most artifacts render at top)
        containerRef.current.scrollTo({ top: 0, behavior: "smooth" });
        lastIdRef.current = currentArtifactId;
      }
    }, 100); // Small delay for DOM updates

    return () => clearTimeout(timeoutId);
  }, [currentArtifactId, containerRef, autoScrollArtifacts]);
}

