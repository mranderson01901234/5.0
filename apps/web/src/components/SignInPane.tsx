import React, { useEffect } from "react";
import { X } from "lucide-react";
import { SignIn } from "@clerk/clerk-react";

interface SignInPaneProps {
  onClose: () => void;
}

export const SignInPane: React.FC<SignInPaneProps> = ({ onClose }) => {
  // Handle click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const modal = document.querySelector('[data-signin-modal]');
      if (modal && !modal.contains(target)) {
        onClose();
      }
    };

    // Small delay to avoid immediate closure
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  return (
    <div
      data-signin-modal
      className="fixed right-0 top-16 bottom-0 z-[10001] w-[580px] bg-[#0a0a0a] border-l border-white/[0.08] flex flex-col shadow-2xl"
    >
      {/* Header */}
      <header className="flex items-center justify-between border-b border-white/[0.08] px-6 py-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-1 h-6 bg-white/90 rounded-full" />
          <h2 className="text-lg font-medium text-white/90 tracking-tight">Sign In</h2>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded hover:bg-white/[0.06] transition-colors text-white/40 hover:text-white/70"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-8">
        <SignIn 
          appearance={{
            elements: {
              rootBox: "w-full",
              card: "bg-transparent border-0 shadow-none w-full",
            }
          }}
        />
      </div>
    </div>
  );
};

