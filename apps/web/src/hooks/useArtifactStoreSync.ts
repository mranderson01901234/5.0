import { useEffect } from "react";
import { useUIStore } from "@/store/uiStore";
import { artifactStoreEvents } from "@/store/artifactStoreEvents";

/**
 * Hook to sync artifact store events with UI store
 * Listens to artifact store events and updates UI store accordingly
 * This decouples stores and uses pub/sub pattern instead of direct mutations
 */
export function useArtifactStoreSync() {
  const setCurrentArtifact = useUIStore(s => s.setCurrentArtifact);
  const setSplitView = useUIStore(s => s.setSplitView);

  useEffect(() => {
    // Subscribe to artifact ID changes
    const unsubscribeIdChange = artifactStoreEvents.subscribe('artifactIdChanged', (event) => {
      const currentArtifactId = useUIStore.getState().currentArtifactId;
      if (currentArtifactId === event.oldId) {
        console.log('[useArtifactStoreSync] Updating currentArtifactId from', event.oldId, 'to', event.newId);
        setCurrentArtifact(event.newId);
      }
    });

    // Subscribe to artifact deletion
    const unsubscribeDelete = artifactStoreEvents.subscribe('artifactDeleted', (event) => {
      const currentArtifactId = useUIStore.getState().currentArtifactId;
      if (currentArtifactId === event.artifactId) {
        setCurrentArtifact(null);
        setSplitView(false);
      }
    });

    return () => {
      unsubscribeIdChange();
      unsubscribeDelete();
    };
  }, [setCurrentArtifact, setSplitView]);
}

