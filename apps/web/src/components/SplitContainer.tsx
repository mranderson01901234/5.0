import React from "react";

interface SplitContainerProps {
  children: React.ReactNode;
  leftWidth?: number; // Percentage
  rightWidth?: number; // Percentage
}

/**
 * SplitContainer - 50/50 split layout container
 * Renders two panels side by side with a divider
 * Children should be: [leftPanel, divider, rightPanel]
 */
export const SplitContainer: React.FC<SplitContainerProps> = ({
  children,
  leftWidth = 50,
  rightWidth = 50,
}) => {
  const childrenArray = React.Children.toArray(children);
  
  // Ensure we have exactly 3 children: left panel, divider, right panel
  if (childrenArray.length !== 3) {
    console.warn(`SplitContainer expects 3 children, got ${childrenArray.length}`);
  }
  
  const [leftPanel, divider, rightPanel] = childrenArray;

  return (
    <div className="flex h-full w-full min-h-0 overflow-hidden relative">
      {/* Left Panel - allows scrolling */}
      <div
        className="flex-shrink-0 h-full min-h-0 flex flex-col relative"
        style={{ width: `${leftWidth}%`, position: 'relative' }}
      >
        {leftPanel}
      </div>

      {/* Divider */}
      {divider}

      {/* Right Panel - NO SCROLLING, static display only */}
      <div
        className="flex-shrink-0 h-full min-h-0 overflow-hidden"
        style={{ width: `${rightWidth}%`, position: 'relative' }}
      >
        {rightPanel}
      </div>
    </div>
  );
};

