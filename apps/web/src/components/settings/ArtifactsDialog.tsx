import React, { useEffect, useState, useMemo } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { X, Download, Trash2, Image as ImageIcon, Table as TableIcon, FileText, Sheet, ChevronRight } from 'lucide-react';
import { useArtifactStore } from '@/store/artifactStore';
import { useChatStore } from '@/store/chatStore';
import { useUIStore } from '@/store/uiStore';
import type { Artifact, TableArtifact, ImageArtifact } from '@/store/artifactStore';
import { cn } from '@/lib/utils';
import { exportArtifact, getExportStatus } from '@/services/gateway';

interface ArtifactsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ExportStatus = 'idle' | 'queued' | 'processing' | 'completed' | 'failed';

interface ExportState {
  status: ExportStatus;
  exportId?: string;
  url?: string;
}

const ArtifactsDialog: React.FC<ArtifactsDialogProps> = ({ open, onOpenChange }) => {
  const { getToken } = useAuth();
  // Subscribe to artifacts array - Zustand already handles shallow comparison
  const artifacts = useArtifactStore((s) => s.artifacts);
  const removeArtifact = useArtifactStore((s) => s.removeArtifact);
  const currentThreadId = useChatStore((s) => s.currentThreadId);
  const switchConversation = useChatStore((s) => s.switchConversation);
  const setCurrentArtifact = useUIStore((s) => s.setCurrentArtifact);
  const setSplitView = useUIStore((s) => s.setSplitView);
  const [loading, setLoading] = useState(false);
  const [exportStates, setExportStates] = useState<Record<string, ExportState>>({});
  const [deleting, setDeleting] = useState<Set<string>>(new Set());

  // Handle click outside to close
  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const modal = document.querySelector('[data-artifacts-modal]');
      if (modal && !modal.contains(target)) {
        onOpenChange(false);
      }
    };

    // Small delay to avoid immediate closure
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [open, onOpenChange]);

  // Load artifacts for current thread when dialog opens
  useEffect(() => {
    if (open && currentThreadId) {
      setLoading(true);
      getToken()
        .then((token) => {
          return useArtifactStore.getState().loadArtifacts(currentThreadId, token || undefined);
        })
        .then(() => setLoading(false))
        .catch((error) => {
          console.error('[ArtifactsDialog] Failed to load artifacts:', error);
          setLoading(false);
        });
    }
  }, [open, currentThreadId, getToken]);

  // Poll export status for active exports
  useEffect(() => {
    const pollInterval = setInterval(async () => {
      const activeExports = Object.entries(exportStates).filter(
        ([_, state]) => state.status === 'queued' || state.status === 'processing'
      );

      if (activeExports.length === 0) return;

      const token = await getToken();
      for (const [key, state] of activeExports) {
        if (!state.exportId) continue;

        try {
          const status = await getExportStatus(state.exportId, token || undefined);
          setExportStates((prev) => ({
            ...prev,
            [key]: {
              status: status.status,
              exportId: status.id,
              url: status.url,
            },
          }));

          // If completed, open download link
          if (status.status === 'completed' && status.url && !state.url) {
            window.open(status.url, '_blank');
          }
        } catch (error) {
          console.error(`[ArtifactsDialog] Failed to poll export status for ${key}:`, error);
          setExportStates((prev) => ({
            ...prev,
            [key]: { ...prev[key], status: 'failed' },
          }));
        }
      }
    }, 2000);

    return () => clearInterval(pollInterval);
  }, [exportStates, getToken]);

  // Group artifacts by type, then by thread
  const artifactsByType = artifacts.reduce((acc, artifact) => {
    if (!acc[artifact.type]) {
      acc[artifact.type] = {};
    }
    if (!acc[artifact.type][artifact.threadId]) {
      acc[artifact.type][artifact.threadId] = [];
    }
    acc[artifact.type][artifact.threadId].push(artifact);
    return acc;
  }, {} as Record<string, Record<string, (TableArtifact | ImageArtifact | Artifact)[]>>);

  const handleArtifactClick = (artifact: TableArtifact | ImageArtifact | Artifact) => {
    // Switch to the artifact's thread if not already there
    if (artifact.threadId !== currentThreadId) {
      switchConversation(artifact.threadId);
    }

    // Open the artifact in split view
    setCurrentArtifact(artifact.id);
    setSplitView(true);

    // Close the dialog
    onOpenChange(false);
  };

  const handleDelete = async (e: React.MouseEvent, artifact: TableArtifact | ImageArtifact | Artifact) => {
    e.stopPropagation();
    if (deleting.has(artifact.id)) return;

    setDeleting((prev) => new Set(prev).add(artifact.id));
    try {
      const token = await getToken();
      await removeArtifact(artifact.id, token || undefined);
    } catch (error) {
      console.error('[ArtifactsDialog] Failed to delete artifact:', error);
    } finally {
      setDeleting((prev) => {
        const next = new Set(prev);
        next.delete(artifact.id);
        return next;
      });
    }
  };

  const handleExport = async (e: React.MouseEvent, artifact: TableArtifact | ImageArtifact | Artifact, format: 'pdf' | 'docx' | 'xlsx') => {
    e.stopPropagation();
    
    // Only allow exports for matching types
    if (format === 'pdf' && artifact.type !== 'doc') return;
    if (format === 'docx' && artifact.type !== 'doc') return;
    if (format === 'xlsx' && artifact.type !== 'table' && artifact.type !== 'sheet') return;

    const key = `${artifact.id}-${format}`;
    const token = await getToken();
    
    setExportStates((prev) => ({
      ...prev,
      [key]: { status: 'queued' },
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
        [key]: {
          status: result.status,
          exportId: result.id,
          url: result.url,
        },
      }));

      // If already completed, open download
      if (result.status === 'completed' && result.url) {
        window.open(result.url, '_blank');
      }
    } catch (error) {
      console.error(`[ArtifactsDialog] Failed to export ${format}:`, error);
      setExportStates((prev) => ({
        ...prev,
        [key]: { status: 'failed' },
      }));
    }
  };

  const getArtifactTypeLabel = (type: string) => {
    switch (type) {
      case 'table':
        return 'Tables';
      case 'image':
        return 'Images';
      case 'doc':
        return 'Documents';
      case 'sheet':
        return 'Spreadsheets';
      default:
        return 'Artifacts';
    }
  };

  const getArtifactTypeIcon = (type: string) => {
    const iconClass = "w-4 h-4 text-white/50";
    switch (type) {
      case 'table':
        return <TableIcon className={iconClass} />;
      case 'image':
        return <ImageIcon className={iconClass} />;
      case 'doc':
        return <FileText className={iconClass} />;
      case 'sheet':
        return <Sheet className={iconClass} />;
      default:
        return null;
    }
  };

  const getSmartArtifactName = (artifact: TableArtifact | ImageArtifact | Artifact) => {
    if (artifact.type === 'image') {
      const imageArtifact = artifact as ImageArtifact;
      const prompt = imageArtifact.data.prompt || '';
      
      // Extract first meaningful words from prompt (max 4 words)
      const words = prompt
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 2 && !['the', 'and', 'for', 'with', 'this', 'that'].includes(w))
        .slice(0, 4);
      
      if (words.length > 0) {
        return words.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      }
      
      return 'Generated Image';
    }

    if (artifact.type === 'table') {
      const tableArtifact = artifact as TableArtifact;
      const headers = tableArtifact.data?.[0] || [];
      
      // Try to create name from first 2-3 column headers
      if (headers.length > 0) {
        const headerText = headers
          .slice(0, 3)
          .map(h => String(h).trim())
          .filter(h => h.length > 0 && h.length < 20)
          .join(', ');
        
        if (headerText.length > 0 && headerText.length < 40) {
          return headerText;
        }
      }
      
      const rowCount = tableArtifact.data?.length || 0;
      return `Data Table (${rowCount} rows)`;
    }

    if (artifact.type === 'doc') {
      return 'Document';
    }

    if (artifact.type === 'sheet') {
      return 'Spreadsheet';
    }

    return 'Artifact';
  };

  const getArtifactMetadata = (artifact: TableArtifact | ImageArtifact | Artifact) => {
    if (artifact.type === 'image') {
      const imageArtifact = artifact as ImageArtifact;
      const imageCount = imageArtifact.data.images?.length || 0;
      return `${imageCount} image${imageCount !== 1 ? 's' : ''}`;
    }

    if (artifact.type === 'table') {
      const tableArtifact = artifact as TableArtifact;
      const rowCount = tableArtifact.data?.length || 0;
      const colCount = tableArtifact.data?.[0]?.length || 0;
      return `${rowCount} × ${colCount}`;
    }

    return 'Document';
  };

  const getExportButtonLabel = (format: string, state: ExportState) => {
    if (state.status === 'queued') return '...';
    if (state.status === 'processing') return '...';
    if (state.status === 'completed') return '✓';
    if (state.status === 'failed') return '✗';
    return format.toUpperCase();
  };

  const getAvailableExportFormats = (artifact: TableArtifact | ImageArtifact | Artifact) => {
    if (artifact.type === 'doc') return ['pdf', 'docx'] as const;
    if (artifact.type === 'table' || artifact.type === 'sheet') return ['xlsx'] as const;
    return [] as const;
  };

  if (!open) return null;

  const typeOrder = ['image', 'table', 'doc', 'sheet'];
  const sortedTypes = Object.keys(artifactsByType).sort((a, b) => {
    const aIndex = typeOrder.indexOf(a);
    const bIndex = typeOrder.indexOf(b);
    return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
  });

  return (
    <>
      {/* Modal */}
      <div
        data-artifacts-modal
        className="fixed left-20 top-0 bottom-0 z-[9999] w-[420px] bg-[#0a0a0a] border-r border-white/[0.08] flex flex-col shadow-2xl"
      >
        {/* Header */}
        <header className="flex items-center justify-between border-b border-white/[0.08] px-6 py-4 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-1 h-6 bg-white/90 rounded-full" />
            <h2 className="text-base font-medium text-white/90 tracking-tight">Artifacts</h2>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="p-1.5 rounded hover:bg-white/[0.06] transition-colors text-white/40 hover:text-white/70"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-white/30 text-sm">
              Loading...
            </div>
          ) : artifacts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
              <div className="w-12 h-12 rounded-full bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mb-3">
                <FileText className="w-5 h-5 text-white/30" />
              </div>
              <p className="text-sm text-white/40">No artifacts yet</p>
              <p className="text-xs text-white/25 mt-1">Generate tables or images to see them here</p>
            </div>
          ) : (
            <div className="pt-4">
              {sortedTypes.map((type) => {
                const threadsForType = artifactsByType[type];
                const allArtifactsForType = Object.values(threadsForType)
                  .flat()
                  .sort((a, b) => b.createdAt - a.createdAt);

                return (
                  <div key={type} className="mb-6">
                    {/* Section Header */}
                    <div className="px-6 mb-3 flex items-center gap-2">
                      {getArtifactTypeIcon(type)}
                      <h3 className="text-xs font-medium text-white/50 uppercase tracking-wider">
                        {getArtifactTypeLabel(type)}
                      </h3>
                      <div className="flex-1 h-px bg-white/[0.06]" />
                      <span className="text-xs text-white/30 tabular-nums">
                        {allArtifactsForType.length}
                      </span>
                    </div>

                    {/* Artifact Cards */}
                    <div className="space-y-1 px-3 pb-4">
                      {allArtifactsForType.map((artifact) => {
                        const exportKey = (format: string) => `${artifact.id}-${format}`;
                        const availableFormats = getAvailableExportFormats(artifact);
                        const isDeleting = deleting.has(artifact.id);
                        const conversation = useChatStore.getState().conversations.find((c) => c.id === artifact.threadId);
                        const threadTitle = conversation?.title || 'Untitled';

                          return (
                            <div
                              key={artifact.id}
                              className={cn(
                                "group relative rounded-lg border border-white/[0.06]",
                                "bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.12]",
                                "transition-all duration-150"
                              )}
                            >
                              {/* Main Content */}
                              <button
                                onClick={() => handleArtifactClick(artifact)}
                                className="w-full px-4 py-3 text-left focus:outline-none focus:ring-1 focus:ring-white/20 rounded-lg"
                              >
                                <div className="flex items-start gap-3">
                                  {/* Thumbnail for images */}
                                  {artifact.type === 'image' && (artifact as ImageArtifact).data.images?.[0] && (
                                    <div className="w-12 h-12 flex-shrink-0 rounded border border-white/[0.08] overflow-hidden bg-black/20">
                                      <img
                                        src={(artifact as ImageArtifact).data.images[0].dataUrl}
                                        alt="Preview"
                                        className="w-full h-full object-cover"
                                      />
                                    </div>
                                  )}
                                  
                                  <div className="flex-1 min-w-0">
                                    {/* Artifact Name */}
                                    <div className="flex items-center justify-between mb-1">
                                      <h4 className="text-sm text-white/80 font-medium truncate">
                                        {getSmartArtifactName(artifact)}
                                      </h4>
                                      <ChevronRight className="w-3.5 h-3.5 text-white/20 group-hover:text-white/40 group-hover:translate-x-0.5 transition-all flex-shrink-0 ml-2" />
                                    </div>
                                    
                                    {/* Thread + Date Row */}
                                    <div className="flex items-center justify-between mb-1">
                                      <span className="text-xs text-white/40 truncate font-mono">
                                        {threadTitle}
                                      </span>
                                      <span className="text-xs text-white/25 tabular-nums flex-shrink-0 ml-2">
                                        {new Date(artifact.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                      </span>
                                    </div>

                                    {/* Metadata */}
                                    <div className="text-xs text-white/40 tabular-nums">
                                      {getArtifactMetadata(artifact)}
                                    </div>
                                  </div>
                                </div>
                              </button>

                            {/* Actions Bar */}
                            <div className="px-4 pb-3 flex items-center gap-1.5 border-t border-white/[0.04] pt-2">
                              {/* Export buttons */}
                              {availableFormats.map((format) => {
                                const key = exportKey(format);
                                const exportState = exportStates[key] || { status: 'idle' };
                                const isExporting = exportState.status === 'queued' || exportState.status === 'processing';

                                return (
                                  <button
                                    key={format}
                                    onClick={(e) => handleExport(e, artifact, format)}
                                    disabled={isExporting}
                                    className={cn(
                                      "flex-1 px-2 py-1.5 text-[11px] font-medium rounded border",
                                      "transition-all duration-150",
                                      "border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.06] hover:border-white/[0.15]",
                                      "text-white/50 hover:text-white/70",
                                      "disabled:opacity-40 disabled:cursor-not-allowed",
                                      "flex items-center justify-center gap-1"
                                    )}
                                    title={`Export to ${format.toUpperCase()}`}
                                  >
                                    <Download className="w-3 h-3" />
                                    <span className="uppercase tracking-wide">
                                      {getExportButtonLabel(format, exportState)}
                                    </span>
                                  </button>
                                );
                              })}

                              {/* Delete button */}
                              <button
                                onClick={(e) => handleDelete(e, artifact)}
                                disabled={isDeleting}
                                className={cn(
                                  "px-2 py-1.5 text-[11px] font-medium rounded border",
                                  "transition-all duration-150",
                                  "border-white/[0.08] bg-white/[0.02] hover:bg-red-500/10 hover:border-red-500/30",
                                  "text-white/40 hover:text-red-400/80",
                                  "disabled:opacity-40 disabled:cursor-not-allowed"
                                )}
                                title="Delete artifact"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-white/[0.08] px-6 py-3 flex-shrink-0">
          <div className="flex items-center justify-between text-xs">
            <span className="text-white/30">Total artifacts</span>
            <span className="text-white/50 font-medium tabular-nums">{artifacts.length}</span>
          </div>
        </div>
      </div>
    </>
  );
};

export default ArtifactsDialog;
