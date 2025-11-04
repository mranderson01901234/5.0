import React, { useState, useEffect } from "react";
import CenterComposer from "@/components/home/CenterComposer";
import MessageList from "@/components/chat/MessageList";
import { useUIStore } from "@/store/uiStore";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import MessageListFallback from "@/components/fallbacks/MessageListFallback";
import { log } from "@/utils/logger";

/**
 * ChatPanel - Reusable chat panel component for both single and split view
 */
interface ChatPanelProps {
  hasMessages: boolean;
  currentThreadId: string;
  currentView: 'chat' | 'dashboard' | 'prompt-tester';
}

export const ChatPanel: React.FC<ChatPanelProps> = ({ hasMessages, currentThreadId, currentView }) => {
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
              <h1 className="text-3xl font-medium mb-6 tracking-tight">
                <span className="text-white/60">Opera Studio</span> <span className="text-white/40">·</span> <span style={{ color: 'rgba(255, 254, 210, 0.95)' }}>Adaptive intelligence with built-in memory.</span>
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
            backgroundColor: '#0a0a0a'
          }}
        >
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

