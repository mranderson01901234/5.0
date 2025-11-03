import { useEffect, useState } from 'react';

/**
 * Hook to handle keyboard visibility and adjust layout accordingly
 * Uses the Visual Viewport API to detect keyboard open/close
 */
export function useKeyboardHandler() {
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  useEffect(() => {
    // Check if Visual Viewport API is available
    if (!window.visualViewport) {
      return;
    }

    const viewport = window.visualViewport;
    let initialHeight = viewport.height;

    function handleResize() {
      if (!viewport) return;

      const currentHeight = viewport.height;
      const heightDiff = initialHeight - currentHeight;

      // Keyboard is considered visible if viewport height decreased significantly (> 150px)
      if (heightDiff > 150) {
        setIsKeyboardVisible(true);
        setKeyboardHeight(heightDiff);
      } else {
        setIsKeyboardVisible(false);
        setKeyboardHeight(0);
      }
    }

    function handleScroll() {
      // When keyboard opens, scroll to keep focused input visible
      if (viewport && isKeyboardVisible) {
        window.scrollTo(0, 0);
      }
    }

    viewport.addEventListener('resize', handleResize);
    viewport.addEventListener('scroll', handleScroll);

    return () => {
      viewport.removeEventListener('resize', handleResize);
      viewport.removeEventListener('scroll', handleScroll);
    };
  }, [isKeyboardVisible]);

  return { keyboardHeight, isKeyboardVisible };
}
