import { create } from "zustand";
import { persist } from "zustand/middleware";
import { nanoid } from "../lib/id";
import { createArtifact, getArtifacts, deleteArtifact } from "../services/gateway";
import { logEvent } from "../lib/eventLogger";

/**
 * Event emitter for cross-store communication
 * Decouples artifactStore from UIStore
 */
type ArtifactStoreEvent = 
  | { type: 'artifactIdChanged'; oldId: string; newId: string }
  | { type: 'artifactDeleted'; artifactId: string };

class ArtifactStoreEventEmitter {
  private listeners: Map<string, Set<(event: ArtifactStoreEvent) => void>> = new Map();

  subscribe(eventType: ArtifactStoreEvent['type'], callback: (event: ArtifactStoreEvent) => void) {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)!.add(callback);
    
    return () => {
      this.listeners.get(eventType)?.delete(callback);
    };
  }

  emit(event: ArtifactStoreEvent) {
    this.listeners.get(event.type)?.forEach(callback => callback(event));
  }
}

export const artifactStoreEvents = new ArtifactStoreEventEmitter();

