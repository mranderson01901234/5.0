/**
 * Event Logger for Telemetry
 * Logs structured events for analytics and monitoring
 */

export interface TelemetryEvent {
  event: string;
  [key: string]: unknown;
}

/**
 * Log a telemetry event
 * In production, this would send to an analytics service
 * For now, it logs to console with structured format
 */
export function logEvent(event: TelemetryEvent): void {
  const timestamp = Date.now();
  const eventData = {
    ...event,
    timestamp,
  };

  // Log to console in development
  if (import.meta.env.DEV) {
    console.log("[Telemetry]", eventData);
  }

  // TODO: In production, send to analytics service
  // Example: analytics.track(event.event, eventData);
}

/**
 * Specific event logger for splitview toggle
 */
export function logSplitViewToggled(enabled: boolean): void {
  logEvent({
    event: "splitview_toggled",
    enabled,
    timestamp: Date.now(),
  });
}

