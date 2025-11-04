import { useEffect } from "react";
import Sidebar from "@/components/layout/Sidebar";
import TopBar from "@/components/layout/TopBar";
import CenterComposer from "@/components/home/CenterComposer";
import MessageList from "@/components/chat/MessageList";
import { useChatStore } from "@/store/chatStore";
import { useAuth } from "@clerk/clerk-react";
import { getConversations, getConversationMessages } from "@/services/gateway";
import PromptTester from "@/pages/PromptTester";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import MessageListFallback from "@/components/fallbacks/MessageListFallback";
import SidebarFallback from "@/components/fallbacks/SidebarFallback";
import { log } from "@/utils/logger";

// Helper selector to track conversation list changes for sidebar reset
const useSidebarResetKey = () =>
  useChatStore((s) => (s.conversations?.map?.((c) => c.id).join('|')) ?? 'empty');

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

  // Load conversations on mount
  useEffect(() => {
    let mounted = true;
    
    async function load() {
      try {
        const token = await getToken();
        const convs = await getConversations(token || undefined);
        if (!mounted) return;
        
        loadConversations(convs);
        
        // If we have conversations but no current thread, switch to first one and load messages
        if (convs.length > 0 && !currentThreadId) {
          const firstConv = convs[0];
          // Switch conversation first
          useChatStore.getState().switchConversation(firstConv.id);
          // Load messages for the first conversation
          try {
            const messages = await getConversationMessages(firstConv.id, token || undefined);
            if (mounted) {
              loadMessages(firstConv.id, messages);
            }
          } catch (error: any) {
            // If conversation doesn't exist (404), clear and try next or stay empty - don't log as error
            if (error?.isNotFound || error?.message?.includes('404') || error?.message?.includes('HTTP 404')) {
              if (mounted) {
                log.debug('First conversation not found, clearing currentThreadId');
                useChatStore.getState().switchConversation('');
              }
            } else {
              log.error('Failed to load first conversation messages:', error);
            }
          }
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
  }, [getToken, loadConversations, loadMessages]);

  // Load messages when switching to a conversation that doesn't have them yet
  useEffect(() => {
    if (!currentThreadId) return;
    
    const conv = conversations.find(c => c.id === currentThreadId);
    // Skip if: already loaded, doesn't exist, or is a local-only conversation (not on server yet)
    if (!conv || conv.messages.length > 0 || conv.isLocal) return;
    
    let mounted = true;
    
    async function load() {
      try {
        const token = await getToken();
        const messages = await getConversationMessages(currentThreadId, token || undefined);
        if (mounted) {
          // Double-check that messages still haven't been loaded (race condition protection)
          // This prevents duplicate loads if this effect runs multiple times or concurrently
          const currentConv = useChatStore.getState().conversations.find(c => c.id === currentThreadId);
          if (currentConv && currentConv.messages.length === 0 && !currentConv.isLocal) {
            loadMessages(currentThreadId, messages);
          }
        }
      } catch (error: any) {
        // If conversation doesn't exist (404), silently clear it - don't log as error
        if (error?.isNotFound || error?.message?.includes('404') || error?.message?.includes('HTTP 404')) {
          if (mounted) {
            log.debug('Conversation not found, clearing currentThreadId');
            useChatStore.getState().switchConversation('');
          }
        } else {
          // Only log non-404 errors
          log.error('Failed to load messages:', error);
        }
      }
    }
    
    load();
    
    return () => {
      mounted = false;
    };
  }, [currentThreadId, conversations, getToken, loadMessages]);

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
      <main id="main" className="pl-[48px] pt-16 flex-1 flex flex-col" tabIndex={-1}>
        {currentView === 'prompt-tester' ? (
          <div className="flex-1 overflow-y-auto">
            <PromptTester />
          </div>
        ) : !hasMessages ? (
          /* Welcome message when no messages */
          <div className="flex-1 flex items-center justify-center px-4">
            <div className="w-full max-w-[1024px]">
              <div className="mb-8 text-center">
                <h1 className="text-3xl font-semibold text-white/90 mb-2">
                  What can I help with?
                </h1>
              </div>
              {/* Centered input on landing page */}
              <div className="w-full">
                <CenterComposer/>
              </div>
            </div>
          </div>
        ) : (
          /* Chat view with messages */
          <div className="flex-1 overflow-y-auto chat-container relative">
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
        {/* Footer input - only visible when messages exist and in chat view */}
        {hasMessages && currentView === 'chat' && (
          <div className="sticky bottom-0 z-10">
            <div className="max-w-[1024px] mx-auto px-4 py-4">
              <CenterComposer/>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

