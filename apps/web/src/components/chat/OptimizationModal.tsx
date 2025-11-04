import React from 'react';
import { X } from 'lucide-react';
import { type OptimizationData } from '@/hooks/useImageOptimization';

interface OptimizationModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: OptimizationData | null;
  onAccept: (optimizedPrompt: string) => void;
}

const OptimizationModal: React.FC<OptimizationModalProps> = ({
  isOpen,
  onClose,
  data,
  onAccept,
}) => {
  if (!isOpen || !data) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
        <div className="bg-neutral-900 border border-white/10 rounded-xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-white/10">
            <h2 className="text-lg font-semibold text-white/90">Optimize Prompt</h2>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-white/60 hover:text-white/90"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Original */}
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-white/60 uppercase tracking-wide">
                Original
              </h3>
              <p className="text-white/90 bg-white/5 rounded-lg p-4 text-sm leading-relaxed">
                {data.original}
              </p>
            </div>

            {/* Optimized */}
            {data.optimized && (
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-green-400/80 uppercase tracking-wide">
                  Optimized
                </h3>
                <p className="text-white/90 bg-green-500/10 border border-green-500/20 rounded-lg p-4 text-sm leading-relaxed">
                  {data.optimized}
                </p>
              </div>
            )}

            {/* Improvements */}
            {data.improvements && data.improvements.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-white/60 uppercase tracking-wide">
                  Improvements
                </h4>
                <ul className="space-y-1.5">
                  {data.improvements.map((improvement, index) => (
                    <li key={index} className="flex items-start gap-2 text-sm text-white/70">
                      <span className="text-white/40 mt-0.5">•</span>
                      <span>{improvement}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Quality Score */}
            <div className="flex items-center gap-3 text-sm">
              <span className="text-white/60">Quality Score:</span>
              <div className="flex items-center gap-2 flex-1">
                <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-yellow-500 to-green-500 transition-all duration-300"
                    style={{ width: `${data.qualityScore}%` }}
                  />
                </div>
                <span className="text-white/90 font-medium min-w-[3ch]">
                  {data.qualityScore}/100
                </span>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 p-4 border-t border-white/10">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm text-white/70 hover:text-white/90 hover:bg-white/5 transition-colors"
            >
              Keep Original
            </button>
            <button
              onClick={() => {
                if (data.optimized) {
                  onAccept(data.optimized);
                  onClose();
                }
              }}
              className="px-4 py-2 rounded-lg text-sm bg-white/10 hover:bg-white/20 text-white/90 border border-white/20 hover:border-white/30 transition-colors font-medium"
            >
              Use Optimized
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default OptimizationModal;
