import React from "react";

interface DividerProps {
  onResize?: (deltaX: number) => void;
}

/**
 * Divider - Resizable divider between panels
 * Static for Phase 2 (draggable functionality in future phases)
 */
export const Divider: React.FC<DividerProps> = ({ onResize }) => {
  return (
    <div
      className="resizable-divider w-1 bg-white/10 hover:bg-purple-500/30 cursor-col-resize transition-colors duration-200 flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
      role="separator"
      aria-label="Resize panels, use arrow keys"
      aria-orientation="vertical"
      tabIndex={0}
      onMouseDown={(e) => {
        // Placeholder for drag handling - will be implemented in future phases
        if (onResize) {
          // Prevent default text selection
          e.preventDefault();
        }
      }}
      onKeyDown={(e) => {
        // Placeholder for keyboard resize - will be implemented in future phases
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          e.preventDefault();
          // Handle resize in future phases
        } else if (e.key === "Escape") {
          // Reset to 50/50 in future phases
          e.preventDefault();
        }
      }}
    />
  );
};

