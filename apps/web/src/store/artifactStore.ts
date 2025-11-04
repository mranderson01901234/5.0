import { create } from "zustand";
import { persist } from "zustand/middleware";
import { nanoid } from "../lib/id";
import { createArtifact, getArtifacts, deleteArtifact } from "../services/gateway";
import { logEvent } from "../lib/eventLogger";
import { useUIStore } from "./uiStore";

export type ArtifactType = "table" | "doc" | "sheet" | "image";

export interface TableArtifact {
  id: string;
  type: "table";
  threadId: string;
  createdAt: number;
  data: string[][];
  tempId?: string; // Track temp ID for server sync
}

export interface ImageArtifact {
  id: string;
  type: "image";
  threadId: string;
  createdAt: number;
  data: {
    images: { mime: string; dataUrl: string }[];
    prompt: string;
    size?: string;
    aspectRatio?: "1:1" | "9:16" | "16:9" | "4:3" | "3:4";
    sampleCount?: number;
    model?: string;
    metadata?: {
      cost?: number;
      costPerImage?: number;
      generationTimeMs?: number;
      imageCount?: number;
      timestamp?: number;
    };
  };
  tempId?: string;
}

export interface Artifact {
  id: string;
  type: ArtifactType;
  threadId: string;
  createdAt: number;
  tempId?: string; // Track temp ID for server sync
  // Placeholder for future artifact data
  data?: unknown;
}

type AllArtifacts = TableArtifact | ImageArtifact | Artifact;

interface ArtifactState {
  artifacts: AllArtifacts[];
  current: AllArtifacts | null;
  lastArtifactAddedAt: number | null; // Track when artifacts are added

  // Actions
  addArtifact: (artifact: AllArtifacts) => void;
  createTableArtifact: (data: string[][], threadId: string) => TableArtifact;
  createImageArtifact: (data: ImageArtifact['data'], threadId: string) => ImageArtifact;
  updateArtifact: (id: string, data: unknown) => void;
  setCurrent: (id: string | null) => void;
  getArtifactById: (id: string) => AllArtifacts | undefined;
  getById: (id: string) => AllArtifacts | undefined; // Alias for getArtifactById
  getLatestArtifactForThread: (threadId: string) => AllArtifacts | undefined;
  clearArtifacts: () => void;
  toMessagePayload: (artifact: AllArtifacts) => { artifactId: string; type: ArtifactType };
  
  // Phase 4: Backend sync methods
  saveArtifact: (artifact: AllArtifacts, token?: string) => Promise<AllArtifacts | null>;
  loadArtifacts: (threadId: string, token?: string) => Promise<void>;
  removeArtifact: (id: string, token?: string) => Promise<void>;
}

export const useArtifactStore = create<ArtifactState>()(
  persist(
    (set, get) => ({
      artifacts: [],
      current: null,
      lastArtifactAddedAt: null,

      addArtifact: (artifact) =>
        set((state) => ({
          artifacts: [...state.artifacts, artifact],
          current: artifact,
          lastArtifactAddedAt: Date.now(),
        })),

      createTableArtifact: (data: string[][], threadId: string) => {
        const tempId = `msg_${nanoid()}`;
        const artifact: TableArtifact = {
          id: tempId,
          type: "table",
          threadId,
          createdAt: Date.now(),
          data,
          tempId, // Mark as temp until saved to server
        };
        set((state) => ({
          artifacts: [...state.artifacts, artifact],
          current: artifact,
          lastArtifactAddedAt: Date.now(),
        }));
        return artifact;
      },
      
      createImageArtifact: (data: ImageArtifact['data'], threadId: string) => {
        const tempId = `msg_${nanoid()}`;
        const artifact: ImageArtifact = {
          id: tempId,
          type: "image",
          threadId,
          createdAt: Date.now(),
          data,
          tempId,
        };
        set((state) => ({
          artifacts: [...state.artifacts, artifact],
          current: artifact,
          lastArtifactAddedAt: Date.now(),
        }));
        return artifact;
      },

      updateArtifact: (id: string, data: unknown) =>
        set((state) => ({
          artifacts: state.artifacts.map((a) =>
            a.id === id ? { ...a, data } : a
          ),
          current:
            state.current?.id === id ? { ...state.current, data } : state.current,
        })),

      setCurrent: (id) =>
        set((state) => ({
          current: id ? state.artifacts.find((a) => a.id === id) || null : null,
        })),

      getArtifactById: (id) => {
        const state = get();
        return state.artifacts.find((a) => a.id === id);
      },

      getById: (id) => {
        const state = get();
        return state.artifacts.find((a) => a.id === id);
      },

      toMessagePayload: (artifact) => ({
        artifactId: artifact.id,
        type: artifact.type,
      }),

      getLatestArtifactForThread: (threadId: string) => {
        const state = get();
        const threadArtifacts = state.artifacts.filter((a) => a.threadId === threadId);
        if (threadArtifacts.length === 0) return undefined;
        return threadArtifacts.reduce((latest, current) =>
          current.createdAt > latest.createdAt ? current : latest
        );
      },

      clearArtifacts: () => set({ artifacts: [], current: null }),

      // Phase 4: Save artifact to backend
      saveArtifact: async (artifact: AllArtifacts, token?: string) => {
        try {
          const saved = await createArtifact(
            {
              threadId: artifact.threadId,
              type: artifact.type,
              data: artifact.data,
            },
            token
          );
          
          // Find artifact by tempId OR by id
          const oldId = artifact.tempId || artifact.id;
          let updatedArtifact: AllArtifacts | null = null;
          
          // Update artifact with server ID if different
          if (saved.id !== artifact.id) {
            set((state) => {
              const artifacts = state.artifacts.map((a) => {
                if (a.id === oldId || a.tempId === oldId) {
                  // Replace temp ID with server ID, remove tempId marker
                  const { tempId: _tempId, ...rest } = a;
                  updatedArtifact = { ...rest, id: saved.id };
                  return updatedArtifact;
                }
                return a;
              });
              
              return {
                artifacts,
                current: state.current?.id === oldId ? updatedArtifact : state.current,
              };
            });
            
            // Update UI store's currentArtifactId if it matches the old artifact ID
            // This ensures the split view stays open even if the artifact ID changes
            const uiStore = useUIStore.getState();
            if (uiStore.currentArtifactId === oldId) {
              console.log('[artifactStore] Updating currentArtifactId from', oldId, 'to', saved.id);
              uiStore.setCurrentArtifact(saved.id);
            }
          } else {
            updatedArtifact = artifact;
          }
          
          // Log telemetry event
          logEvent({
            event: "artifact_saved",
            type: artifact.type,
            artifactId: saved.id,
            persisted: true,
            timestamp: Date.now(),
          });
          
          return updatedArtifact;
        } catch (error) {
          console.error('[artifactStore] Failed to save artifact', error);
          // Don't throw - allow local-only artifacts
          return null;
        }
      },

      // Phase 4: Load artifacts from backend
      loadArtifacts: async (threadId: string, token?: string) => {
        try {
          const response = await getArtifacts(threadId, token);
          
          // Merge with existing artifacts (avoid duplicates)
          set((state) => {
            const existingIds = new Set(state.artifacts.map((a) => a.id));
            const newArtifacts = response.artifacts.filter(
              (a) => !existingIds.has(a.id)
            );
            
            // Convert backend format to store format
            const convertedArtifacts: AllArtifacts[] = newArtifacts.map((a) => ({
              id: a.id,
              type: a.type as ArtifactType,
              threadId: a.threadId,
              createdAt: a.createdAt,
              data: a.data,
            }));
            
            return {
              artifacts: [...state.artifacts, ...convertedArtifacts],
            };
          });
        } catch (error) {
          console.error('[artifactStore] Failed to load artifacts', error);
          // Don't throw - allow local-only operation
        }
      },

      // Delete artifact from backend and store
      removeArtifact: async (id: string, token?: string) => {
        try {
          await deleteArtifact(id, token);
          
          // Remove from store
          set((state) => {
            const updatedArtifacts = state.artifacts.filter((a) => a.id !== id);
            const updatedCurrent = state.current?.id === id ? null : state.current;
            
            return {
              artifacts: updatedArtifacts,
              current: updatedCurrent,
            };
          });

          // If UI store has this artifact selected, clear it
          const uiStore = useUIStore.getState();
          if (uiStore.currentArtifactId === id) {
            uiStore.setCurrentArtifact(null);
            uiStore.setSplitView(false);
          }

          // Log telemetry event
          logEvent({
            event: "artifact_deleted",
            artifactId: id,
            timestamp: Date.now(),
          });
        } catch (error) {
          console.error('[artifactStore] Failed to delete artifact', error);
          // Still remove from local store even if backend delete fails
          set((state) => {
            const updatedArtifacts = state.artifacts.filter((a) => a.id !== id);
            const updatedCurrent = state.current?.id === id ? null : state.current;
            
            return {
              artifacts: updatedArtifacts,
              current: updatedCurrent,
            };
          });
        }
      },
    }),
    {
      name: "artifact-storage",
      partialize: (state) => ({
        artifacts: state.artifacts,
        current: state.current,
      }),
    }
  )
);
