import { create } from "zustand";

type Msg = { 
  id:string; 
  role:"user"|"assistant"|"system"; 
  content:string;
  sources?: Array<{ title: string; host: string; url?: string; date?: string }>;
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
  currentView: View;
  
  // Actions
  add(m:Msg):void;
  patchAssistant(text:string, sources?: Array<{ title: string; host: string; url?: string; date?: string }>):void;
  updateMessageContent(messageId: string, content: string):void;
  setFRChip(s?:string):void;
  setTTFB(ms?:number):void;
  setResearchThinking(thinking:boolean):void;
  setResearchSummary(summary?:string):void;
  start():void; 
  end():void;
  newConversation():void;
  switchConversation(threadId:string):void;
  deleteConversation(threadId:string):void;
  loadConversations(convs: Array<{id: string; title: string; updatedAt: number}>):void;
  loadMessages(threadId: string, msgs: Array<{id: string; role: string; content: string}>):void;
  setView(view: View): void;
};

export const useChatStore = create<State>((set)=>({
  conversations: [],
  currentThreadId: "",
  streaming: false,
  activeStreams: 0,
  currentView: 'chat',
  
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
        messages[lastIdx] = { ...lastMsg, content: t, sources: sources ?? lastMsg.sources };
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
  
  start: () => set((s) => ({ streaming: true, activeStreams: s.activeStreams + 1 })),
  end: () => set((s) => ({ 
    streaming: false, 
    activeStreams: Math.max(0, s.activeStreams - 1),
    researchThinking: false
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
    set(() => ({
      conversations: convs.map(c => ({
        id: c.id,
        title: c.title,
        messages: [],
        updatedAt: c.updatedAt,
      })),
    }));
  },
  
  loadMessages: (threadId, msgs) => {
    set((s) => {
      const updatedConvs = s.conversations.map(c => {
        if(c.id !== threadId) return c;
        
        // Remove duplicate messages by ID to prevent duplicates on refresh
        const seenIds = new Set<string>();
        const uniqueMsgs = msgs.filter(m => {
          if (seenIds.has(m.id)) {
            return false;
          }
          seenIds.add(m.id);
          return true;
        });
        
        // Generate title from first user message if title is still "New Chat" or empty
        let newTitle = c.title;
        if((c.title === "New Chat" || !c.title.trim()) && uniqueMsgs.length > 0) {
          const firstUserMsg = uniqueMsgs.find(m => m.role === "user");
          if(firstUserMsg && firstUserMsg.content.trim()) {
            const text = firstUserMsg.content.trim();
            const preview = text.slice(0, 50);
            newTitle = preview.length < text.length ? preview + "..." : preview;
          }
        }
        
        // Once messages are loaded from server, conversation is no longer local-only
        return { ...c, messages: uniqueMsgs as Msg[], title: newTitle, isLocal: false };
      });
      return { conversations: updatedConvs };
    });
  },
  
  setView: (view) => set({ currentView: view }),
}));

