import { useEffect, useRef, useState, useCallback } from "react";

/**
 * Hook to handle auto-scrolling behavior for chat containers
 * Provides scroll-to-bottom functionality and scroll position tracking
 */
export function useAutoScroll(
  containerRef: React.RefObject<HTMLElement>,
  itemsLength: number,
  dependencies: any[] = []
) {
  const [showScrollButton, setShowScrollButton] = useState(false);

  // Find the scrollable parent container
  useEffect(() => {
    const handleScroll = () => {
      if (!containerRef.current) return;
      
      // Find the scrollable parent
      const scrollContainer = containerRef.current.closest('.overflow-y-auto') as HTMLElement;
      if (!scrollContainer) return;
      
      const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
      setShowScrollButton(!isNearBottom);
    };

    // Find the scrollable parent container
    const scrollContainer = containerRef.current?.closest('.overflow-y-auto') as HTMLElement;
    if (scrollContainer) {
      scrollContainer.addEventListener('scroll', handleScroll);
      // Initial check
      handleScroll();
      
      return () => {
        scrollContainer.removeEventListener('scroll', handleScroll);
      };
    }
  }, [containerRef, itemsLength, ...dependencies]);

  const scrollToBottom = useCallback(() => {
    const scrollContainer = containerRef.current?.closest('.overflow-y-auto') as HTMLElement;
    if (scrollContainer) {
      scrollContainer.scrollTo({
        top: scrollContainer.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [containerRef]);

  return {
    showScrollButton,
    scrollToBottom,
  };
}

