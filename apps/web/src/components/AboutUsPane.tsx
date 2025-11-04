import React, { useEffect } from "react";
import { X, Info } from "lucide-react";

interface AboutUsPaneProps {
  onClose: () => void;
}

export const AboutUsPane: React.FC<AboutUsPaneProps> = ({ onClose }) => {
  // Handle click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const modal = document.querySelector('[data-aboutus-modal]');
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
      data-aboutus-modal
      className="fixed right-0 top-16 bottom-0 z-[9999] w-[580px] bg-[#0a0a0a] border-l border-white/[0.08] flex flex-col shadow-2xl"
    >
      {/* Header */}
      <header className="flex items-center justify-between border-b border-white/[0.08] px-6 py-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-1 h-6 bg-white/90 rounded-full" />
          <h2 className="text-lg font-medium text-white/90 tracking-tight">About Us</h2>
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
      <div className="flex-1 overflow-y-auto">
        <div className="pt-4">
          {/* Introduction Section */}
          <div className="mb-6">
            <div className="px-6 mb-3 flex items-center gap-2">
              <Info className="w-4 h-4 text-white/50" />
              <h3 className="text-sm font-medium text-white/50 uppercase tracking-wider">
                Overview
              </h3>
              <div className="flex-1 h-px bg-white/[0.06]" />
            </div>
            <div className="px-3 space-y-1">
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-5">
                <h1 className="text-xl font-semibold text-white/90 mb-2">About the System</h1>
                <p className="text-base text-white/60 leading-relaxed mb-3">
                  Adaptive intelligence with built-in memory
                </p>
                <div className="space-y-2 text-base text-white/70">
                  <p className="leading-relaxed">A communication system engineered for continuity.</p>
                  <p className="leading-relaxed">It learns patterns, retains context, and responds with awareness of what came before.</p>
                </div>
              </div>
            </div>
          </div>

          {/* For Users Section */}
          <div className="mb-6">
            <div className="px-6 mb-3 flex items-center gap-2">
              <h3 className="text-sm font-medium text-white/50 uppercase tracking-wider">
                For Users
              </h3>
              <div className="flex-1 h-px bg-white/[0.06]" />
            </div>
            <div className="px-3 space-y-1">
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.03] transition-colors p-5">
                <ul className="space-y-2.5 text-base text-white/70">
                  <li className="flex items-start gap-2">
                    <span className="text-white/40 mt-1">•</span>
                    <span>Continues conversations without reintroduction</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-white/40 mt-1">•</span>
                    <span>Understands accumulated context across projects</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-white/40 mt-1">•</span>
                    <span>Responds faster as understanding deepens</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-white/40 mt-1">•</span>
                    <span>Maintains privacy through automated redaction</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* Capabilities Section */}
          <div className="mb-6">
            <div className="px-6 mb-3 flex items-center gap-2">
              <h3 className="text-sm font-medium text-white/50 uppercase tracking-wider">
                Capabilities
              </h3>
              <div className="flex-1 h-px bg-white/[0.06]" />
            </div>
            <div className="px-3 space-y-1">
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.03] transition-colors p-5">
                <ul className="space-y-2.5 text-base text-white/70">
                  <li className="flex items-start gap-2">
                    <span className="text-white/40 mt-1">•</span>
                    <span>Persistent memory across sessions</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-white/40 mt-1">•</span>
                    <span>Contextual adaptation to tone and intent</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-white/40 mt-1">•</span>
                    <span>Cross-session linkage of related ideas</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-white/40 mt-1">•</span>
                    <span>Real-time recall under 200ms latency</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-white/40 mt-1">•</span>
                    <span>Semantic understanding via vector memory</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-white/40 mt-1">•</span>
                    <span>Privacy-first isolated memory storage</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* Core Architecture Section */}
          <div className="mb-6">
            <div className="px-6 mb-3 flex items-center gap-2">
              <h3 className="text-sm font-medium text-white/50 uppercase tracking-wider">
                Core Architecture
              </h3>
              <div className="flex-1 h-px bg-white/[0.06]" />
            </div>
            <div className="px-3 space-y-1">
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.03] transition-colors p-5">
                <div className="space-y-3">
                  <div>
                    <h4 className="text-base text-white/80 font-medium mb-1.5">1. Semantic Memory Layer</h4>
                    <p className="text-sm text-white/60 leading-relaxed">
                      Extracts meaning from every interaction and stores it as structured knowledge.
                    </p>
                  </div>
                  <div className="h-px bg-white/[0.06]" />
                  <div>
                    <h4 className="text-base text-white/80 font-medium mb-1.5">2. Temporal Awareness Engine</h4>
                    <p className="text-sm text-white/60 leading-relaxed">
                      Recognizes when stored information becomes relevant again.
                    </p>
                  </div>
                  <div className="h-px bg-white/[0.06]" />
                  <div>
                    <h4 className="text-base text-white/80 font-medium mb-1.5">3. Adaptive Recall System</h4>
                    <p className="text-sm text-white/60 leading-relaxed">
                      Retrieves data selectively in milliseconds, prioritizing accuracy.
                    </p>
                  </div>
                  <div className="h-px bg-white/[0.06]" />
                  <div>
                    <h4 className="text-base text-white/80 font-medium mb-1.5">4. Contextual Reasoning Core</h4>
                    <p className="text-sm text-white/60 leading-relaxed">
                      Synthesizes previous and current data for informed responses.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* System Design Section */}
          <div className="mb-6">
            <div className="px-6 mb-3 flex items-center gap-2">
              <h3 className="text-sm font-medium text-white/50 uppercase tracking-wider">
                System Design
              </h3>
              <div className="flex-1 h-px bg-white/[0.06]" />
            </div>
            <div className="px-3 space-y-1">
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.03] transition-colors p-5">
                <div className="space-y-3">
                  <div>
                    <h4 className="text-base text-white/80 font-medium mb-1.5">Frontend</h4>
                    <p className="text-sm text-white/60 leading-relaxed">
                      React + TypeScript, Zustand for state management, Tailwind for minimal latency.
                    </p>
                  </div>
                  <div className="h-px bg-white/[0.06]" />
                  <div>
                    <h4 className="text-base text-white/80 font-medium mb-1.5">Backend</h4>
                    <p className="text-sm text-white/60 leading-relaxed">
                      Fastify runtime with modular services for messaging and semantic memory indexing.
                    </p>
                  </div>
                  <div className="h-px bg-white/[0.06]" />
                  <div>
                    <h4 className="text-base text-white/80 font-medium mb-1.5">Infrastructure</h4>
                    <p className="text-sm text-white/60 leading-relaxed">
                      Hybrid retrieval engine combining local memory and live data streams.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* For Developers Section */}
          <div className="mb-6">
            <div className="px-6 mb-3 flex items-center gap-2">
              <h3 className="text-sm font-medium text-white/50 uppercase tracking-wider">
                For Developers
              </h3>
              <div className="flex-1 h-px bg-white/[0.06]" />
            </div>
            <div className="px-3 space-y-1">
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.03] transition-colors p-5">
                <ul className="space-y-2.5 text-base text-white/70">
                  <li className="flex items-start gap-2">
                    <span className="text-white/40 mt-1">•</span>
                    <span>Modular memory APIs and real-time event streams</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-white/40 mt-1">•</span>
                    <span>Hybrid recall engine with symbolic and vector indexing</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-white/40 mt-1">•</span>
                    <span>Context orchestration with automated scoring</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-white/40 mt-1">•</span>
                    <span>Built for distributed scale and low-latency</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* Vision Section */}
          <div className="mb-6">
            <div className="px-6 mb-3 flex items-center gap-2">
              <h3 className="text-sm font-medium text-white/50 uppercase tracking-wider">
                Vision
              </h3>
              <div className="flex-1 h-px bg-white/[0.06]" />
            </div>
            <div className="px-3 space-y-1">
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.03] transition-colors p-5">
                <div className="space-y-2 text-sm text-white/60">
                  <p className="leading-relaxed">To embed continuity into communication itself.</p>
                  <p className="leading-relaxed">
                    To replace repetition with recall, reaction with anticipation.
                  </p>
                </div>
                <div className="bg-white/[0.04] border border-white/[0.08] rounded-lg p-4 mt-3">
                  <p className="text-base text-white/80 text-center leading-relaxed">
                    A memory-driven intelligence environment — adaptive, autonomous, and aware.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-white/[0.08] px-6 py-3 flex-shrink-0">
        <div className="flex items-center justify-between text-sm">
          <span className="text-white/30">System Information</span>
          <span className="text-white/50 font-medium">v2.0</span>
        </div>
      </div>
    </div>
  );
};
