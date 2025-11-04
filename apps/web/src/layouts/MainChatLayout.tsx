import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Sidebar from "@/components/layout/Sidebar";
import TopBar from "@/components/layout/TopBar";
import CenterComposer from "@/components/home/CenterComposer";
import { useChatStore } from "@/store/chatStore";
import { useUIStore } from "@/store/uiStore";
import { useAuth } from "@clerk/clerk-react";
import { getConversations } from "@/services/gateway";
import PromptTester from "@/pages/PromptTester";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import SidebarFallback from "@/components/fallbacks/SidebarFallback";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { log } from "@/utils/logger";
import useAutoOpenArtifact from "@/hooks/useAutoOpenArtifact";
import { useSplitViewState } from "@/hooks/useSplitViewState";
import { useMessageLoading } from "@/hooks/useMessageLoading";
import { useArtifactStoreSync } from "@/hooks/useArtifactStoreSync";

// Helper selector to track conversation list changes for sidebar reset
const useSidebarResetKey = () =>
  useChatStore((s) => (s.conversations?.map?.((c) => c.id).join('|')) ?? 'empty');

export default function MainChatLayout() {
  const sidebarResetKey = useSidebarResetKey();
  const currentThreadId = useChatStore(s => s.currentThreadId);
  const currentView = useChatStore(s => s.currentView);
  const conversations = useChatStore(s => s.conversations);
  const loadConversations = useChatStore(s => s.loadConversations);
  const currentConv = conversations.find(c => c.id === currentThreadId);
  const items = currentConv?.messages || [];
  const hasMessages = items.length > 0;
  const { getToken } = useAuth();
  
  // Wire auto-open hook
  useAutoOpenArtifact(currentThreadId);
  
  // Sync artifact store events with UI store (decouples stores)
  useArtifactStoreSync();
  
  // Use extracted hooks
  const { splitView } = useSplitViewState(currentThreadId);
  useMessageLoading(currentThreadId);

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
        if (convs.length > 0 && !currentThreadId) {
          const firstConv = convs[0];
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


