import React, { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { useChatStore } from "../../store/chatStore";
import MessageItem, { type Message } from "./MessageItem";

const MessageListBase: React.FC = () => {
  const currentThreadId = useChatStore(s => s.currentThreadId);
  const conversations = useChatStore(s => s.conversations);
  const currentConv = useMemo(
    () => conversations.find(c => c.id === currentThreadId),
    [conversations, currentThreadId]
  );
  // Memoize messages array to provide stable reference
  const items = useMemo<Message[]>(() => currentConv?.messages || [], [currentConv?.messages]);
  const frChip = useChatStore(s => s.frChip);
  const ttfbMs = useChatStore(s => s.ttfbMs);
  const streaming = useChatStore(s => s.streaming);
  const researchThinking = useChatStore(s => s.researchThinking);
  const containerRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);

  // Find the scrollable parent container
  useEffect(() => {
    const handleScroll = () => {
      if (!containerRef.current) return;
      
      // Find the scrollable parent
      const scrollContainer = containerRef.current.closest('.overflow-y-auto');
      if (!scrollContainer) return;
      
      const { scrollTop, scrollHeight, clientHeight } = scrollContainer as HTMLElement;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
      setShowScrollButton(!isNearBottom);
    };

    // Find the scrollable parent container
    const scrollContainer = containerRef.current?.closest('.overflow-y-auto');
    if (scrollContainer) {
      scrollContainer.addEventListener('scroll', handleScroll);
      // Initial check
      handleScroll();
      
      return () => {
        scrollContainer.removeEventListener('scroll', handleScroll);
      };
    }
  }, [items.length]);

  const scrollToBottom = useCallback(() => {
    const scrollContainer = containerRef.current?.closest('.overflow-y-auto');
    if (scrollContainer) {
      scrollContainer.scrollTo({
        top: scrollContainer.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, []);

  useEffect(() => {
    if (containerRef.current) {
      // Auto-scroll on new messages
      const scrollContainer = containerRef.current.closest('.overflow-y-auto');
      if (scrollContainer) {
        (scrollContainer as HTMLElement).scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [items.length, items[items.length - 1]?.content]);

  if (items.length === 0) return null;

  return (
    <>
      <section ref={containerRef} role="feed" aria-busy="false" aria-label="Chat messages" className="w-full space-y-8">
        {items.map((item, index) => {
          const isLastAssistant = index === items.length - 1 && item.role === "assistant" && streaming;
          
          return (
            <MessageItem
              key={item.id}
              msg={item}
              isLastAssistant={isLastAssistant}
              streaming={streaming}
              frChip={frChip}
              ttfbMs={ttfbMs}
              researchThinking={researchThinking}
            />
          );
        })}
      </section>
      {/* Scroll to bottom button */}
      {showScrollButton && (
        <button
          onClick={scrollToBottom}
          className="fixed bottom-24 right-8 z-20 bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/20 rounded-full p-3 transition-all duration-200 shadow-lg hover:shadow-xl"
          aria-label="Scroll to bottom"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
            className="w-6 h-6 text-white/90"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 13.5L12 21m0 0l-7.5-7.5M12 21V3" />
          </svg>
        </button>
      )}
    </>
  );
};

const MessageList = React.memo(MessageListBase);

export default MessageList;

