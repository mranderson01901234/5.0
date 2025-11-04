/**
 * Telemetry Dashboard Page
 * Shows real-time telemetry logs and metrics
 */

import React from 'react';
import { EventStream } from '@/components/telemetry/EventStream';
import { MetricsPanel } from '@/components/telemetry/MetricsPanel';
import { ExportChart } from '@/components/telemetry/ExportChart';

export const TelemetryDashboard: React.FC = () => {
  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white p-6">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Telemetry Dashboard</h1>
        
        <div className="grid grid-cols-1 lg:grid-cols-1 gap-6 mb-6">
          <MetricsPanel />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <ExportChart />
        </div>

        <div className="mt-6">
          <EventStream />
        </div>
      </div>
    </div>
  );
};

