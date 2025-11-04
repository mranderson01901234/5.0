import { useEffect, useRef } from "react";
import { useUIStore } from "../store/uiStore";

/**
 * Auto-focus hook for artifact scroll container
 * Scrolls the artifact into view when currentArtifactId changes
 */
export default function useAutoFocusArtifact(containerRef: React.RefObject<HTMLElement>) {
  const { currentArtifactId } = useUIStore();
  const lastId = useRef<string | null>(null);

  useEffect(() => {
    if (!containerRef.current || !currentArtifactId) return;
    if (currentArtifactId === lastId.current) return;

    const el = containerRef.current.querySelector<HTMLElement>(`[data-artifact-id="${currentArtifactId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start", inline: "nearest" });
      lastId.current = currentArtifactId;
    } else {
      // If artifact element not found, scroll to top
      containerRef.current.scrollTo({ top: 0, behavior: "smooth" });
      lastId.current = currentArtifactId;
    }
  }, [currentArtifactId, containerRef]);
}

