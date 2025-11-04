import React from "react";
import { useUIStore } from "@/store/uiStore";
import { useArtifactStore, TableArtifact, Artifact } from "@/store/artifactStore";
import { exportArtifact, getExportStatus } from "@/services/gateway";
import { useAuth } from "@clerk/clerk-react";
import { logEvent } from "@/lib/eventLogger";
import { Download, Loader2, X, FileText, Table as TableIcon, Sheet } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { useChatStore } from "@/store/chatStore";
import useAutoFocusArtifact from "@/hooks/useAutoFocusArtifact";

interface ArtifactPaneProps {
  width?: number; // Percentage
}

/**
 * ArtifactPane - Right panel for artifact creation
 * Shows empty state when no artifact is selected
 */
export const ArtifactPane: React.FC<ArtifactPaneProps> = ({ width = 50 }) => {
  const { currentArtifactId, setCurrentArtifact, setSplitView, setLastSplitCloseTs } = useUIStore();
  const { getArtifactById, getLatestArtifactForThread } = useArtifactStore();
  const { currentThreadId } = useChatStore();
  const [, setSearchParams] = useSearchParams();
  const [fallbackUsed, setFallbackUsed] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = React.useState(0);
  const [showInstrumentation, setShowInstrumentation] = React.useState(false);

  // Find artifact by ID
  const artifact = currentArtifactId ? getArtifactById(currentArtifactId) : null;
  
  // Get latest artifact for thread as fallback
  const latestForThread = currentThreadId ? getLatestArtifactForThread(currentThreadId) : null;

  // Runtime instrumentation: Log scroll owners on mount (dev mode)
  React.useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      const owners = [...document.querySelectorAll('*')].filter(e => {
        const cs = getComputedStyle(e);
        return /(auto|scroll)/.test(cs.overflowY);
      }).map(e => ({
        el: e,
        className: e.className,
        id: e.id,
        overflowY: getComputedStyle(e).overflowY
      }));
      console.log('[scroll-owners]', owners);
    }
  }, []);

  // Track scroll position for instrumentation overlay
  React.useEffect(() => {
    const container = scrollRef.current;
    if (!container || process.env.NODE_ENV !== 'development') {
      setShowInstrumentation(false);
      return;
    }

    setShowInstrumentation(true);
    const handleScroll = () => {
      setScrollTop(container.scrollTop);
    };
    container.addEventListener('scroll', handleScroll);
    return () => {
      container.removeEventListener('scroll', handleScroll);
      setShowInstrumentation(false);
    };
  }, [artifact]); // Re-run when artifact changes

  // Auto-focus artifact when it changes
  useAutoFocusArtifact(scrollRef);
  
  // Fallback: if currentArtifactId is not found, try a one-frame defer with requestAnimationFrame
  React.useEffect(() => {
    if (!artifact && latestForThread) {
      // Defensive fallback - use requestAnimationFrame to avoid render flicker
      requestAnimationFrame(() => {
        const currentState = useUIStore.getState();
        // Double-check that we still don't have an artifact and latest is still valid
        if (!currentState.currentArtifactId && latestForThread) {
          console.log('[ArtifactPane] Fallback to latest artifact:', latestForThread.id);
          setFallbackUsed(true);
          setCurrentArtifact(latestForThread.id);
        }
      });
    } else if (artifact) {
      setFallbackUsed(false);
    }
  }, [artifact, latestForThread, setCurrentArtifact]);

  const handleClose = () => {
    setCurrentArtifact(null);
    setSplitView(false);
    setLastSplitCloseTs(Date.now()); // Track manual close for debounce
    setSearchParams({ view: "chat" }, { replace: true });
  };

  const renderArtifactContent = (artifact: Artifact) => {
    if (artifact.type === "table" && artifact.data) {
      return <TableRenderer artifact={artifact as TableArtifact} />;
    }
    if (artifact.type === "doc") {
      return <DocumentRenderer artifact={artifact} />;
    }
    if (artifact.type === "sheet") {
      return <SheetRenderer artifact={artifact} />;
    }
    return (
      <div className="text-white/70 text-sm">
        Artifact {artifact.id} - Type: {artifact.type} - Rendering not yet implemented
      </div>
    );
  };

  const showDevOverlay = process.env.NODE_ENV === 'development' && showInstrumentation && scrollRef.current;

  // Prevent any wheel/scroll events on the artifact pane
  const handleWheel = React.useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  return (
    <div
      className="artifact-pane flex flex-col backdrop-blur-xl"
      role="complementary"
      aria-label="Artifact creation pane"
      onWheel={handleWheel}
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        width: '100%',
        overflow: 'hidden',
        background: '#0f0f0f',
        borderLeft: '1px solid rgba(255,255,255,0.1)',
        pointerEvents: 'auto'
      }}
    >
      {artifact ? (
        <>
          <div className="h-full min-h-0 flex flex-col overflow-hidden">
            {/* Header */}
            <header className="sticky top-0 z-10 bg-[#0f0f0f]/80 backdrop-blur border-b border-white/10 flex-shrink-0">
              <div className="p-4">
                {/* Close button */}
                <div className="flex justify-end mb-2">
                  <button
                    onClick={handleClose}
                    className="text-white/60 hover:text-white/90 transition-colors p-1 rounded hover:bg-white/5"
                    aria-label="Close artifact pane"
                    title="Close artifact pane (Esc)"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                {/* Fallback banner */}
                {fallbackUsed && (
                  <div className="mb-2 px-3 py-1.5 bg-blue-500/10 border border-blue-500/20 rounded text-blue-400 text-xs">
                    Showing latest artifact
                  </div>
                )}
              </div>
            </header>
            {/* Content - No scrolling, static display */}
            <div 
              id="artifact-scroll"
              ref={scrollRef}
              className="flex-1 min-h-0 overflow-hidden"
            >
              <section className="p-4">
                {renderArtifactContent(artifact)}
              </section>
            </div>
            {showDevOverlay && (
              <div
                className="fixed bottom-4 right-4 z-50 bg-black/80 text-white text-xs p-2 rounded font-mono"
                style={{ pointerEvents: 'none' }}
              >
                <div>owner: {getComputedStyle(scrollRef.current!).overflowY}</div>
                <div>scrollTop: {scrollTop}</div>
              </div>
            )}
          </div>
        </>
      ) : (
        <ArtifactEmptyState />
      )}
    </div>
  );
};

/**
 * Table Renderer Component
 * Renders a table artifact with proper styling
 */
const TableRenderer: React.FC<{ artifact: TableArtifact }> = ({ artifact }) => {
  const { data } = artifact;

  if (!data || data.length === 0) {
    return (
      <div className="text-white/70 text-sm">
        Empty table
      </div>
    );
  }

  const headers = data[0] || [];
  const rows = data.slice(1);

  return (
    <div className="flex flex-col">
      <div className="mb-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <TableIcon className="w-5 h-5 text-white/70" />
          <div>
            <h2 className="text-white/90 text-lg font-semibold mb-1">Table</h2>
            <p className="text-white/60 text-xs">
              {rows.length} row{rows.length !== 1 ? 's' : ''}, {headers.length} column{headers.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <ExportButtons artifact={artifact} />
      </div>

      <div className="border border-white/10 rounded-lg">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-white/10 bg-white/5">
              {headers.map((header, idx) => (
                <th
                  key={idx}
                  className="px-4 py-3 text-left text-white/90 font-semibold text-xs uppercase tracking-wider"
                >
                  {header || `Column ${idx + 1}`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIdx) => (
              <tr
                key={rowIdx}
                className="border-b border-white/5 hover:bg-white/5 transition-colors"
              >
                {headers.map((_, colIdx) => (
                  <td
                    key={colIdx}
                    className="px-4 py-3 text-white/80 text-sm"
                  >
                    {row[colIdx] || ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

/**
 * Export Button Component - Reusable for all artifact types
 */
const ExportButtons: React.FC<{ artifact: Artifact }> = ({ artifact }) => {
  const { getToken } = useAuth();
  const [exporting, setExporting] = React.useState<Record<string, boolean>>({});
  const [exportStatus, setExportStatus] = React.useState<Record<string, string>>({});
  const pollingIntervalsRef = React.useRef<Record<string, NodeJS.Timeout>>({});

  const handleExport = async (format: "pdf" | "docx" | "xlsx") => {
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
              setExportStatus(prev => ({ ...prev, [format]: status.status }));
              
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
            console.error('[ExportButtons] Failed to poll export status', error);
          }
        }, 1000); // Poll every second
        
        pollingIntervalsRef.current[format] = pollInterval;
      } else if (result.status === 'completed' && result.url) {
        // Already completed, open URL
        setExporting(prev => ({ ...prev, [format]: false }));
        window.open(result.url, '_blank');
      }
    } catch (error) {
      console.error('[ExportButtons] Failed to export artifact', error);
      setExporting(prev => ({ ...prev, [format]: false }));
      setExportStatus(prev => ({ ...prev, [format]: 'failed' }));
    }
  };

  // Cleanup polling intervals on unmount
  React.useEffect(() => {
    const intervals = pollingIntervalsRef.current;
    return () => {
      Object.values(intervals).forEach(interval => {
        clearInterval(interval);
      });
    };
  }, []);

  const getButtonText = (format: string) => {
    const status = exportStatus[format];
    if (exporting[format]) {
      if (status === 'queued') return 'Queued...';
      if (status === 'processing') return 'Processing...';
      return 'Exporting...';
    }
    return format.toUpperCase();
  };

  const isExporting = (format: string) => {
    return exporting[format] && (exportStatus[format] === 'queued' || exportStatus[format] === 'processing');
  };

  // Determine which formats are supported for each artifact type
  const getSupportedFormats = (): Array<"pdf" | "docx" | "xlsx"> => {
    switch (artifact.type) {
      case "table":
        return ["pdf", "docx", "xlsx"];
      case "doc":
        return ["pdf", "docx"]; // Documents can export as PDF or DOCX
      case "sheet":
        return ["pdf", "xlsx"]; // Sheets can export as PDF or XLSX
      default:
        return ["pdf", "docx", "xlsx"];
    }
  };

  const supportedFormats = getSupportedFormats();

  return (
    <div className="flex gap-2">
      {supportedFormats.includes("pdf") && (
        <button
          onClick={() => handleExport('pdf')}
          disabled={isExporting('pdf')}
          className="px-3 py-1.5 text-xs glass-light text-white/70 hover:text-white rounded-md transition-colors duration-200 flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
          title="Export as PDF"
        >
          {isExporting('pdf') ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Download className="w-3.5 h-3.5" />
          )}
          {getButtonText('pdf')}
        </button>
      )}
      {supportedFormats.includes("docx") && (
        <button
          onClick={() => handleExport('docx')}
          disabled={isExporting('docx')}
          className="px-3 py-1.5 text-xs glass-light text-white/70 hover:text-white rounded-md transition-colors duration-200 flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
          title="Export as DOCX"
        >
          {isExporting('docx') ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <FileText className="w-3.5 h-3.5" />
          )}
          {getButtonText('docx')}
        </button>
      )}
      {supportedFormats.includes("xlsx") && (
        <button
          onClick={() => handleExport('xlsx')}
          disabled={isExporting('xlsx')}
          className="px-3 py-1.5 text-xs glass-light text-white/70 hover:text-white rounded-md transition-colors duration-200 flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
          title="Export as XLSX"
        >
          {isExporting('xlsx') ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Sheet className="w-3.5 h-3.5" />
          )}
          {getButtonText('xlsx')}
        </button>
      )}
    </div>
  );
};

/**
 * Document Renderer Component
 */
const DocumentRenderer: React.FC<{ artifact: Artifact }> = ({ artifact }) => {
  const data = artifact.data as any;
  
  return (
    <div className="flex flex-col">
      <div className="mb-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-white/70" />
          <div>
            <h2 className="text-white/90 text-lg font-semibold mb-1">Document</h2>
            <p className="text-white/60 text-xs">
              {data?.sections?.length || 0} section{(data?.sections?.length || 0) !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <ExportButtons artifact={artifact} />
      </div>
      
      <div className="border border-white/10 rounded-lg p-4">
        {data?.title && (
          <h1 className="text-white/90 text-2xl font-bold mb-4">{data.title}</h1>
        )}
        {data?.sections && data.sections.length > 0 ? (
          <div className="space-y-4">
            {data.sections.map((section: any, idx: number) => (
              <div key={idx} className="space-y-2">
                {section.heading && (
                  <h2 className={`text-white/90 font-semibold ${
                    section.level === 1 ? 'text-xl' :
                    section.level === 2 ? 'text-lg' :
                    section.level === 3 ? 'text-base' : 'text-sm'
                  }`}>
                    {section.heading}
                  </h2>
                )}
                {section.content && (
                  <p className="text-white/70 text-sm whitespace-pre-wrap">{section.content}</p>
                )}
              </div>
            ))}
          </div>
        ) : data?.content ? (
          <p className="text-white/70 text-sm whitespace-pre-wrap">{data.content}</p>
        ) : (
          <div className="text-white/70 text-sm">Empty document</div>
        )}
      </div>
    </div>
  );
};

/**
 * Sheet Renderer Component
 */
const SheetRenderer: React.FC<{ artifact: Artifact }> = ({ artifact }) => {
  const data = artifact.data as any;
  
  return (
    <div className="flex flex-col">
      <div className="mb-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <Sheet className="w-5 h-5 text-white/70" />
          <div>
            <h2 className="text-white/90 text-lg font-semibold mb-1">Spreadsheet</h2>
            <p className="text-white/60 text-xs">
              {data?.sheets?.length || 0} sheet{(data?.sheets?.length || 0) !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <ExportButtons artifact={artifact} />
      </div>
      
      <div className="border border-white/10 rounded-lg p-4">
        {data?.title && (
          <h1 className="text-white/90 text-xl font-bold mb-4">{data.title}</h1>
        )}
        {data?.sheets && data.sheets.length > 0 ? (
          <div className="space-y-6">
            {data.sheets.map((sheet: any, sheetIdx: number) => (
              <div key={sheetIdx} className="space-y-2">
                <h3 className="text-white/90 font-semibold text-base">{sheet.name || `Sheet ${sheetIdx + 1}`}</h3>
                {sheet.columns && sheet.columns.length > 0 && sheet.rows ? (
                  <div>
                    <table className="w-full border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-white/10 bg-white/5">
                          {sheet.columns.map((col: string, idx: number) => (
                            <th
                              key={idx}
                              className="px-4 py-3 text-left text-white/90 font-semibold text-xs uppercase tracking-wider"
                            >
                              {col || `Column ${idx + 1}`}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {sheet.rows.slice(0, 50).map((row: any[], rowIdx: number) => (
                          <tr
                            key={rowIdx}
                            className="border-b border-white/5 hover:bg-white/5 transition-colors"
                          >
                            {sheet.columns.map((_: any, colIdx: number) => (
                              <td
                                key={colIdx}
                                className="px-4 py-3 text-white/80 text-sm"
                              >
                                {row[colIdx] || ''}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {sheet.rows.length > 50 && (
                      <p className="text-white/60 text-xs mt-2">
                        Showing first 50 rows of {sheet.rows.length}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-white/60 text-sm">Empty sheet</p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-white/70 text-sm">Empty spreadsheet</div>
        )}
      </div>
    </div>
  );
};

/**
 * Empty state component when no artifact is selected
 */
const ArtifactEmptyState: React.FC = () => {
  const { setSplitView, setLastSplitCloseTs } = useUIStore();
  const [, setSearchParams] = useSearchParams();

  const handleClose = () => {
    setSplitView(false);
    setLastSplitCloseTs(Date.now()); // Track manual close for debounce
    setSearchParams({ view: "chat" }, { replace: true });
  };

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="text-center max-w-md">
        {/* Close button */}
        <div className="flex justify-end mb-4">
          <button
            onClick={handleClose}
            className="text-white/60 hover:text-white/90 transition-colors p-1 rounded hover:bg-white/5"
            aria-label="Close artifact pane"
            title="Close artifact pane (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Icon placeholder */}
        <div className="mb-6 flex justify-center">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-500/60 to-blue-500/60 opacity-60 flex items-center justify-center">
            <svg
              className="w-8 h-8 text-white/70"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          </div>
        </div>

        <h2 className="text-white/90 text-lg font-semibold mb-2">
          No artifact created yet
        </h2>
        <p className="text-white/70 text-sm mb-6">
          Artifacts will appear here when you create tables, documents, or
          spreadsheets.
        </p>

        {/* Placeholder buttons - will be functional in Phase 3 */}
        <div className="flex gap-3 justify-center">
          <button
            className="px-4 py-2 text-sm glass-light text-white/70 hover:text-white rounded-md transition-colors duration-200"
            disabled
          >
            Create Table
          </button>
          <button
            className="px-4 py-2 text-sm glass-light text-white/70 hover:text-white rounded-md transition-colors duration-200"
            disabled
          >
            Create Document
          </button>
          <button
            className="px-4 py-2 text-sm glass-light text-white/70 hover:text-white rounded-md transition-colors duration-200"
            disabled
          >
            Create Sheet
          </button>
        </div>
      </div>
    </div>
  );
};
