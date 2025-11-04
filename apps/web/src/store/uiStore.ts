import { create } from "zustand";
import { persist } from "zustand/middleware";

interface UIState {
  splitView: boolean;
  artifactPaneVisible: boolean;
  activeArtifactTab: "table" | "doc" | "sheet" | "preview" | null;
  artifactPaneWidth: number; // Percentage (0-100), default 50
  currentArtifactId: string | null;
  sidebarExpanded: boolean; // Track sidebar expansion state for layout calculations
  lastSplitCloseTs: number | null; // Timestamp when user manually closed split view
  autoScrollArtifacts: boolean; // Enable/disable auto-scroll when artifacts are selected
  inChatArtifactsEnabled: boolean; // Enable in-chat artifact rendering
  splitViewEnabled: boolean; // Enable split view (disabled for in-chat mode)

  // Actions
  setSplitView: (enabled: boolean) => void;
  toggleArtifactPane: () => void;
  setActiveArtifactTab: (tab: "table" | "doc" | "sheet" | "preview") => void;
  setArtifactPaneWidth: (width: number) => void;
  setCurrentArtifact: (artifactId: string | null) => void;
  setSidebarExpanded: (expanded: boolean) => void;
  openArtifactPane: (artifactId: string) => void; // Combined action
  setLastSplitCloseTs: (ts: number | null) => void; // Track manual close timestamp
  setAutoScrollArtifacts: (enabled: boolean) => void; // Enable/disable auto-scroll
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      splitView: false,
      artifactPaneVisible: false,
      activeArtifactTab: null,
      artifactPaneWidth: 50,
      currentArtifactId: null,
      sidebarExpanded: false,
      lastSplitCloseTs: null,
      autoScrollArtifacts: true,
      inChatArtifactsEnabled: true,
      splitViewEnabled: false,

      setSplitView: (enabled) => set({ splitView: enabled }),
      toggleArtifactPane: () =>
        set((state) => ({ artifactPaneVisible: !state.artifactPaneVisible })),
      setActiveArtifactTab: (tab) => set({ activeArtifactTab: tab }),
      setArtifactPaneWidth: (width) =>
        set({ artifactPaneWidth: Math.max(40, Math.min(60, width)) }),
      setCurrentArtifact: (artifactId) => set({ currentArtifactId: artifactId }),
      setSidebarExpanded: (expanded) => set({ sidebarExpanded: expanded }),
      // Combined action to atomically set artifact and open pane
      openArtifactPane: (artifactId) => set({ currentArtifactId: artifactId, splitView: true }),
      setLastSplitCloseTs: (ts) => set({ lastSplitCloseTs: ts }),
      setAutoScrollArtifacts: (enabled) => set({ autoScrollArtifacts: enabled }),
    }),
    {
      name: "ui-storage",
      partialize: (state) => ({
        splitView: state.splitView,
        artifactPaneWidth: state.artifactPaneWidth,
      }),
    }
  )
);
