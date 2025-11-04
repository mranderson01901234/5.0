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
  // Memoize messages array to provide stable reference and remove duplicates by ID
  const items = useMemo<Message[]>(() => {
    if (!currentConv?.messages) return [];
    // Remove duplicate messages by ID
    const seenIds = new Set<string>();
    return currentConv.messages.filter(msg => {
      if (seenIds.has(msg.id)) {
        return false;
      }
      seenIds.add(msg.id);
      return true;
    });
  }, [currentConv?.messages]);
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

  // Position new user messages at 75px anchor
  useEffect(() => {
    if (!containerRef.current) return;
    
    // Find the actual scrollable container - try multiple methods
    let scrollContainer = containerRef.current.closest('.overflow-y-auto') as HTMLElement;
    
    // If that doesn't work or isn't scrollable, try finding the chat-container
    if (!scrollContainer || scrollContainer.scrollHeight <= scrollContainer.clientHeight) {
      scrollContainer = containerRef.current.closest('.chat-container') as HTMLElement;
    }
    
    // If still not found, try window
    if (!scrollContainer || (scrollContainer.scrollHeight <= scrollContainer.clientHeight && scrollContainer !== document.documentElement)) {
      // Find parent with actual scroll
      let parent = containerRef.current.parentElement;
      while (parent && parent !== document.body) {
        if (parent.scrollHeight > parent.clientHeight) {
          scrollContainer = parent;
          break;
        }
        parent = parent.parentElement;
      }
    }
    
    if (!scrollContainer) return;
    
    // Find the last USER message (not just last item, since assistant is added right after)
    const lastUserMessage = [...items].reverse().find(item => item.role === 'user');
    if (!lastUserMessage) {
      // If no user message, scroll to bottom as before
      scrollContainer.scrollTop = scrollContainer.scrollHeight;
      return;
    }

    // Track if we've already positioned this message to prevent loops
    const messageId = lastUserMessage.id;
    const positionedKey = `positioned-${messageId}`;
    if (sessionStorage.getItem(positionedKey)) {
      return; // Already positioned this message
    }

    // Wait for message to render and layout to complete
    const frameId = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const messageElement = containerRef.current?.querySelector(`article[data-id="${messageId}"]`) as HTMLElement;
        if (!messageElement) return;

        const messageRect = messageElement.getBoundingClientRect();
        const containerRect = scrollContainer.getBoundingClientRect();
        
        // Wait for layout, then scroll
        setTimeout(() => {
          const messageRect = messageElement.getBoundingClientRect();
          const currentTop = messageRect.top;
          const targetTop = 75;
          
          // If already at target, skip
          if (Math.abs(currentTop - targetTop) < 5) {
            sessionStorage.setItem(positionedKey, 'true');
            return;
          }
          
          // FORCE SCROLL: Try multiple methods
          const scrollAmount = currentTop - targetTop;
          
          // Method 1: Direct scrollTop assignment
          scrollContainer.scrollTop = scrollContainer.scrollTop + scrollAmount;
          
          // Method 2: scrollTo
          scrollContainer.scrollTo(0, scrollContainer.scrollTop + scrollAmount);
          
          // Method 3: scrollBy
          scrollContainer.scrollBy(0, scrollAmount);
          
          // Method 4: If container won't scroll, try window
          if (scrollContainer.scrollTop === 0 && Math.abs(scrollAmount) > 10) {
            window.scrollBy(0, scrollAmount);
          }
          
          // Verify immediately
          requestAnimationFrame(() => {
            const verifyRect = messageElement.getBoundingClientRect();
            const newTop = verifyRect.top;
            const stillOff = newTop - targetTop;
            
            // If still off, try one more adjustment
            if (Math.abs(stillOff) > 5) {
              scrollContainer.scrollTop = scrollContainer.scrollTop + stillOff;
              window.scrollBy(0, stillOff);
            }
            
            sessionStorage.setItem(positionedKey, 'true');
            setTimeout(() => sessionStorage.removeItem(positionedKey), 1000);
          });
        }, 100);
      });
    });

    return () => cancelAnimationFrame(frameId);
  }, [items.length, items[items.length - 1]?.id]);

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

