import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Sidebar from "@/components/layout/Sidebar";
import TopBar from "@/components/layout/TopBar";
import CenterComposer from "@/components/home/CenterComposer";
import MessageList from "@/components/chat/MessageList";
import { useChatStore } from "@/store/chatStore";
import { useUIStore } from "@/store/uiStore";
import { useAuth } from "@clerk/clerk-react";
import { getConversations, getConversationMessages } from "@/services/gateway";
import PromptTester from "@/pages/PromptTester";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import MessageListFallback from "@/components/fallbacks/MessageListFallback";
import SidebarFallback from "@/components/fallbacks/SidebarFallback";
import { SplitContainer } from "@/components/SplitContainer";
import { ArtifactPane } from "@/components/ArtifactPane";
import { Divider } from "@/components/Divider";
import ArtifactPortal from "@/components/ArtifactPortal";
import { log } from "@/utils/logger";
import { logSplitViewToggled } from "@/lib/eventLogger";
import { useArtifactStore } from "@/store/artifactStore";
import useAutoOpenArtifact from "@/hooks/useAutoOpenArtifact";

// Helper selector to track conversation list changes for sidebar reset
const useSidebarResetKey = () =>
  useChatStore((s) => (s.conversations?.map?.((c) => c.id).join('|')) ?? 'empty');

/**
 * ChatPanel - Reusable chat panel component for both single and split view
 */
interface ChatPanelProps {
  hasMessages: boolean;
  currentThreadId: string;
  currentView: 'chat' | 'dashboard' | 'prompt-tester';
}

const ChatPanel: React.FC<ChatPanelProps> = ({ hasMessages, currentThreadId, currentView }) => {
  const splitView = useUIStore(s => s.splitView);
  const artifactPaneWidth = useUIStore(s => s.artifactPaneWidth);
  const sidebarExpanded = useUIStore(s => s.sidebarExpanded);
  
  // Track whether we should keep clipping (delays unclipping when sidebar closes)
  // When sidebar expands: clip immediately
  // When sidebar closes: keep clipping for 300ms (sidebar close animation duration), then unclip
  const [shouldClip, setShouldClip] = useState(false);
  
  useEffect(() => {
    if (sidebarExpanded) {
      // Sidebar is expanding - clip immediately
      setShouldClip(true);
    } else {
      // Sidebar is closing - wait 300ms for sidebar to close, then unclip
      const timer = setTimeout(() => {
        setShouldClip(false);
      }, 300); // Match sidebar close animation duration
      return () => clearTimeout(timer);
    }
  }, [sidebarExpanded]);
  
  // Calculate left position based on sidebar state
  // Sidebar: 64px collapsed, 280px expanded
  // Use left position (not padding) so the container background doesn't extend under sidebar
  const sidebarWidth = sidebarExpanded ? 280 : 64;
  
  return (
    <div className="flex-1 flex flex-col min-h-0">
      {!hasMessages ? (
        /* Welcome message when no messages */
        <div className="flex-1 flex items-center justify-center px-4 pb-[140px]">
          <div className="w-full max-w-[1024px]">
            <div className="mb-12 text-center">
              <h1 className="text-5xl font-semibold text-white/90 mb-6">
                What can I help with?
              </h1>
            </div>
            {/* Centered input on landing page */}
            <div className="w-full">
              <CenterComposer isLarge={true}/>
            </div>
          </div>
        </div>
      ) : (
        /* Chat view with messages - SCROLL CONTAINER */
        <div className="flex-1 overflow-y-auto chat-container min-h-0" style={{ paddingBottom: '200px' }}>
          {/* Fixed placeholder at 75px for next user message */}
          <div 
            className="fixed left-[48px] right-0 z-0 pointer-events-none"
            style={{ top: '75px' }}
            id="user-message-anchor"
          >
            <div className="max-w-[1024px] mx-auto px-4">
              {/* This is the anchor point where new user messages will appear */}
            </div>
          </div>
          <div className="max-w-[1024px] mx-auto px-4 pt-[75px] pb-[60px]">
            <ErrorBoundary
              FallbackComponent={MessageListFallback as any}
              resetKeys={[currentThreadId ?? 'default']}
              onError={(err) => {
                log.error('MessageList boundary error:', err);
              }}
            >
              <MessageList />
            </ErrorBoundary>
          </div>
        </div>
      )}
      {/* Footer input - Only visible when there are messages, fixed position - extends to bottom to block chat */}
      {currentView === 'chat' && hasMessages && (
        <div 
          className="fixed bottom-0 z-[50] chat-input-container"
          style={{ 
            left: '64px', // Always fixed at collapsed sidebar width - never changes
            right: splitView ? `${artifactPaneWidth}%` : '0',
            pointerEvents: 'none',
            // Use clip-path to hide the part that would overlap when sidebar expands
            // When expanding: clip immediately (shouldClip becomes true immediately)
            // When closing: keep clipping for 300ms while sidebar closes, then unclip (shouldClip becomes false after delay)
            // Add 2px buffer to ensure complete coverage
            clipPath: `inset(0 0 0 ${shouldClip ? 218 : 0}px)`, // 280 - 64 + 2 = 218px
            transition: 'clip-path 0ms', // No transition delay - instant clipping/unclipping based on shouldClip state
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end',
            paddingBottom: '16px',
            backgroundColor: '#0f0f0f'
          }}
        >
          {/* Overlay to match body::before grey effect */}
          <div 
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(255, 255, 255, 0.03)',
              pointerEvents: 'none'
            }}
          />
          <div 
            className="max-w-[1024px] w-full mx-auto px-4 relative" 
            style={{ 
              pointerEvents: 'auto',
              marginTop: '10px'
            }}
          >
            <CenterComposer isLarge={true}/>
          </div>
        </div>
      )}
    </div>
  );
};

export default function MainChatLayout() {
  const sidebarResetKey = useSidebarResetKey();
  const currentThreadId = useChatStore(s => s.currentThreadId);
  const currentView = useChatStore(s => s.currentView);
  const conversations = useChatStore(s => s.conversations);
  const loadConversations = useChatStore(s => s.loadConversations);
  const loadMessages = useChatStore(s => s.loadMessages);
  const currentConv = conversations.find(c => c.id === currentThreadId);
  const items = currentConv?.messages || [];
  const hasMessages = items.length > 0;
  const { getToken } = useAuth();
  const loadArtifacts = useArtifactStore(s => s.loadArtifacts);
  
  // Split view state
  const [searchParams, setSearchParams] = useSearchParams();
  const splitView = useUIStore(s => s.splitView);
  const artifactPaneWidth = useUIStore(s => s.artifactPaneWidth);
  const setSplitView = useUIStore(s => s.setSplitView);
  const currentArtifactId = useUIStore(s => s.currentArtifactId);
  const setLastSplitCloseTs = useUIStore(s => s.setLastSplitCloseTs);
  const artifacts = useArtifactStore(s => s.artifacts);
  
  // Wire auto-open hook
  useAutoOpenArtifact(currentThreadId);

  // Load conversations on mount
  useEffect(() => {
    let mounted = true;
    
    async function load() {
      try {
        const token = await getToken();
        const convs = await getConversations(token || undefined);
        if (!mounted) return;
        
        loadConversations(convs);
        
        // If we have conversations but no current thread, switch to first one
        // NOTE: Don't load messages here - let the second useEffect handle it
        // This prevents race conditions where both effects try to load messages
        if (convs.length > 0 && !currentThreadId) {
          const firstConv = convs[0];
          // Switch conversation - second useEffect will load messages
          useChatStore.getState().switchConversation(firstConv.id);
        }
      } catch (error) {
        log.error('Failed to load conversations:', error);
      }
    }
    
    // Only run if we don't have a current thread and haven't loaded yet
    if (!currentThreadId && conversations.length === 0) {
      load();
    }
    
    return () => {
      mounted = false;
    };
  }, [getToken, loadConversations]);

  // Handle URL query parameter for split view
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

  const setCurrentArtifact = useUIStore(s => s.setCurrentArtifact);
  const getLatestArtifactForThread = useArtifactStore(s => s.getLatestArtifactForThread);
  
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

  // BULLETPROOF FIX: Use ref to track loading state outside React lifecycle
  const loadingRef = useRef<Set<string>>(new Set());
  
  // Load messages only when currentThreadId changes
  useEffect(() => {
    if (!currentThreadId) return;
    
    // Already loading this thread? Abort immediately
    if (loadingRef.current.has(currentThreadId)) {
      console.log('[MainChatLayout] Already loading thread, skipping:', currentThreadId);
      return;
    }
    
    // Get current state directly from store
    const state = useChatStore.getState();
    const conv = state.conversations.find(c => c.id === currentThreadId);
    
    // Skip if: doesn't exist, is local-only, or already has messages
    if (!conv || conv.isLocal || conv.messages.length > 0) {
      console.log('[MainChatLayout] Skipping load - conv:', !!conv, 'isLocal:', conv?.isLocal, 'hasMessages:', conv?.messages.length);
      return;
    }
    
    // Mark as loading IMMEDIATELY
    loadingRef.current.add(currentThreadId);
    console.log('[MainChatLayout] Starting load for thread:', currentThreadId);
    
    let mounted = true;
    
    async function load() {
      try {
        const token = await getToken();
        const messages = await getConversationMessages(currentThreadId, token || undefined);

        if (!mounted) {
          console.log('[MainChatLayout] Unmounted, aborting load:', currentThreadId);
          return;
        }

        // Final check: ensure we still need to load
        const currentState = useChatStore.getState();
        if (currentState.currentThreadId !== currentThreadId) {
          console.log('[MainChatLayout] Thread changed, aborting:', currentThreadId);
          return;
        }

        const currentConv = currentState.conversations.find(c => c.id === currentThreadId);
        console.log('[MainChatLayout] Current conv state:', {
          exists: !!currentConv,
          isLocal: currentConv?.isLocal,
          messagesCount: currentConv?.messages.length,
          messageIds: currentConv?.messages.map(m => m.id)
        });
        if (currentConv && currentConv.messages.length === 0 && !currentConv.isLocal) {
          console.log('[MainChatLayout] Calling loadMessages with', messages.length, 'messages', 'API message IDs:', messages.map((m: any) => m.id));
          loadMessages(currentThreadId, messages);
        } else {
          console.log('[MainChatLayout] Messages already loaded, skipping:', currentThreadId, 'existing count:', currentConv?.messages.length);
        }

        // Load artifacts for this thread
        await useArtifactStore.getState().loadArtifacts(currentThreadId, token || undefined);
        console.log('[MainChatLayout] Loaded artifacts for thread:', currentThreadId);
      } catch (error: any) {
        if (!mounted) return;
        
        if (error?.isNotFound || error?.message?.includes('404') || error?.message?.includes('HTTP 404')) {
          log.debug('Conversation not found, clearing currentThreadId');
          useChatStore.getState().switchConversation('');
        } else {
          log.error('Failed to load messages:', error);
        }
      } finally {
        loadingRef.current.delete(currentThreadId);
        console.log('[MainChatLayout] Finished load for thread:', currentThreadId);
      }
    }
    
    load();
    
    return () => {
      mounted = false;
      loadingRef.current.delete(currentThreadId);
    };
  }, [currentThreadId, getToken, loadMessages]);

  // Phase 4: Load artifacts when thread changes
  useEffect(() => {
    if (!currentThreadId) return;
    
    let mounted = true;
    
    async function load() {
      try {
        const token = await getToken();
        if (mounted && token) {
          await loadArtifacts(currentThreadId, token);
        }
      } catch (error) {
        log.error('Failed to load artifacts:', error);
      }
    }
    
    load();
    
    return () => {
      mounted = false;
    };
  }, [currentThreadId, getToken, loadArtifacts]);

  return (
    <div className="min-h-screen flex flex-col">
      <a href="#main" className="skip-link">
        Skip to main content
      </a>
      <ErrorBoundary
        FallbackComponent={SidebarFallback as any}
        resetKeys={[sidebarResetKey]}
        onError={(err) => {
          log.error('Sidebar boundary error:', err);
        }}
      >
        <Sidebar/>
      </ErrorBoundary>
      <TopBar/>
      <main id="main" className={`pl-[48px] pt-16 flex-1 flex flex-col min-h-0 ${splitView ? 'overflow-hidden' : 'overflow-y-auto'}`} tabIndex={-1} style={{ height: 'calc(100vh - 64px)', position: 'relative' }}>
        {currentView === 'prompt-tester' ? (
          <div className="flex-1 overflow-y-auto">
            <PromptTester />
          </div>
        ) : splitView ? (
          /* SPLIT VIEW DISABLED - Show artifact inline in chat instead */
          <ChatPanel
            hasMessages={hasMessages}
            currentThreadId={currentThreadId}
            currentView={currentView}
          />
        ) : !hasMessages ? (
          /* Welcome message when no messages */
          <div className="flex-1 flex items-center justify-center px-4">
            <div className="w-full max-w-[1024px]">
              <div className="mb-12 text-center">
                <h1 className="text-5xl font-semibold text-white/90 mb-6">
                  What can I help with?
                </h1>
              </div>
              {/* Centered input on landing page */}
              <div className="w-full">
                <CenterComposer isLarge={true}/>
              </div>
            </div>
          </div>
        ) : (
          /* Chat view with messages - ChatPanel fills main directly */
          <ChatPanel
            hasMessages={hasMessages}
            currentThreadId={currentThreadId}
            currentView={currentView}
          />
        )}
      </main>
    </div>
  );
}


