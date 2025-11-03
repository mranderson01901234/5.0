import React from 'react';
import Sidebar from '@/components/layout/Sidebar';
import TopBar from '@/components/layout/TopBar';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import SidebarFallback from '@/components/fallbacks/SidebarFallback';
import { useChatStore } from '@/store/chatStore';
import { log } from '@/utils/logger';
import { MetricsCards } from '@/components/metrics/MetricsCards';

// Helper selector to track conversation list changes for sidebar reset
const useSidebarResetKey = () =>
  useChatStore((s) => (s.conversations?.map?.((c) => c.id).join('|')) ?? 'empty');

const Dashboard: React.FC = () => {
  const sidebarResetKey = useSidebarResetKey();

  return (
    <div className="min-h-screen flex flex-col">
      <ErrorBoundary
        FallbackComponent={SidebarFallback as any}
        resetKeys={[sidebarResetKey]}
        onError={(err) => {
          log.error('Sidebar boundary error:', err);
        }}
      >
        <Sidebar/>
      </ErrorBoundary>
      <TopBar/>
      <main className="pl-[48px] pt-16 flex-1 flex flex-col">
        <section className="p-4 space-y-3">
          <h1 className="text-lg font-semibold">Dashboard</h1>
          <p className="text-sm opacity-80">Live metrics from the current session.</p>
          <MetricsCards />
        </section>
      </main>
    </div>
  );
};

export default Dashboard;
