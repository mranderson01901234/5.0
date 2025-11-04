import React, { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface ViewportInfo {
  width: number;
  height: number;
  scrollX: number;
  scrollY: number;
  innerWidth: number;
  innerHeight: number;
  documentHeight: number;
  documentWidth: number;
  scrollableContainers: Array<{
    className: string;
    scrollTop: number;
    scrollHeight: number;
    clientHeight: number;
    scrollLeft: number;
    scrollWidth: number;
    clientWidth: number;
    label: string;
  }>;
}

const ViewportDebug: React.FC = () => {
  const [viewportInfo, setViewportInfo] = useState<ViewportInfo>({
    width: 0,
    height: 0,
    scrollX: 0,
    scrollY: 0,
    innerWidth: 0,
    innerHeight: 0,
    documentHeight: 0,
    documentWidth: 0,
    scrollableContainers: [],
  });

  useEffect(() => {
    const updateViewportInfo = () => {
      // Get scrollable containers
      const scrollableElements = document.querySelectorAll('.overflow-y-auto, .overflow-auto, .chat-container');
      const containers: ViewportInfo['scrollableContainers'] = [];
      
      scrollableElements.forEach((el) => {
        const htmlEl = el as HTMLElement;
        const hasChatContainer = htmlEl.classList.contains('chat-container');
        const hasSidebar = htmlEl.closest('aside') !== null;
        const hasPromptTester = htmlEl.closest('[class*="prompt"]') !== null || htmlEl.textContent?.includes('Prompt');
        
        let label = 'Unknown';
        if (hasChatContainer) {
          label = 'Chat UI';
        } else if (hasSidebar) {
          label = 'Sidebar';
        } else if (hasPromptTester) {
          label = 'PromptTester';
        } else if (htmlEl.id) {
          label = htmlEl.id;
        } else if (htmlEl.className) {
          // Extract meaningful class names
          const classes = htmlEl.className.split(' ').filter(c => 
            c && !c.startsWith('overflow') && c !== 'flex' && c !== 'flex-1'
          );
          label = classes[0] || 'Scrollable';
        }
        
        containers.push({
          className: htmlEl.className || 'unknown',
          scrollTop: htmlEl.scrollTop,
          scrollHeight: htmlEl.scrollHeight,
          clientHeight: htmlEl.clientHeight,
          scrollLeft: htmlEl.scrollLeft,
          scrollWidth: htmlEl.scrollWidth,
          clientWidth: htmlEl.clientWidth,
          label: label,
        });
      });

      setViewportInfo({
        width: window.innerWidth,
        height: window.innerHeight,
        scrollX: window.scrollX,
        scrollY: window.scrollY,
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        documentHeight: document.documentElement.scrollHeight,
        documentWidth: document.documentElement.scrollWidth,
        scrollableContainers: containers,
      });
    };

    // Initial update
    updateViewportInfo();

    // Update on scroll, resize, and orientation change
    window.addEventListener('scroll', updateViewportInfo, true);
    window.addEventListener('resize', updateViewportInfo);
    window.addEventListener('orientationchange', updateViewportInfo);

    // Listen to scroll on all scrollable containers
    const scrollableElements = document.querySelectorAll('.overflow-y-auto, .overflow-auto, .chat-container');
    scrollableElements.forEach((el) => {
      el.addEventListener('scroll', updateViewportInfo, true);
    });

    // Use MutationObserver to detect new scrollable containers
    const observer = new MutationObserver(() => {
      updateViewportInfo();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    // Update periodically to catch any changes
    const interval = setInterval(updateViewportInfo, 100);

    return () => {
      window.removeEventListener('scroll', updateViewportInfo, true);
      window.removeEventListener('resize', updateViewportInfo);
      window.removeEventListener('orientationchange', updateViewportInfo);
      scrollableElements.forEach((el) => {
        el.removeEventListener('scroll', updateViewportInfo, true);
      });
      observer.disconnect();
      clearInterval(interval);
    };
  }, []);

  return (
    <div
      className="fixed top-4 right-4 z-[9999] bg-black/80 backdrop-blur-sm border border-white/20 rounded-lg p-4 font-mono text-xs text-white/90 shadow-2xl max-w-sm"
      style={{ fontFamily: 'Courier New, Monaco, Consolas, monospace' }}
    >
      <div className="font-bold text-white mb-2 text-sm border-b border-white/20 pb-2">
        Viewport Debug
      </div>
      <div className="space-y-1 max-h-[80vh] overflow-y-auto">
        <div className="space-y-1">
          <div>
            <span className="text-white/70">Window Size:</span>{' '}
            <span className="text-white">
              {viewportInfo.width} × {viewportInfo.height}px
            </span>
          </div>
          <div>
            <span className="text-white/70">Window Scroll:</span>{' '}
            <span className="text-white">
              X: {viewportInfo.scrollX}px, Y: {viewportInfo.scrollY}px
            </span>
          </div>
          <div>
            <span className="text-white/70">Document Size:</span>{' '}
            <span className="text-white">
              {viewportInfo.documentWidth} × {viewportInfo.documentHeight}px
            </span>
          </div>
          <div>
            <span className="text-white/70">Viewport:</span>{' '}
            <span className="text-white">
              {viewportInfo.innerWidth} × {viewportInfo.innerHeight}px
            </span>
          </div>
          <div className="pt-2 mt-2 border-t border-white/20">
            <span className="text-white/70">Top-Left:</span>{' '}
            <span className="text-white">(0, 0)</span>
          </div>
          <div>
            <span className="text-white/70">Bottom-Right:</span>{' '}
            <span className="text-white">
              ({viewportInfo.width}, {viewportInfo.height})
            </span>
          </div>
          <div>
            <span className="text-white/70">Max Scroll Y:</span>{' '}
            <span className="text-white">
              {Math.max(0, viewportInfo.documentHeight - viewportInfo.height)}px
            </span>
          </div>
        </div>
        
        {viewportInfo.scrollableContainers.length > 0 && (
          <div className="pt-2 mt-2 border-t border-white/20">
            <div className="font-semibold text-white/90 mb-1">Scrollable Containers:</div>
            {viewportInfo.scrollableContainers.map((container, idx) => (
              <div key={idx} className="mb-2 pl-2 border-l-2 border-white/10">
                <div className={cn(
                  "text-[10px] mb-1 font-semibold",
                  container.label === 'Chat UI' ? "text-purple-400" : "text-white/60"
                )}>
                  {container.label} {container.label !== 'Chat UI' && `(${idx + 1})`}
                </div>
                <div className="space-y-0.5">
                  <div>
                    <span className="text-white/70">Scroll:</span>{' '}
                    <span className="text-white">
                      Y: {container.scrollTop}px / {Math.max(0, container.scrollHeight - container.clientHeight)}px
                    </span>
                  </div>
                  <div>
                    <span className="text-white/70">Size:</span>{' '}
                    <span className="text-white">
                      {container.clientWidth} × {container.clientHeight}px
                    </span>
                  </div>
                  <div>
                    <span className="text-white/70">Content:</span>{' '}
                    <span className="text-white">
                      {container.scrollWidth} × {container.scrollHeight}px
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ViewportDebug;

