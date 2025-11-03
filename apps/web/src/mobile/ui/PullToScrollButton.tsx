import React from 'react';

interface PullToScrollButtonProps {
  onClick: () => void;
  show: boolean;
}

export const PullToScrollButton: React.FC<PullToScrollButtonProps> = ({ onClick, show }) => {
  if (!show) return null;

  return (
    <button
      onClick={onClick}
      className="fixed bottom-20 right-4 z-40 w-12 h-12 rounded-full bg-[#7c5cff] text-white shadow-lg flex items-center justify-center transition-opacity duration-200 hover:bg-[#6a4dd9] active:scale-95"
      aria-label="Scroll to bottom"
    >
      <svg
        className="w-6 h-6"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M19 14l-7 7m0 0l-7-7m7 7V3"
        />
      </svg>
    </button>
  );
};
