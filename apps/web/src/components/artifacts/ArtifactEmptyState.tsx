import React from "react";
import { useUIStore } from "@/store/uiStore";
import { useSearchParams } from "react-router-dom";
import { X } from "lucide-react";

/**
 * Empty state component when no artifact is selected
 */
export const ArtifactEmptyState: React.FC = () => {
  const { setSplitView, setLastSplitCloseTs } = useUIStore();
  const [, setSearchParams] = useSearchParams();

  const handleClose = () => {
    setSplitView(false);
    setLastSplitCloseTs(Date.now()); // Track manual close for debounce
    setSearchParams({ view: "chat" }, { replace: true });
  };

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="text-center max-w-md">
        {/* Close button */}
        <div className="flex justify-end mb-4">
          <button
            onClick={handleClose}
            className="text-white/60 hover:text-white/90 transition-colors p-1 rounded hover:bg-white/5"
            aria-label="Close artifact pane"
            title="Close artifact pane (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Icon placeholder */}
        <div className="mb-6 flex justify-center">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-500/60 to-blue-500/60 opacity-60 flex items-center justify-center">
            <svg
              className="w-8 h-8 text-white/70"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          </div>
        </div>

        <h2 className="text-white/90 text-lg font-semibold mb-2">
          No artifact created yet
        </h2>
        <p className="text-white/70 text-sm mb-6">
          Artifacts will appear here when you create tables, documents, or
          spreadsheets.
        </p>

        {/* Placeholder buttons - will be functional in Phase 3 */}
        <div className="flex gap-3 justify-center">
          <button
            className="px-4 py-2 text-sm glass-light text-white/70 hover:text-white rounded-md transition-colors duration-200"
            disabled
          >
            Create Table
          </button>
          <button
            className="px-4 py-2 text-sm glass-light text-white/70 hover:text-white rounded-md transition-colors duration-200"
            disabled
          >
            Create Document
          </button>
          <button
            className="px-4 py-2 text-sm glass-light text-white/70 hover:text-white rounded-md transition-colors duration-200"
            disabled
          >
            Create Sheet
          </button>
        </div>
      </div>
    </div>
  );
};

