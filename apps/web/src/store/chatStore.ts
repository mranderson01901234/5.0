import { create } from "zustand";

type FileAttachment = {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  url?: string;
};

type Msg = {
  id:string;
  role:"user"|"assistant"|"system";
  content:string;
  sources?: Array<{ title: string; host: string; url?: string; date?: string }>;
  attachments?: FileAttachment[];
};

type ThinkingStep = {
  id: string;
  content: string;
  timestamp: number;
};

type Conversation = {
  id: string;
  title: string;
  messages: Msg[];
  updatedAt: number;
  isLocal?: boolean; // true if created client-side and not yet on server
};

type View = 'chat' | 'dashboard' | 'prompt-tester';

type State = {
  conversations: Conversation[];
  currentThreadId: string;
  streaming: boolean;
  activeStreams: number;
  frChip?: string;
  ttfbMs?: number;
  researchThinking?: boolean;
  researchSummary?: string;
  thinkingSteps: ThinkingStep[];
  currentView: View;
  messageLoadTracker: Map<string, { messageIds: Set<string>; timestamp: number }>;

  // Actions
  add(m:Msg):void;
  patchAssistant(text:string, sources?: Array<{ title: string; host: string; url?: string; date?: string }>):void;
  updateMessageContent(messageId: string, content: string):void;
  setFRChip(s?:string):void;
  setTTFB(ms?:number):void;
  setResearchThinking(thinking:boolean):void;
  setResearchSummary(summary?:string):void;
  addThinkingStep(content: string):void;
  updateLastThinkingStep(content: string):void;
  clearThinkingSteps():void;
  start():void;
  end():void;
  newConversation():void;
  switchConversation(threadId:string):void;
  deleteConversation(threadId:string):void;
  loadConversations(convs: Array<{id: string; title: string; updatedAt: number}>):void;
  loadMessages(threadId: string, msgs: Array<{id: string; role: string; content: string}>):void;
  setView(view: View): void;
};

export const useChatStore = create<State>((set, get)=>({
  conversations: [],
  currentThreadId: "",
  streaming: false,
  activeStreams: 0,
  thinkingSteps: [],
  currentView: 'chat',
  messageLoadTracker: new Map<string, { messageIds: Set<string>; timestamp: number }>(),
  
  add: (m) => set((s) => {
    const conv = s.conversations.find(c => c.id === s.currentThreadId);
    if(!conv) return s;
    
    // Check for duplicate - don't add if message with same ID already exists
    const isDuplicate = conv.messages.some(msg => msg.id === m.id);
    if(isDuplicate) return s;
    
    // Generate title from first user message
    let newTitle = conv.title;
    const hasUserMessages = conv.messages.some(msg => msg.role === "user");
    if(!hasUserMessages && m.role === "user" && m.content.trim()) {
      const text = m.content.trim();
      const preview = text.slice(0, 50);
      newTitle = preview.length < text.length ? preview + "..." : preview;
    }
    
    const updatedConvs = s.conversations.map(c => 
      c.id === conv.id 
        ? { ...c, messages: [...c.messages, m], title: newTitle, updatedAt: Date.now() }
        : c
    );
    
    return { conversations: updatedConvs };
  }),
  
  patchAssistant: (t, sources?) => set((s) => {
    const conv = s.conversations.find(c => c.id === s.currentThreadId);
    if(!conv) return s;
    
    const messages = [...conv.messages];
    const lastIdx = messages.length - 1;
    if(lastIdx >= 0 && lastIdx < messages.length && messages[lastIdx] && messages[lastIdx].role === "assistant") {
      const lastMsg = messages[lastIdx];
      if (lastMsg) {
        const finalSources = sources ?? lastMsg.sources;
        messages[lastIdx] = finalSources 
          ? { ...lastMsg, content: t, sources: finalSources }
          : { ...lastMsg, content: t };
      }
    }
    
    const updatedConvs = s.conversations.map(c => 
      c.id === conv.id ? { ...c, messages } : c
    );
    
    return { conversations: updatedConvs };
  }),
  
  updateMessageContent: (messageId, content) => set((s) => {
    const conv = s.conversations.find(c => c.id === s.currentThreadId);
    if(!conv) return s;
    
    const messages = conv.messages.map(m => 
      m.id === messageId ? { ...m, content: m.content + content } : m
    );
    
    const updatedConvs = s.conversations.map(c => 
      c.id === conv.id ? { ...c, messages } : c
    );
    
    return { conversations: updatedConvs };
  }),
  
  setFRChip: (s) => set(s !== undefined ? { frChip: s } : {}),
  setTTFB: (ms) => set(ms !== undefined ? { ttfbMs: ms } : {}),
  setResearchThinking: (thinking) => set({ researchThinking: thinking }),
  setResearchSummary: (summary) => set(summary !== undefined ? { researchSummary: summary } : {}),

  addThinkingStep: (content) => set((s) => ({
    thinkingSteps: [...s.thinkingSteps, { id: `step-${Date.now()}`, content, timestamp: Date.now() }]
  })),

  updateLastThinkingStep: (content) => set((s) => {
    if (s.thinkingSteps.length === 0) return s;
    const steps = [...s.thinkingSteps];
    const lastStep = steps[steps.length - 1];
    if (!lastStep) return s;
    steps[steps.length - 1] = { id: lastStep.id, content, timestamp: lastStep.timestamp };
    return { thinkingSteps: steps };
  }),

  clearThinkingSteps: () => set({ thinkingSteps: [] }),

  start: () => set((s) => ({ streaming: true, activeStreams: s.activeStreams + 1 })),
  end: () => set((s) => ({
    streaming: false,
    activeStreams: Math.max(0, s.activeStreams - 1),
    researchThinking: false,
    thinkingSteps: []
  })),
  
  newConversation: () => {
    const newId = `thread_${Date.now()}`;
    const newConv: Conversation = {
      id: newId,
      title: "New Chat",
      messages: [],
      updatedAt: Date.now(),
      isLocal: true, // Mark as local-only until first message is sent
    };
    set((s) => ({
      conversations: [newConv, ...s.conversations],
      currentThreadId: newId,
    }));
  },
  
  switchConversation: (threadId: string) => {
    set({ currentThreadId: threadId });
  },
  
  deleteConversation: (threadId: string) => {
    set((s) => {
      const filtered = s.conversations.filter(c => c.id !== threadId);
      const newCurrentId = s.currentThreadId === threadId 
        ? (filtered[0]?.id || "")
        : s.currentThreadId;
      return {
        conversations: filtered,
        currentThreadId: newCurrentId,
      };
    });
  },
  
  loadConversations: (convs) => {
    set((s) => {
      // PRESERVE existing messages when loading conversations
      // This prevents clearing messages that were already loaded
      const existingConvs = new Map(s.conversations.map(c => [c.id, c]));
      
      return {
        conversations: convs.map(c => {
          const existing = existingConvs.get(c.id);
          // If conversation exists and has messages, preserve them
          if (existing && existing.messages.length > 0) {
            return {
              ...existing,
              title: c.title, // Update title if it changed
              updatedAt: c.updatedAt,
            };
          }
          // New conversation - start with empty messages
          return {
            id: c.id,
            title: c.title,
            messages: [],
            updatedAt: c.updatedAt,
          };
        }),
      };
    });
  },
  
  loadMessages: (threadId, msgs) => {
    // Normalize IDs to strings for comparison (backend might return numbers)
    const normalizeId = (id: string | number): string => String(id);
    const normalizedIncoming = msgs.map(m => ({ ...m, id: normalizeId(m.id) }));
    const incomingIds = new Set(normalizedIncoming.map(m => m.id));
    
    // CRITICAL: Check current state first - don't rely only on tracker
    const currentState = useChatStore.getState();
    const existingConv = currentState.conversations.find(c => c.id === threadId);
    
    // If conversation exists and already has messages, check if they match
    if (existingConv && existingConv.messages.length > 0) {
      const existingIds = new Set(existingConv.messages.map(m => normalizeId(m.id)));
      
      // If same count and all IDs match, we've already loaded these - abort completely
      if (existingIds.size === incomingIds.size && 
          existingIds.size > 0 &&
          Array.from(existingIds).every(id => incomingIds.has(id))) {
        console.log('[loadMessages] Messages already exist in state, skipping:', threadId, 'existing:', Array.from(existingIds), 'incoming:', Array.from(incomingIds));
        return; // Exit early - don't even call set()
      }
      
      // DEBUG: Log if first message matches but others don't
      if (existingConv.messages.length > 0 && normalizedIncoming.length > 0) {
        const firstExistingMsg = existingConv.messages[0];
        const firstIncomingMsg = normalizedIncoming[0];
        if (firstExistingMsg && firstIncomingMsg) {
          const firstExisting = normalizeId(firstExistingMsg.id);
          const firstIncoming = normalizeId(firstIncomingMsg.id);
          if (firstExisting === firstIncoming) {
            console.log('[loadMessages] WARNING: First message ID matches but not all messages:', {
              threadId,
              firstId: firstExisting,
              existingCount: existingConv.messages.length,
              incomingCount: normalizedIncoming.length,
              existingIds: Array.from(existingIds),
              incomingIds: Array.from(incomingIds)
            });
          }
        }
      }
    }
    
    // Also check tracker as secondary defense
    const tracker = get().messageLoadTracker.get(threadId);
    
    if (tracker) {
      const trackerIds = new Set(Array.from(tracker.messageIds).map(normalizeId));
      // If same count and all IDs match, we've already loaded these - abort completely
      if (trackerIds.size === incomingIds.size && 
          trackerIds.size > 0 &&
          Array.from(trackerIds).every(id => incomingIds.has(id))) {
        console.log('[loadMessages] Already loaded these messages (tracker), skipping:', threadId);
        return; // Exit early - don't even call set()
      }
    }
    
    set((s) => {
      const updatedConvs = s.conversations.map(c => {
        if(c.id !== threadId) return c;
        
        // FINAL CHECK: If messages already exist and match, skip
        if (c.messages.length > 0) {
          const existingIds = new Set(c.messages.map(m => normalizeId(m.id)));
          if (existingIds.size === incomingIds.size && 
              existingIds.size > 0 &&
              Array.from(existingIds).every(id => incomingIds.has(id))) {
            console.log('[loadMessages] Messages match existing state, skipping update:', threadId);
            return c; // Return unchanged
          }
        }
        
        // Remove duplicate messages by ID within the incoming messages array
        const seenIds = new Set<string>();
        const uniqueMsgs = normalizedIncoming.filter(m => {
          const id = normalizeId(m.id);
          if (seenIds.has(id)) {
            console.log('[loadMessages] Duplicate ID in incoming array:', id);
            return false;
          }
          seenIds.add(id);
          return true;
        });
        
        // CRITICAL: Always replace messages completely, never merge
        const finalMessages = uniqueMsgs as Msg[];
        
        // Update tracker BEFORE setting state
        const tracker = get().messageLoadTracker;
        tracker.set(threadId, {
          messageIds: new Set(finalMessages.map(m => normalizeId(m.id))),
          timestamp: Date.now()
        });
        
        console.log('[loadMessages] Loading', finalMessages.length, 'messages for thread:', threadId, 'message IDs:', finalMessages.map(m => m.id));
        
        // Generate title from first user message if title is still "New Chat" or empty
        let newTitle = c.title;
        if((c.title === "New Chat" || !c.title.trim()) && finalMessages.length > 0) {
          const firstUserMsg = finalMessages.find(m => m.role === "user");
          if(firstUserMsg && firstUserMsg.content.trim()) {
            const text = firstUserMsg.content.trim();
            const preview = text.slice(0, 50);
            newTitle = preview.length < text.length ? preview + "..." : preview;
          }
        }
        
        // Once messages are loaded from server, conversation is no longer local-only
        return { ...c, messages: finalMessages, title: newTitle, isLocal: false };
      });
      return { conversations: updatedConvs };
    });
  },
  
  setView: (view) => set({ currentView: view }),
}));

