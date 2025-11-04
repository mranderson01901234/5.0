import { useEffect, useRef } from "react";
import { useAuth } from "@clerk/clerk-react";
import { useChatStore } from "@/store/chatStore";
import { useArtifactStore } from "@/store/artifactStore";
import { getConversationMessages } from "@/services/gateway";
import { log } from "@/utils/logger";

/**
 * Hook to handle loading messages for a conversation thread
 * Prevents duplicate loads and handles race conditions
 */
export function useMessageLoading(currentThreadId: string | null) {
  const { getToken } = useAuth();
  const loadMessages = useChatStore(s => s.loadMessages);
  const loadArtifacts = useArtifactStore(s => s.loadArtifacts);
  
  // Use ref to track loading state outside React lifecycle
  const loadingRef = useRef<Set<string>>(new Set());
  
  // Load messages only when currentThreadId changes
  useEffect(() => {
    if (!currentThreadId) return;
    
    // Already loading this thread? Abort immediately
    if (loadingRef.current.has(currentThreadId)) {
      console.log('[useMessageLoading] Already loading thread, skipping:', currentThreadId);
      return;
    }
    
    // Get current state directly from store
    const state = useChatStore.getState();
    const conv = state.conversations.find(c => c.id === currentThreadId);
    
    // Skip if: doesn't exist, is local-only, or already has messages
    if (!conv || conv.isLocal || conv.messages.length > 0) {
      console.log('[useMessageLoading] Skipping load - conv:', !!conv, 'isLocal:', conv?.isLocal, 'hasMessages:', conv?.messages.length);
      return;
    }
    
    // Mark as loading IMMEDIATELY
    loadingRef.current.add(currentThreadId);
    console.log('[useMessageLoading] Starting load for thread:', currentThreadId);
    
    let mounted = true;
    
    async function load() {
      try {
        const token = await getToken();
        const messages = await getConversationMessages(currentThreadId, token || undefined);

        if (!mounted) {
          console.log('[useMessageLoading] Unmounted, aborting load:', currentThreadId);
          return;
        }

        // Final check: ensure we still need to load
        const currentState = useChatStore.getState();
        if (currentState.currentThreadId !== currentThreadId) {
          console.log('[useMessageLoading] Thread changed, aborting:', currentThreadId);
          return;
        }

        const currentConv = currentState.conversations.find(c => c.id === currentThreadId);
        console.log('[useMessageLoading] Current conv state:', {
          exists: !!currentConv,
          isLocal: currentConv?.isLocal,
          messagesCount: currentConv?.messages.length,
          messageIds: currentConv?.messages.map(m => m.id)
        });
        if (currentConv && currentConv.messages.length === 0 && !currentConv.isLocal) {
          console.log('[useMessageLoading] Calling loadMessages with', messages.length, 'messages');
          loadMessages(currentThreadId, messages);
        } else {
          console.log('[useMessageLoading] Messages already loaded, skipping:', currentThreadId);
        }

        // Load artifacts for this thread (consolidated - no duplicate loading)
        await useArtifactStore.getState().loadArtifacts(currentThreadId, token || undefined);
        console.log('[useMessageLoading] Loaded artifacts for thread:', currentThreadId);
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
        console.log('[useMessageLoading] Finished load for thread:', currentThreadId);
      }
    }
    
    load();
    
    return () => {
      mounted = false;
      loadingRef.current.delete(currentThreadId);
    };
  }, [currentThreadId, getToken, loadMessages]);
}

