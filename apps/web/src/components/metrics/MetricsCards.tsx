import React from 'react';
import { useMetricsStore } from '@/store/useMetricsStore';

const Card: React.FC<{ title: string; value: React.ReactNode; subtitle?: string }> = ({ title, value, subtitle }) => (
  <div className="rounded-md border p-4">
    <div className="text-xs opacity-70">{title}</div>
    <div className="text-2xl font-semibold mt-1">{value}</div>
    {subtitle ? <div className="text-xs opacity-60 mt-1">{subtitle}</div> : null}
  </div>
);

export const MetricsCards: React.FC = () => {
  const { counters, timers, vitals, reset } = useMetricsStore();

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Runtime Metrics</h2>
        <button type="button" onClick={reset} className="px-3 py-1 border rounded-md" aria-label="Reset metrics">
          Reset
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card title="Unhandled Errors" value={counters.unhandledErrors} />
        <Card title="User-Friendly Errors" value={counters.userFriendlyErrors} />
        <Card title="Error Recovery Actions" value={counters.errorRecoveries} />
        <Card title="Unnecessary Re-renders" value={counters.unnecessaryRerenders} subtitle="Heuristic >2 renders/view" />
        <Card title="MessageList Render (ms)" value={timers.messageListRenderMs ?? '—'} />
      </div>

      <h3 className="text-sm font-semibold mt-4">Web Vitals (field)</h3>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card title="LCP (ms)" value={vitals.LCP ?? '—'} />
        <Card title="INP (ms)" value={vitals.INP ?? '—'} />
        <Card title="CLS" value={vitals.CLS ?? '—'} />
        <Card title="TTFB (ms)" value={vitals.TTFB ?? '—'} />
      </div>
    </section>
  );
};

