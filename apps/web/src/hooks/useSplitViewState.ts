import { useEffect, useRef, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useUIStore } from "@/store/uiStore";
import { useArtifactStore } from "@/store/artifactStore";
import { logSplitViewToggled } from "@/lib/eventLogger";

/**
 * Hook to manage split view state with URL synchronization
 * Handles URL query parameter sync, keyboard shortcuts, and auto-close logic
 */
export function useSplitViewState(currentThreadId: string | null) {
  const [searchParams, setSearchParams] = useSearchParams();
  const splitView = useUIStore(s => s.splitView);
  const setSplitView = useUIStore(s => s.setSplitView);
  const currentArtifactId = useUIStore(s => s.currentArtifactId);
  const setCurrentArtifact = useUIStore(s => s.setCurrentArtifact);
  const setLastSplitCloseTs = useUIStore(s => s.setLastSplitCloseTs);
  
  // Subscribe to artifacts array - Zustand already handles shallow comparison
  const artifacts = useArtifactStore(s => s.artifacts);
  const getLatestArtifactForThread = useArtifactStore(s => s.getLatestArtifactForThread);
  
  // Use a ref to prevent feedback loops between URL and state
  const isUpdatingRef = useRef(false);
  const lastArtifactCreateRef = useRef<number>(0);
  const lastManualOpenRef = useRef<number>(0);
  
  // Track recent artifact creation
  useEffect(() => {
    if (currentArtifactId && artifacts.length > 0) {
      const artifact = artifacts.find(a => a.id === currentArtifactId);
      if (artifact && artifact.createdAt) {
        const now = Date.now();
        const age = now - artifact.createdAt;
        // If artifact was created in last 2 seconds, mark it
        if (age < 2000) {
          lastArtifactCreateRef.current = artifact.createdAt;
        }
      }
    }
  }, [currentArtifactId, artifacts]);
  
  // Handle URL query parameter for split view
  useEffect(() => {
    // Skip if we're in the middle of updating (prevent feedback loop)
    if (isUpdatingRef.current) return;
    
    const viewParam = searchParams.get("view");
    const now = Date.now();
    const recentArtifactCreated = lastArtifactCreateRef.current > 0 && 
      (now - lastArtifactCreateRef.current) < 2000;
    
    // Sync URL -> State: If URL says "split" but state says false, update state
    if (viewParam === "split" && !splitView) {
      isUpdatingRef.current = true;
      setSplitView(true);
      logSplitViewToggled(true);
      // Reset flag after state update
      setTimeout(() => { isUpdatingRef.current = false; }, 0);
    } 
    // Sync URL -> State: If URL says "chat" but state says true, update state
    // BUT: Don't force-close if artifact was just created (precedence: recent creation > URL)
    else if (viewParam === "chat" && splitView) {
      if (recentArtifactCreated) {
        // Recent artifact creation takes precedence - update URL to match state
        isUpdatingRef.current = true;
        setSearchParams({ view: "split" }, { replace: true });
        setTimeout(() => { isUpdatingRef.current = false; }, 200);
      } else {
        isUpdatingRef.current = true;
        setSplitView(false);
        logSplitViewToggled(false);
        setTimeout(() => { isUpdatingRef.current = false; }, 200);
      }
    }
    // Sync State -> URL: If state is true but URL doesn't say "split", update URL
    else if (splitView && viewParam !== "split") {
      isUpdatingRef.current = true;
      setSearchParams({ view: "split" }, { replace: true });
      setTimeout(() => { isUpdatingRef.current = false; }, 0);
    }
    // Sync State -> URL: If state is false but URL says "split", update URL
    else if (!splitView && viewParam === "split") {
      isUpdatingRef.current = true;
      setSearchParams({ view: "chat" }, { replace: true });
      setTimeout(() => { isUpdatingRef.current = false; }, 0);
    }
  }, [searchParams, splitView, setSplitView, setSearchParams]);
  
  // Keyboard shortcut: Ctrl + Alt + S to toggle split view
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.altKey && e.key === "s") {
        e.preventDefault();
        const currentState = useUIStore.getState();
        const newState = !currentState.splitView;
        
        isUpdatingRef.current = true;
        setSplitView(newState);
        setSearchParams({ view: newState ? "split" : "chat" }, { replace: true });
        logSplitViewToggled(newState);
        
        if (newState) {
          // Opening split view
          lastManualOpenRef.current = Date.now();
          if (currentThreadId) {
            const latestArtifact = getLatestArtifactForThread(currentThreadId);
            if (latestArtifact) {
              // Set the latest artifact
              setCurrentArtifact(latestArtifact.id);
            } else {
              // No artifacts - but still open the pane (user might want to see empty state)
              // Clear any previous artifact selection
              setCurrentArtifact(null);
            }
          }
        } else {
          // Closing split view
          setCurrentArtifact(null);
          setLastSplitCloseTs(Date.now());
        }
        
        setTimeout(() => { isUpdatingRef.current = false; }, 200);
      }
      // Escape key to close artifact pane
      if (e.key === "Escape" && splitView) {
        e.preventDefault();
        isUpdatingRef.current = true;
        setCurrentArtifact(null);
        setSplitView(false);
        setSearchParams({ view: "chat" }, { replace: true });
        logSplitViewToggled(false);
        setLastSplitCloseTs(Date.now());
        setTimeout(() => { isUpdatingRef.current = false; }, 200);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [splitView, setSplitView, setSearchParams, setLastSplitCloseTs, currentThreadId, getLatestArtifactForThread, setCurrentArtifact]);
  
  // Auto-close split view when there's no current artifact
  // Only close if there are genuinely no artifacts for the current thread
  // Don't auto-close if user just manually opened it (within last 2 seconds)
  useEffect(() => {
    if (splitView && !currentArtifactId && currentThreadId) {
      // Skip if we're in the middle of a manual update
      if (isUpdatingRef.current) return;
      
      // Check if user manually opened recently (within last 2 seconds)
      const now = Date.now();
      const recentManualOpen = lastManualOpenRef.current > 0 && 
        (now - lastManualOpenRef.current) < 2000;
      if (recentManualOpen) return; // Don't auto-close if user just manually opened
      
      // Only auto-close if there are no artifacts for this thread
      // Add a delay longer than the guard period to prevent premature closing
      const timer = setTimeout(() => {
        // Double-check that we still don't have an artifact before closing
        const currentState = useUIStore.getState();
        // Skip if manual update is in progress (guard period is 200ms)
        if (isUpdatingRef.current) return;
        
        // Check again if user manually opened recently
        const checkNow = Date.now();
        const stillRecentManualOpen = lastManualOpenRef.current > 0 && 
          (checkNow - lastManualOpenRef.current) < 2000;
        if (stillRecentManualOpen) return;
        
        const currentArtifacts = useArtifactStore.getState().artifacts;
        const currentThreadArtifacts = currentArtifacts.filter(a => a.threadId === currentThreadId);
        
        // Only auto-close if there are no artifacts and user didn't manually open
        if (currentState.splitView && !currentState.currentArtifactId && currentThreadArtifacts.length === 0) {
          isUpdatingRef.current = true;
          setSplitView(false);
          setSearchParams({ view: "chat" }, { replace: true });
          logSplitViewToggled(false);
          setTimeout(() => { isUpdatingRef.current = false; }, 200);
        }
      }, 300); // Delay longer than guard period (200ms) to ensure manual opens aren't auto-closed
      
      return () => clearTimeout(timer);
    }
  }, [splitView, currentArtifactId, currentThreadId, artifacts, setSplitView, setSearchParams]);
  
  return {
    splitView,
    setSplitView,
    currentArtifactId,
    setCurrentArtifact,
  };
}

