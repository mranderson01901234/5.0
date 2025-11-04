import React, { useEffect } from 'react';
import { X, BarChart3, TrendingUp, Activity, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMetricsStore } from '@/store/useMetricsStore';

interface DashboardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const MetricCard: React.FC<{ 
  title: string; 
  value: React.ReactNode; 
  subtitle?: string;
  icon?: React.ReactNode;
}> = ({ title, value, subtitle, icon }) => (
  <div className={cn(
    "rounded-lg border border-white/[0.06] p-4",
    "bg-white/[0.02] hover:bg-white/[0.04] transition-all duration-150"
  )}>
    <div className="flex items-start justify-between mb-2">
      <div className="text-xs text-white/50 uppercase tracking-wider">{title}</div>
      {icon && <div className="text-white/30">{icon}</div>}
    </div>
    <div className="text-2xl font-semibold text-white/90 tabular-nums">{value}</div>
    {subtitle && <div className="text-xs text-white/40 mt-1">{subtitle}</div>}
  </div>
);

const DashboardDialog: React.FC<DashboardDialogProps> = ({ open, onOpenChange }) => {
  const { counters, timers, vitals, reset } = useMetricsStore();

  // Handle click outside to close
  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const modal = document.querySelector('[data-dashboard-modal]');
      if (modal && !modal.contains(target)) {
        onOpenChange(false);
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
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <>
      {/* Modal */}
      <div
        data-dashboard-modal
        className="fixed left-20 top-0 bottom-0 z-[9999] w-[420px] bg-[#0a0a0a] border-r border-white/[0.08] flex flex-col shadow-2xl"
      >
        {/* Header */}
        <header className="flex items-center justify-between border-b border-white/[0.08] px-6 py-4 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-1 h-6 bg-white/90 rounded-full" />
            <h2 className="text-base font-medium text-white/90 tracking-tight">Dashboard</h2>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="p-1.5 rounded hover:bg-white/[0.06] transition-colors text-white/40 hover:text-white/70"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-6 space-y-6">
            {/* Runtime Metrics Section */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-white/50" />
                  <h3 className="text-xs font-medium text-white/50 uppercase tracking-wider">
                    Runtime Metrics
                  </h3>
                </div>
                <button
                  onClick={reset}
                  className={cn(
                    "px-2.5 py-1 text-[11px] font-medium rounded border",
                    "border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.06] hover:border-white/[0.12]",
                    "text-white/50 hover:text-white/80 transition-all"
                  )}
                >
                  Reset
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <MetricCard 
                  title="Unhandled Errors" 
                  value={counters.unhandledErrors}
                  icon={<AlertTriangle className="w-4 h-4" />}
                />
                <MetricCard 
                  title="User Errors" 
                  value={counters.userFriendlyErrors}
                  icon={<AlertTriangle className="w-4 h-4" />}
                />
                <MetricCard 
                  title="Recoveries" 
                  value={counters.errorRecoveries}
                  icon={<TrendingUp className="w-4 h-4" />}
                />
                <MetricCard 
                  title="Re-renders" 
                  value={counters.unnecessaryRerenders}
                  subtitle="Heuristic >2/view"
                />
                <MetricCard 
                  title="Render Time" 
                  value={timers.messageListRenderMs !== null ? `${timers.messageListRenderMs}ms` : '—'}
                  subtitle="MessageList"
                />
              </div>
            </div>

            {/* Divider */}
            <div className="h-px bg-white/[0.06]" />

            {/* Web Vitals Section */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <BarChart3 className="w-4 h-4 text-white/50" />
                <h3 className="text-xs font-medium text-white/50 uppercase tracking-wider">
                  Web Vitals
                </h3>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <MetricCard 
                  title="LCP" 
                  value={vitals.LCP !== null ? `${vitals.LCP}ms` : '—'}
                  subtitle="Largest Contentful Paint"
                />
                <MetricCard 
                  title="INP" 
                  value={vitals.INP !== null ? `${vitals.INP}ms` : '—'}
                  subtitle="Interaction to Next Paint"
                />
                <MetricCard 
                  title="CLS" 
                  value={vitals.CLS !== null ? vitals.CLS.toFixed(3) : '—'}
                  subtitle="Cumulative Layout Shift"
                />
                <MetricCard 
                  title="TTFB" 
                  value={vitals.TTFB !== null ? `${vitals.TTFB}ms` : '—'}
                  subtitle="Time to First Byte"
                />
              </div>
            </div>

            {/* Info Section */}
            <div className={cn(
              "rounded-lg border border-white/[0.06] p-4",
              "bg-white/[0.02]"
            )}>
              <div className="text-xs text-white/40 leading-relaxed">
                <p className="mb-2">
                  <span className="text-white/60 font-medium">Live Session Metrics</span>
                </p>
                <p>
                  These metrics are captured in real-time during your current session. 
                  Use the Reset button to clear counters and start fresh.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-white/[0.08] px-6 py-3 flex-shrink-0">
          <div className="flex items-center justify-between text-xs">
            <span className="text-white/30">Session metrics</span>
            <span className="text-white/50 font-medium">Real-time</span>
          </div>
        </div>
      </div>
    </>
  );
};

export default DashboardDialog;

