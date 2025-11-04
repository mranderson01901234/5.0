import React, { useState, useEffect } from 'react';
import { type Artifact, type ImageArtifact } from '@/store/artifactStore';
import { exportArtifact, getExportStatus } from '@/services/gateway';
import { useAuth } from '@clerk/clerk-react';
import { logEvent } from '@/lib/eventLogger';
import { Table as TableIcon, FileText, Sheet, ChevronDown, ChevronUp, Download, Copy, Image as ImageIcon } from 'lucide-react';
import ArtifactImage from './ArtifactImage';

type ExportStatus = 'idle' | 'queued' | 'processing' | 'completed' | 'failed';

interface ExportState {
  status: ExportStatus;
  exportId?: string;
  url?: string;
}

type Props = {
  artifact: Artifact;
  isExpanded?: boolean;
};

const ArtifactMessageCard: React.FC<Props> = ({ artifact, isExpanded: initialExpanded = true }) => {
  const [expanded, setExpanded] = useState(initialExpanded);
  const [exportStates, setExportStates] = useState<Record<string, ExportState>>({});
  const [imageControls, setImageControls] = useState<React.ReactNode>(null);
  const { getToken } = useAuth();

  // Poll export status for active exports
  useEffect(() => {
    const pollInterval = setInterval(async () => {
      const activeExports = Object.entries(exportStates).filter(
        ([_, state]) => state.status === 'queued' || state.status === 'processing'
      );

      if (activeExports.length === 0) return;

      const token = await getToken();

      // Batch all status checks first
      const updates: Record<string, ExportState> = {};
      const urlsToOpen: string[] = [];

      for (const [format, state] of activeExports) {
        if (!state.exportId) continue;

        try {
          const status = await getExportStatus(state.exportId, token || undefined);
          updates[format] = {
            status: status.status,
            exportId: status.id,
            url: status.url,
          };

          // If completed, mark URL to open
          if (status.status === 'completed' && status.url && !state.url) {
            urlsToOpen.push(status.url);
          }
        } catch (error) {
          console.error(`[ArtifactMessageCard] Failed to poll export status for ${format}:`, error);
          updates[format] = { ...state, status: 'failed' };
        }
      }

      // Single batched state update
      if (Object.keys(updates).length > 0) {
        setExportStates((prev) => ({ ...prev, ...updates }));

        // Open URLs after state update
        urlsToOpen.forEach(url => window.open(url, '_blank'));
      }
    }, 2000); // Poll every 2 seconds

    return () => clearInterval(pollInterval);
  }, [exportStates, getToken]);

  const handleExport = async (format: 'pdf' | 'docx' | 'xlsx') => {
    // Only allow exports for matching types
    if (format === 'pdf' && artifact.type !== 'doc') return;
    if (format === 'docx' && artifact.type !== 'doc') return;
    if (format === 'xlsx' && artifact.type !== 'table' && artifact.type !== 'sheet') return;

    const token = await getToken();
    setExportStates((prev) => ({
      ...prev,
      [format]: { status: 'queued' },
    }));

    try {
      const result = await exportArtifact(
        {
          artifactId: artifact.id,
          format,
        },
        token || undefined
      );

      setExportStates((prev) => ({
        ...prev,
        [format]: {
          status: result.status,
          exportId: result.id,
          url: result.url,
        },
      }));

      // Log telemetry
      logEvent({
        event: 'artifact_export_clicked',
        artifactId: artifact.id,
        format,
        timestamp: Date.now(),
      });

      // If already completed, open download
      if (result.status === 'completed' && result.url) {
        window.open(result.url, '_blank');
      }
    } catch (error) {
      console.error(`[ArtifactMessageCard] Failed to export ${format}:`, error);
      setExportStates((prev) => ({
        ...prev,
        [format]: { status: 'failed' },
      }));
    }
  };

  const handleCopyCSV = () => {
    if (artifact.type !== 'table') return;
    const tableData = artifact.data as string[][] | undefined;
    if (!tableData || tableData.length === 0) return;

    // Convert table to CSV
    const csv = tableData
      .map((row) =>
        row
          .map((cell) => {
            // Escape quotes and wrap in quotes if contains comma, quote, or newline
            const escaped = String(cell || '').replace(/"/g, '""');
            if (escaped.includes(',') || escaped.includes('"') || escaped.includes('\n')) {
              return `"${escaped}"`;
            }
            return escaped;
          })
          .join(',')
      )
      .join('\n');

    navigator.clipboard.writeText(csv).catch((error) => {
      console.error('[ArtifactMessageCard] Failed to copy CSV:', error);
    });
  };

  const getTypeIcon = () => {
    switch (artifact.type) {
      case 'table':
        return <TableIcon className="w-4 h-4 text-white/70" />;
      case 'doc':
        return <FileText className="w-4 h-4 text-white/70" />;
      case 'sheet':
        return <Sheet className="w-4 h-4 text-white/70" />;
      case 'image':
        return <ImageIcon className="w-4 h-4 text-white/70" />;
      default:
        return null;
    }
  };

  const getTypeLabel = () => {
    switch (artifact.type) {
      case 'table':
        return 'Table';
      case 'doc':
        return 'Document';
      case 'sheet':
        return 'Spreadsheet';
      case 'image':
        return 'Image';
      default:
        return 'Artifact';
    }
  };

  const getExportButtonLabel = (format: string, state: ExportState) => {
    if (state.status === 'queued') return 'Queued';
    if (state.status === 'processing') return 'Processing';
    if (state.status === 'completed') return 'Download';
    if (state.status === 'failed') return 'Failed';
    return format.toUpperCase();
  };

  // Strip markdown bold markers (**text**) from table cell content
  const stripMarkdownBold = (text: string): string => {
    if (!text) return text;
    // Remove ** markers but preserve the text content
    return text.replace(/\*\*/g, '');
  };

  const renderContent = () => {
    if (artifact.type === 'image') {
      return <ArtifactImage artifact={artifact as ImageArtifact} onRenderControls={setImageControls} />;
    }
    
    if (artifact.type === 'table') {
      const tableData = artifact.data as string[][] | undefined;
      if (!tableData || tableData.length === 0) {
        return (
          <div className="p-4 text-sm text-white/60 bg-white/5 rounded">
            <p>Empty table data</p>
          </div>
        );
      }

      const headers = tableData[0] || [];
      const rows = tableData.slice(1);

      return (
        <div className="w-full overflow-x-auto artifact-table-scroll">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-white/10 bg-white/5">
                {headers.map((header, idx) => (
                  <th
                    key={idx}
                    className="px-3 py-2 text-left text-white/90 font-semibold text-xs uppercase tracking-wider whitespace-nowrap"
                  >
                    {stripMarkdownBold(header || `Column ${idx + 1}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIdx) => (
                <tr
                  key={rowIdx}
                  className={`border-b border-white/5 hover:bg-white/5 transition-colors ${
                    rowIdx % 2 === 0 ? 'bg-white/2' : ''
                  }`}
                >
                  {headers.map((_, colIdx) => (
                    <td
                      key={colIdx}
                      className="px-3 py-2 text-white/80 text-sm whitespace-nowrap"
                    >
                      {stripMarkdownBold(row[colIdx] || '')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    if (artifact.type === 'doc') {
      return (
        <div className="p-4 text-sm text-white/70 bg-white/5 rounded">
          <p>Document rendering not yet implemented</p>
        </div>
      );
    }

    if (artifact.type === 'sheet') {
      return (
        <div className="p-4 text-sm text-white/70 bg-white/5 rounded">
          <p>Spreadsheet rendering not yet implemented</p>
        </div>
      );
    }

    return (
      <div className="p-4 text-sm text-white/60 bg-white/5 rounded">
        <p>Unknown artifact type</p>
      </div>
    );
  };

  return (
    <div
      id={`artifact-${artifact.id}`}
      data-artifact-id={artifact.id}
      className="rounded-xl border border-white/10 bg-neutral-900/80 shadow-sm overflow-hidden my-4"
    >
      {/* Header - sticky within card */}
      <header className="sticky top-0 z-10 bg-neutral-900/90 backdrop-blur border-b border-white/10 px-3 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {getTypeIcon()}
          <h3 className="text-sm font-semibold text-white/90 truncate">{getTypeLabel()}</h3>
          <button
            onClick={() => setExpanded(!expanded)}
            className="ml-2 p-1 rounded hover:bg-white/10 transition-colors"
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded ? (
              <ChevronUp className="w-4 h-4 text-white/70" />
            ) : (
              <ChevronDown className="w-4 h-4 text-white/70" />
            )}
          </button>
        </div>

        {/* Export buttons or image controls */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {artifact.type === 'image' && imageControls}

          {artifact.type === 'table' && (
            <button
              onClick={handleCopyCSV}
              className="px-2 py-1 text-xs rounded bg-white/10 hover:bg-white/20 transition-colors text-white/80 flex items-center gap-1"
              title="Copy CSV"
            >
              <Copy className="w-3 h-3" />
              CSV
            </button>
          )}

          {artifact.type === 'table' && (
            <button
              onClick={() => handleExport('xlsx')}
              disabled={exportStates.xlsx?.status === 'queued' || exportStates.xlsx?.status === 'processing'}
              className="px-2 py-1 text-xs rounded bg-white/10 hover:bg-white/20 transition-colors text-white/80 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
              title="Export to XLSX"
            >
              <Download className="w-3 h-3" />
              {exportStates.xlsx
                ? getExportButtonLabel('xlsx', exportStates.xlsx)
                : 'XLSX'}
            </button>
          )}

          {artifact.type === 'doc' && (
            <>
              <button
                onClick={() => handleExport('pdf')}
                disabled={exportStates.pdf?.status === 'queued' || exportStates.pdf?.status === 'processing'}
                className="px-2 py-1 text-xs rounded bg-white/10 hover:bg-white/20 transition-colors text-white/80 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                title="Export to PDF"
              >
                <Download className="w-3 h-3" />
                {exportStates.pdf
                  ? getExportButtonLabel('pdf', exportStates.pdf)
                  : 'PDF'}
              </button>
              <button
                onClick={() => handleExport('docx')}
                disabled={exportStates.docx?.status === 'queued' || exportStates.docx?.status === 'processing'}
                className="px-2 py-1 text-xs rounded bg-white/10 hover:bg-white/20 transition-colors text-white/80 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                title="Export to DOCX"
              >
                <Download className="w-3 h-3" />
                {exportStates.docx
                  ? getExportButtonLabel('docx', exportStates.docx)
                  : 'DOCX'}
              </button>
            </>
          )}

          {artifact.type === 'sheet' && (
            <button
              onClick={() => handleExport('xlsx')}
              disabled={exportStates.xlsx?.status === 'queued' || exportStates.xlsx?.status === 'processing'}
              className="px-2 py-1 text-xs rounded bg-white/10 hover:bg-white/20 transition-colors text-white/80 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
              title="Export to XLSX"
            >
              <Download className="w-3 h-3" />
              {exportStates.xlsx
                ? getExportButtonLabel('xlsx', exportStates.xlsx)
                : 'XLSX'}
            </button>
          )}
        </div>
      </header>

      {/* Content container */}
      {expanded && (
        <div className={artifact.type === 'image' ? 'h-[70vh]' : 'max-h-[55vh] overflow-y-auto overscroll-contain scroll-smooth p-0 artifact-content-scroll'}>
          {renderContent()}
        </div>
      )}
    </div>
  );
};

export default ArtifactMessageCard;

