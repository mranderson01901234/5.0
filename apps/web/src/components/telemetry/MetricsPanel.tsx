/**
 * Metrics Panel Component
 * Shows counters for artifact_created, artifact_saved, artifact_exported
 */

import React, { useEffect, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { getEnv } from '@/utils/env';

const { VITE_API_BASE_URL } = getEnv();
const baseUrl = VITE_API_BASE_URL;

interface Metrics {
  artifact_created: number;
  artifact_saved: number;
  artifact_exported: number;
  export_job_completed: number;
  export_job_failed: number;
}

export const MetricsPanel: React.FC = () => {
  const { getToken } = useAuth();
  const [metrics, setMetrics] = useState<Metrics>({
    artifact_created: 0,
    artifact_saved: 0,
    artifact_exported: 0,
    export_job_completed: 0,
    export_job_failed: 0,
  });

  useEffect(() => {
    let eventSource: EventSource | null = null;

    const connect = async () => {
      try {
        const token = await getToken();
        if (!token) return;

        const url = `${baseUrl}/api/telemetry/stream`;
        eventSource = new EventSource(url, {
          withCredentials: true,
        });

        eventSource.addEventListener('telemetry', (e) => {
          try {
            const event = JSON.parse(e.data);
            setMetrics(prev => {
              const newMetrics = { ...prev };
              if (event.event === 'artifact_created') {
                newMetrics.artifact_created++;
              } else if (event.event === 'artifact_saved') {
                newMetrics.artifact_saved++;
              } else if (event.event === 'export_started') {
                newMetrics.artifact_exported++;
              } else if (event.event === 'export_job_completed') {
                newMetrics.export_job_completed++;
              } else if (event.event === 'export_job_failed') {
                newMetrics.export_job_failed++;
              }
              return newMetrics;
            });
          } catch (error) {
            console.error('Failed to parse telemetry event', error);
          }
        });
      } catch (error) {
        console.error('Failed to connect to telemetry stream', error);
      }
    };

    connect();

    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [getToken]);

  const MetricCard: React.FC<{ label: string; value: number; color: string }> = ({ label, value, color }) => (
    <div className="glass-light rounded-lg p-4">
      <div className="text-white/60 text-sm mb-1">{label}</div>
      <div className={`text-3xl font-bold ${color}`}>{value}</div>
    </div>
  );

  return (
    <div className="lg:col-span-3 grid grid-cols-1 md:grid-cols-5 gap-4">
      <MetricCard label="Artifacts Created" value={metrics.artifact_created} color="text-blue-400" />
      <MetricCard label="Artifacts Saved" value={metrics.artifact_saved} color="text-green-400" />
      <MetricCard label="Exports Started" value={metrics.artifact_exported} color="text-purple-400" />
      <MetricCard label="Exports Completed" value={metrics.export_job_completed} color="text-green-400" />
      <MetricCard label="Exports Failed" value={metrics.export_job_failed} color="text-red-400" />
    </div>
  );
};

