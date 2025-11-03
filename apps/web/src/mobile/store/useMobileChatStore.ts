import { create } from 'zustand';
import { streamChat } from '@/services/gateway';

export type MobileMsg = { id: string; role: 'user' | 'assistant'; content: string };

type State = {
  msgs: MobileMsg[];
  sending: boolean;
  currentStreamId: string | null;
  send: (text: string, threadId?: string) => Promise<void>;
  appendMessage: (msg: MobileMsg) => void;
  clearMessages: () => void;
};

export const useMobileChatStore = create<State>((set, get) => ({
  msgs: [],
  sending: false,
  currentStreamId: null,
  
  appendMessage: (msg: MobileMsg) => {
    set({ msgs: [...get().msgs, msg] });
  },

  clearMessages: () => {
    set({ msgs: [] });
  },

  send: async (text: string, threadId: string = 'mobile') => {
    const userMsg: MobileMsg = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
    };

    set({ 
      msgs: [...get().msgs, userMsg], 
      sending: true 
    });

    try {
      // Use the gateway's streamChat function
      const messages = [
        ...get().msgs.map(m => ({ role: m.role, content: m.content })),
        { role: 'user' as const, content: text }
      ];

      const streamResult = await streamChat({
        threadId,
        messages,
      });

      if (!streamResult) {
        throw new Error('Failed to start stream');
      }

      const assistantMsg: MobileMsg = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: '',
      };

      set({ 
        msgs: [...get().msgs, assistantMsg],
        currentStreamId: assistantMsg.id,
      });

      // Stream the response
      let accumulatedContent = '';
      for await (const chunk of streamResult.stream) {
        if (chunk.ev === 'delta' && chunk.data?.content) {
          accumulatedContent += chunk.data.content;
          set(state => ({
            msgs: state.msgs.map(m => 
              m.id === assistantMsg.id 
                ? { ...m, content: accumulatedContent }
                : m
            ),
          }));
        } else if (chunk.ev === 'done') {
          break;
        } else if (chunk.ev === 'error') {
          throw new Error(chunk.data?.message || 'Stream error');
        }
      }

      set({ sending: false, currentStreamId: null });
    } catch (error) {
      console.error('Mobile chat error:', error);
      set({ 
        sending: false,
        currentStreamId: null,
      });
      // Optionally add error message to UI
      const errorMsg: MobileMsg = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: error instanceof Error ? error.message : 'Failed to send message',
      };
      set({ msgs: [...get().msgs, errorMsg] });
    }
  },
}));

