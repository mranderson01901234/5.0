/**
 * Event Stream Component
 * Live feed of telemetry logs
 */

import React, { useEffect, useState, useRef } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { getEnv } from '@/utils/env';

const { VITE_API_BASE_URL } = getEnv();
const baseUrl = VITE_API_BASE_URL;

interface TelemetryEvent {
  event: string;
  userId?: string;
  threadId?: string;
  artifactId?: string;
  exportId?: string;
  format?: string;
  timestamp: number;
  [key: string]: unknown;
}

export const EventStream: React.FC = () => {
  const { getToken } = useAuth();
  const [events, setEvents] = useState<TelemetryEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    let eventSource: EventSource | null = null;

    const connect = async () => {
      try {
        const token = await getToken();
        if (!token) return;

        // EventSource doesn't support custom headers, so we'll use a fetch-based approach
        // For now, we'll use a workaround with a proxy or pass token via query param
        // Since we're using Clerk cookies, the auth should work via cookies
        const url = `${baseUrl}/api/telemetry/stream`;
        eventSource = new EventSource(url, {
          withCredentials: true,
        });

        eventSource.onopen = () => {
          setConnected(true);
        };

        eventSource.onerror = () => {
          setConnected(false);
          // Reconnect after 3 seconds
          setTimeout(connect, 3000);
        };

        eventSource.addEventListener('connected', () => {
          setConnected(true);
        });

        eventSource.addEventListener('telemetry', (e) => {
          try {
            const event: TelemetryEvent = JSON.parse(e.data);
            setEvents(prev => {
              const newEvents = [event, ...prev];
              // Keep only last 100 events
              return newEvents.slice(0, 100);
            });
          } catch (error) {
            console.error('Failed to parse telemetry event', error);
          }
        });

        eventSource.addEventListener('heartbeat', () => {
          // Keep connection alive
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

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  const getEventColor = (event: string) => {
    if (event.includes('failed') || event.includes('error')) {
      return 'text-red-400';
    }
    if (event.includes('completed')) {
      return 'text-green-400';
    }
    if (event.includes('started') || event.includes('created')) {
      return 'text-blue-400';
    }
    return 'text-white/70';
  };

  return (
    <div className="glass-light rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Event Stream</h2>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400' : 'bg-red-400'}`} />
          <span className="text-sm text-white/60">
            {connected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
      </div>

      <div className="h-96 overflow-y-auto space-y-2">
        {events.length === 0 ? (
          <div className="text-white/40 text-center py-8">
            No events yet. Waiting for telemetry...
          </div>
        ) : (
          events.map((event, idx) => (
            <div
              key={idx}
              className="text-sm p-2 rounded bg-white/5 hover:bg-white/10 transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <span className={`font-medium ${getEventColor(event.event)}`}>
                    {event.event}
                  </span>
                  <div className="text-white/60 text-xs mt-1">
                    {event.userId && <span>User: {event.userId.substring(0, 8)}...</span>}
                    {event.artifactId && <span className="ml-2">Artifact: {event.artifactId.substring(0, 8)}...</span>}
                    {event.exportId && <span className="ml-2">Export: {event.exportId.substring(0, 8)}...</span>}
                    {event.format && <span className="ml-2">Format: {event.format.toUpperCase()}</span>}
                  </div>
                </div>
                <div className="text-white/40 text-xs">
                  {formatTimestamp(event.timestamp)}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

