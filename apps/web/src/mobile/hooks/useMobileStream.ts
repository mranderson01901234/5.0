import * as React from 'react';
import type { MobileMsg } from '../store/useMobileChatStore';
import { useMobileChatStore } from '../store/useMobileChatStore';

export function useMobileStream(conversationId: string) {
  const append = React.useCallback((m: MobileMsg) => {
    useMobileChatStore.setState((s) => ({ msgs: [...s.msgs, m] }));
  }, []);

  React.useEffect(() => {
    let ctrl = new AbortController();
    async function run() {
      // Note: This hook expects a GET endpoint at /api/stream
      // If your API uses a different pattern (e.g., POST to /v1/chat/stream),
      // the store's send() method already handles streaming via streamChat.
      // This hook is provided as an optional pattern for message subscriptions.
      try {
        const res = await fetch(`/api/stream?cid=${encodeURIComponent(conversationId)}`, { 
          signal: ctrl.signal 
        });
        if (!res.ok || !res.body) return;
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const text = dec.decode(value, { stream: true }).trim();
          for (const line of text.split('\n')) {
            if (!line) continue;
            try {
              const j = JSON.parse(line) as { id: string; role: 'assistant'|'user'; content: string };
              append({ id: j.id, role: j.role, content: j.content });
            } catch {}
          }
        }
      } catch (err) {
        // Silently handle errors (connection closed, aborted, etc.)
        if (err instanceof Error && err.name !== 'AbortError') {
          console.debug('Mobile stream error:', err.message);
        }
      }
    }
    run().catch(() => {});
    return () => { ctrl.abort(); };
  }, [conversationId, append]);
}


