/**
 * Export Chart Component
 * Time-based export events per hour using Recharts
 */

import React, { useEffect, useState, useMemo } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { getEnv } from '@/utils/env';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const { VITE_API_BASE_URL } = getEnv();
const baseUrl = VITE_API_BASE_URL;

interface TelemetryEvent {
  event: string;
  timestamp: number;
  [key: string]: unknown;
}

export const ExportChart: React.FC = () => {
  const { getToken } = useAuth();
  const [events, setEvents] = useState<TelemetryEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const eventSourceRef = React.useRef<EventSource | null>(null);

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

        eventSource.onopen = () => {
          setConnected(true);
        };

        eventSource.onerror = () => {
          setConnected(false);
          setTimeout(connect, 3000);
        };

        eventSource.addEventListener('telemetry', (e) => {
          try {
            const event: TelemetryEvent = JSON.parse(e.data);
            if (event.event === 'export_started' || event.event === 'export_job_completed' || event.event === 'export_job_failed') {
              setEvents(prev => {
                const newEvents = [event, ...prev];
                // Keep only last 1000 export events
                return newEvents.filter(ev => 
                  ev.event === 'export_started' || 
                  ev.event === 'export_job_completed' || 
                  ev.event === 'export_job_failed'
                ).slice(0, 1000);
              });
            }
          } catch (error) {
            console.error('Failed to parse telemetry event', error);
          }
        });

        eventSourceRef.current = eventSource;
      } catch (error) {
        console.error('Failed to connect to telemetry stream', error);
        setConnected(false);
      }
    };

    connect();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [getToken]);

  // Group events by hour
  const chartData = useMemo(() => {
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;
    
    // Filter events from last hour
    const recentEvents = events.filter(e => e.timestamp >= oneHourAgo);
    
    // Group by hour
    const hourlyData: Record<number, { hour: string; started: number; completed: number; failed: number }> = {};
    
    recentEvents.forEach(event => {
      const hour = new Date(event.timestamp).getHours();
      const hourKey = `${hour}:00`;
      
      if (!hourlyData[hour]) {
        hourlyData[hour] = { hour: hourKey, started: 0, completed: 0, failed: 0 };
      }
      
      if (event.event === 'export_started') {
        hourlyData[hour].started++;
      } else if (event.event === 'export_job_completed') {
        hourlyData[hour].completed++;
      } else if (event.event === 'export_job_failed') {
        hourlyData[hour].failed++;
      }
    });
    
    // Convert to array and sort by hour
    return Object.values(hourlyData).sort((a, b) => {
      const hourA = parseInt(a.hour.split(':')[0]);
      const hourB = parseInt(b.hour.split(':')[0]);
      return hourA - hourB;
    });
  }, [events]);

  return (
    <div className="glass-light rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Export Events per Hour</h2>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400' : 'bg-red-400'}`} />
          <span className="text-sm text-white/60">
            {connected ? 'Live' : 'Offline'}
          </span>
        </div>
      </div>

      {chartData.length === 0 ? (
        <div className="h-64 flex items-center justify-center text-white/40">
          No export events yet
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff20" />
            <XAxis 
              dataKey="hour" 
              stroke="#ffffff60"
              style={{ fontSize: '12px' }}
            />
            <YAxis 
              stroke="#ffffff60"
              style={{ fontSize: '12px' }}
            />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: '#1a1a1a', 
                border: '1px solid #ffffff20',
                borderRadius: '8px',
                color: '#fff'
              }}
            />
            <Legend 
              wrapperStyle={{ color: '#ffffff80' }}
            />
            <Line 
              type="monotone" 
              dataKey="started" 
              stroke="#3b82f6" 
              strokeWidth={2}
              name="Started"
              dot={false}
            />
            <Line 
              type="monotone" 
              dataKey="completed" 
              stroke="#10b981" 
              strokeWidth={2}
              name="Completed"
              dot={false}
            />
            <Line 
              type="monotone" 
              dataKey="failed" 
              stroke="#ef4444" 
              strokeWidth={2}
              name="Failed"
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
};

