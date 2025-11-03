import { useChatStore } from "../store/chatStore";
import { streamChat } from "../services/gateway";
import { nanoid } from "../lib/id";
import { useAuth } from "@clerk/clerk-react";
import { handleApiError } from '@/utils/handleApiError';
import { log } from '@/utils/logger';
import type { ApiMessage } from '@/types/api';

export type StreamEvent =
  | { type: 'open' }
  | { type: 'message'; data: ApiMessage }
  | { type: 'error'; error: string }
  | { type: 'done' }
  | { type: 'delta'; data: string | { text?: string } }
  | { type: 'preface'; data: string | { text?: string } }
  | { type: 'research_thinking' }
  | { type: 'ingestion_context'; data?: { items?: unknown[] } }
  | { type: 'research_summary'; data: string | { summary?: string; text?: string } | null }
  | { type: 'sources'; data: Array<{ title: string; host: string; url?: string; date?: string }> | null };

function generateTitle(msg: string): string {
  if(!msg.trim()) return "New Chat";
  const text = msg.trim();
  const preview = text.slice(0, 50);
  return preview.length < text.length ? preview + "..." : preview;
}

export function useChatStream(){
  const { getToken } = useAuth();
  
  return {
    async send(text:string){
      if(!text.trim()) return;
      
      const state = useChatStore.getState();
      const conversations = state.conversations;
      let currentThreadId = state.currentThreadId;
      let currentConv = conversations.find(c => c.id === currentThreadId);
      let items = currentConv?.messages || [];

      if(state.activeStreams>=2) { log.warn("stream cap reached"); return; }

      // Create new conversation ONLY if we don't have a currentThreadId at all
      // Don't create if we have a threadId but empty messages (user already clicked "New Chat")
      if(!currentThreadId) {
        state.newConversation();
        // Re-fetch after creating new conversation
        const newState = useChatStore.getState();
        currentThreadId = newState.currentThreadId;
        currentConv = newState.conversations.find(c => c.id === currentThreadId);
        items = currentConv?.messages || [];
      }

      const newThreadId = currentThreadId;
      const newItems = items;
      
      // Mark conversation as no longer local-only once we send first message
      const currentState = useChatStore.getState();
      const currentConvForLocal = currentState.conversations.find(c => c.id === newThreadId);
      if (currentConvForLocal?.isLocal) {
        // Clear isLocal flag - conversation will exist on server after first message
        useChatStore.setState({
          conversations: currentState.conversations.map(c =>
            c.id === newThreadId ? { ...c, isLocal: false } : c
          ),
        });
      }
      
      const user = { id:nanoid(), role:"user" as const, content:text };
      
      // Auto-generate title from first user message
      if(newItems.length === 0) {
        const title = generateTitle(text);
        const currentState = useChatStore.getState();
        const updatedConvs = currentState.conversations.map(c => 
          c.id === newThreadId ? { ...c, title } : c
        );
        useChatStore.setState({ conversations: updatedConvs });
      }
      
      state.add(user);
      const assistant = { id:nanoid(), role:"assistant" as const, content:"" };
      state.add(assistant);
      state.start();
      const t0 = performance.now();
      state.setTTFB(undefined);
      
      log.info('[useChatStream] Started stream', { 
        threadId: newThreadId, 
        assistantId: assistant.id,
        userMessage: text.substring(0, 50)
      });
      try {
        const token = await getToken();
        const currentState = useChatStore.getState();
        const lastK = currentState.conversations.find(c => c.id === newThreadId)?.messages.slice(-10) || [];
        const { firstAtGetter, stream } = await streamChat({ threadId: newThreadId, messages: lastK.concat(user) }, token || undefined);
        let gotPrimary=false;
        let hasResearchSummary = false;
        
        for await (const {ev,data} of stream){
          if(ev==="preface"){
            if(performance.now()-t0>400 && !gotPrimary){ 
              const text = typeof data === 'string' ? data : (data?.text || "Working on it…");
              state.setFRChip(text); 
            }
          } else if(ev==="research_thinking"){
            // Research has started - show thinking indicator
            state.setResearchThinking(true);
            state.setResearchSummary(undefined);
          } else if(ev==="ingestion_context"){
            // Ingested context from knowledge base - this is passed to LLM as context, not displayed directly
            // The LLM will synthesize this information naturally into its response
            log.debug('[useChatStream] ingestion_context event received (LLM will synthesize)', { ev, itemsCount: data?.items?.length || 0 });
            // Do NOT add to message content - the backend already includes this in the LLM context
            // The LLM will naturally integrate this information into its conversational response
          } else if(ev==="research_summary"){
            // Web search results arrived - insert as natural message
            log.debug('[useChatStream] research_summary event received', { ev, data, dataType: typeof data });
            
            // Handle both object and string data formats
            let summary: string | null = null;
            if (data && typeof data === 'object' && data.summary) {
              summary = data.summary;
            } else if (data && typeof data === 'string' && data.trim().length > 0) {
              // Try parsing as JSON string
              try {
                const parsed = JSON.parse(data);
                summary = parsed.summary || data;
              } catch {
                summary = data;
              }
            } else if (data && typeof data === 'object') {
              // Data is object but might have summary in different format
              const dataObj = data as { summary?: string; text?: string };
              summary = dataObj.summary || dataObj.text || null;
            }
            
            if (summary && summary.trim().length > 0) {
              log.debug('[useChatStream] Injecting research summary:', summary.substring(0, 100));
              const currentMsgs = useChatStore.getState().conversations.find(c => c.id === newThreadId)?.messages || [];
              const lastMsg = currentMsgs[currentMsgs.length - 1];
              if(lastMsg && lastMsg.role === "assistant") {
                // Replace empty assistant message with web search summary
                state.patchAssistant(summary);
                hasResearchSummary = true;
                state.setResearchThinking(false);
              } else {
                log.warn('[useChatStream] No assistant message found to inject research summary');
              }
            } else {
              log.warn('[useChatStream] research_summary event received but no valid summary found', { data, dataType: typeof data });
            }
          } else if(ev==="delta"){
            if(!gotPrimary){
              const firstAt = firstAtGetter();
              if(firstAt) {
                const ttfbMs = firstAt - t0;
                state.setTTFB(ttfbMs);
                const frChip = useChatStore.getState().frChip;
                if(ttfbMs > 400 && frChip){
                  // Keep FR chip visible
                } else {
                  state.setFRChip(undefined);
                }
              }
              gotPrimary=true;
            } else {
              state.setFRChip(undefined);
            }
            const currentMsgs = useChatStore.getState().conversations.find(c => c.id === newThreadId)?.messages || [];
            const lastMsg = currentMsgs[currentMsgs.length - 1];
            const deltaText = typeof data === 'string' ? data : (data?.text || data || "");
            const currentContent = lastMsg?.content || "";
            
            // Append delta naturally - no hard separators needed
            // If there's existing content (from web search or ingestion context), the LLM should continue naturally
            // or we append with a simple newline for natural flow
            const separator = (hasResearchSummary && currentContent && currentContent.trim()) ? "\n\n" : "";
            
            // Simple delta append - all formatting comes from LLM
            state.patchAssistant(currentContent + separator + deltaText);
            
            // Reset flag after first delta
            if (hasResearchSummary) {
              hasResearchSummary = false;
            }
          } else if(ev==="error"){
            // Handle error events from the stream
            let errorMsg = "An error occurred";
            if (typeof data === 'string') {
              errorMsg = data;
            } else if (data && typeof data === 'object') {
              // Extract error from nested structure
              if (data.error) {
                errorMsg = typeof data.error === 'string' ? data.error : JSON.stringify(data.error);
              } else if (data.message) {
                errorMsg = data.message;
              } else {
                errorMsg = JSON.stringify(data);
              }
            }
            const currentMsgs = useChatStore.getState().conversations.find(c => c.id === newThreadId)?.messages || [];
            const lastMsg = currentMsgs[currentMsgs.length - 1];
            if(lastMsg && lastMsg.role === "assistant") {
              // Ensure we have a non-empty error message
              const displayError = errorMsg.trim() || "An error occurred";
              state.patchAssistant(`Error: ${displayError}`);
            } else {
              // If no assistant message exists, add one with the error
              state.add({ id: nanoid(), role: "assistant", content: `Error: ${errorMsg.trim() || "An error occurred"}` });
            }
            break;
          } else if(ev==="slow_start"){
            // optional: could show a subtle indicator; no UI beyond chip
          } else if(ev==="sources"){
            // Handle sources event - add sources to the assistant message
            log.debug('[useChatStream] sources event received', { ev, data, dataType: typeof data });
            
            let sources: Array<{ title: string; host: string; url?: string; date?: string }> | null = null;
            
            if (data && typeof data === 'object' && data.sources) {
              sources = data.sources;
            } else if (data && typeof data === 'string') {
              try {
                const parsed = JSON.parse(data);
                sources = parsed.sources || null;
              } catch {
                log.warn('[useChatStream] Failed to parse sources data as JSON');
              }
            }
            
            if (sources && Array.isArray(sources) && sources.length > 0) {
              log.debug('[useChatStream] Injecting sources:', sources.length, sources);
              const currentMsgs = useChatStore.getState().conversations.find(c => c.id === newThreadId)?.messages || [];
              const lastMsg = currentMsgs[currentMsgs.length - 1];
              if(lastMsg && lastMsg.role === "assistant") {
                state.patchAssistant(lastMsg.content, sources);
              } else {
                log.warn('[useChatStream] No assistant message found to attach sources');
              }
            } else {
              log.warn('[useChatStream] sources event received but no valid sources found', { data, dataType: typeof data });
            }
          } else if(ev==="done"){ break; }
        }
      } catch (err: unknown) {
        handleApiError(err, {
          action: 'sending message',
          fallbackMessage: 'Failed to send message.',
        });
      } finally {
        state.end();
      }
    }
  };
}

