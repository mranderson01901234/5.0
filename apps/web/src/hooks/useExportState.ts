import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@clerk/clerk-react";
import { exportArtifact, getExportStatus } from "@/services/gateway";
import { logEvent } from "@/lib/eventLogger";
import { Artifact } from "@/store/artifactStore";

export type ExportFormat = "pdf" | "docx" | "xlsx";
export type ExportStatus = "idle" | "queued" | "processing" | "completed" | "failed";

/**
 * Hook to manage export state and polling
 * Handles export initiation, status polling, and cleanup
 */
export function useExportState(artifact: Artifact) {
  const { getToken } = useAuth();
  const [exporting, setExporting] = useState<Record<string, boolean>>({});
  const [exportStatus, setExportStatus] = useState<Record<string, ExportStatus>>({});
  const pollingIntervalsRef = useRef<Record<string, NodeJS.Timeout>>({});

  const handleExport = useCallback(async (format: ExportFormat) => {
    setExporting(prev => ({ ...prev, [format]: true }));
    setExportStatus(prev => ({ ...prev, [format]: 'queued' }));
    
    try {
      const token = await getToken();
      const result = await exportArtifact(
        {
          artifactId: artifact.id,
          format,
        },
        token || undefined
      );

      if (!result) {
        throw new Error('Export request failed');
      }

      // Log telemetry event
      logEvent({
        event: "artifact_exported",
        type: artifact.type,
        format,
        artifactId: artifact.id,
        timestamp: Date.now(),
      });

      // Start polling for status
      if (result.status === 'queued' || result.status === 'processing') {
        const exportId = result.id;
        const pollInterval = setInterval(async () => {
          try {
            const status = await getExportStatus(exportId, token || undefined);
            if (status) {
              setExportStatus(prev => ({ ...prev, [format]: status.status as ExportStatus }));
              
              if (status.status === 'completed') {
                clearInterval(pollInterval);
                delete pollingIntervalsRef.current[format];
                setExporting(prev => ({ ...prev, [format]: false }));
                
                // Open download URL
                if (status.url) {
                  window.open(status.url, '_blank');
                }
              } else if (status.status === 'failed') {
                clearInterval(pollInterval);
                delete pollingIntervalsRef.current[format];
                setExporting(prev => ({ ...prev, [format]: false }));
                alert('Export failed. Please try again.');
              }
            }
          } catch (error) {
            console.error('[useExportState] Failed to poll export status', error);
          }
        }, 1000); // Poll every second
        
        pollingIntervalsRef.current[format] = pollInterval;
      } else if (result.status === 'completed' && result.url) {
        // Already completed, open URL
        setExporting(prev => ({ ...prev, [format]: false }));
        window.open(result.url, '_blank');
      }
    } catch (error) {
      console.error('[useExportState] Failed to export artifact', error);
      setExporting(prev => ({ ...prev, [format]: false }));
      setExportStatus(prev => ({ ...prev, [format]: 'failed' }));
    }
  }, [artifact, getToken]);

  // Cleanup polling intervals on unmount
  useEffect(() => {
    const intervals = pollingIntervalsRef.current;
    return () => {
      Object.values(intervals).forEach(interval => {
        clearInterval(interval);
      });
    };
  }, []);

  const getButtonText = useCallback((format: string): string => {
    const status = exportStatus[format];
    if (exporting[format]) {
      if (status === 'queued') return 'Queued...';
      if (status === 'processing') return 'Processing...';
      return 'Exporting...';
    }
    return format.toUpperCase();
  }, [exporting, exportStatus]);

  const isExporting = useCallback((format: string): boolean => {
    return exporting[format] && (exportStatus[format] === 'queued' || exportStatus[format] === 'processing');
  }, [exporting, exportStatus]);

  return {
    handleExport,
    getButtonText,
    isExporting,
    exportStatus,
  };
}

