import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { cn } from "../../lib/utils";
import { useChatStream } from "../../hooks/useChatStream";
import { useChatStore } from "../../store/chatStore";
import { log } from "../../utils/logger";
import { useAuth, useUser } from "@clerk/clerk-react";
import { Paperclip } from "lucide-react";
import { uploadFile, type UploadResponse } from "../../services/upload";
import { optimizeImage, canOptimizeImage } from "../../utils/imageOptimization";
import FilePreview from "../chat/FilePreview";
import { useImageOptimization } from "../../hooks/useImageOptimization";
import OptimizationModal from "../chat/OptimizationModal";

type CenterComposerProps = {
  isLarge?: boolean;
};

const CenterComposerBase: React.FC<CenterComposerProps> = ({ isLarge = false }) => {
  const [value, setValue] = useState("");
  const [attachments, setAttachments] = useState<Array<File | UploadResponse>>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Map<number, number>>(new Map());
  const [isDragging, setIsDragging] = useState(false);
  const [showOptimizationModal, setShowOptimizationModal] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const { send } = useChatStream();
  const { getToken } = useAuth();
  const { isSignedIn } = useUser();
  const activeStreams = useChatStore(s => s.activeStreams);
  const currentThreadId = useChatStore(s => s.currentThreadId);

  // Image optimization
  const { optimizationData, showButton: showOptimizeButton } = useImageOptimization(value);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [value]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
  }, []);

  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    // Preserve Unicode and special characters on paste
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    const target = e.target as HTMLTextAreaElement;
    const start = target.selectionStart;
    const end = target.selectionEnd;
    const newValue = value.substring(0, start) + text + value.substring(end);
    setValue(newValue);
    
    // Set cursor position after pasted text
    setTimeout(() => {
      target.selectionStart = target.selectionEnd = start + text.length;
    }, 0);
  }, [value]);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newFiles = Array.from(files);
    processFiles(newFiles);
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const processFiles = useCallback(async (files: File[]) => {
    const maxSize = parseInt(import.meta.env.VITE_MAX_UPLOAD_SIZE || '10485760'); // 10MB default
    
    // Validate file sizes
    let validFiles = files.filter(file => {
      if (file.size > maxSize) {
        log.warn(`File ${file.name} exceeds size limit`);
        return false;
      }
      return true;
    });

    if (validFiles.length === 0) return;

    // Optimize images before adding to attachments
    const optimizedFiles = await Promise.all(
      validFiles.map(async (file) => {
        if (canOptimizeImage(file)) {
          try {
            return await optimizeImage(file);
          } catch (error) {
            log.warn(`[CenterComposer] Failed to optimize image ${file.name}`, error);
            return file; // Use original if optimization fails
          }
        }
        return file;
      })
    );

    // Add files to attachments (will upload when sending)
    setAttachments(prev => [...prev, ...optimizedFiles]);
  }, []);

  // Drag and drop handlers
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only set dragging to false if we're leaving the drop zone
    if (!dropZoneRef.current?.contains(e.relatedTarget as Node)) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      processFiles(files);
    }
  }, [processFiles]);

  const handleRemoveFile = useCallback((index: number) => {
    setAttachments(prev => {
      const updated = [...prev];
      const removed = updated.splice(index, 1)[0];
      // Clean up object URL if it's a File
      if (removed instanceof File && removed.type.startsWith('image/')) {
        URL.revokeObjectURL(URL.createObjectURL(removed));
      }
      return updated;
    });
  }, []);

  const handleSubmit = useCallback(async () => {
    // Don't allow submitting if not signed in
    if (!isSignedIn) {
      log.warn("User must be signed in to send messages");
      return;
    }
    
    if (!value.trim() && attachments.length === 0) return;
    if (activeStreams >= 2) {
      log.warn("Stream limit reached");
      return;
    }

    // Upload files first if any
    let uploadedAttachments: UploadResponse[] = [];
    if (attachments.length > 0) {
      setUploading(true);
      setUploadProgress(new Map());
      try {
        const token = await getToken();
        const uploadPromises = attachments.map(async (file, index) => {
          if (file instanceof File) {
            const options = currentThreadId ? { threadId: currentThreadId } : undefined;
            const progressCallback = (progress: number) => {
              setUploadProgress(prev => {
                const newMap = new Map(prev);
                newMap.set(index, progress);
                return newMap;
              });
            };
            try {
              return await uploadFile(file, token || undefined, {
                ...options,
                onProgress: progressCallback,
              });
            } catch (error) {
              log.error(`[CenterComposer] Failed to upload file ${file.name}`, error);
              throw error; // Re-throw to be caught by outer try-catch
            }
          }
          return file; // Already uploaded
        });
        uploadedAttachments = await Promise.all(uploadPromises);
      } catch (error) {
        log.error('[CenterComposer] Failed to upload files', error);
        setUploading(false);
        setUploadProgress(new Map());
        return;
      }
      setUploading(false);
      setUploadProgress(new Map());
    }

    // Send message with attachments
    const attachmentData = uploadedAttachments.map(upload => ({
      id: upload.id,
      filename: upload.filename,
      mimeType: upload.mimeType,
      size: upload.size,
      url: upload.url,
    }));
    
    send(value.trim() || (attachmentData.length > 0 ? ' ' : ''), attachmentData.length > 0 ? attachmentData : undefined);
    setValue("");
    setAttachments([]);
  }, [value, attachments, activeStreams, send, getToken, currentThreadId, isSignedIn]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  const isDisabled = useMemo(() => 
    !isSignedIn || activeStreams >= 2 || (!value.trim() && attachments.length === 0) || uploading,
    [activeStreams, value, attachments.length, uploading, isSignedIn]
  );

  return (
    <form
      className="w-full"
      aria-label="Message composer"
      onSubmit={(e) => {
        e.preventDefault();
        if ((value.trim() || attachments.length > 0) && !isDisabled) {
          handleSubmit();
        }
      }}
    >
      {/* File attachments preview */}
      {attachments.length > 0 && (
        <div className="mb-3 space-y-2">
          {attachments.map((file, index) => {
            const progress = uploadProgress.get(index);
            return (
              <FilePreview
                key={index}
                file={file}
                onRemove={() => handleRemoveFile(index)}
                {...(progress !== undefined && { uploadProgress: progress })}
                isUploading={uploading && file instanceof File}
              />
            );
          })}
        </div>
      )}

      <div 
        ref={dropZoneRef}
        className={cn(
          "relative rounded-lg",
          "border border-white/[0.10] transition-all duration-150",
          isDragging 
            ? "border-white/40 bg-white/10 border-dashed" 
            : "bg-white/[0.03] hover:bg-white/[0.05] hover:border-white/[0.15]",
          "overflow-hidden shadow-lg"
        )}
        style={{ boxShadow: '0 2px 12px rgba(0, 0, 0, 0.3)' }}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <div className="relative">
          <label htmlFor="composer-input" className="sr-only">Message</label>
          <textarea
            id="composer-input"
            ref={textareaRef}
            placeholder="Message..."
            rows={isLarge ? 2 : 1}
            value={value}
            onChange={handleChange}
            onPaste={handlePaste}
            className={cn(
              "w-full resize-none bg-transparent pr-24",
              isLarge 
                ? "px-6 py-5 text-2xl placeholder:text-2xl" 
                : "px-5 py-4 text-[15px]",
              "leading-relaxed text-white/95 placeholder:text-white/40",
              "focus:outline-none",
              "max-h-[200px] overflow-y-auto scrollbar-hide",
              "math-input"
            )}
            style={{ 
              minHeight: isLarge ? '80px' : '56px',
              lineHeight: '1.5',
              whiteSpace: 'pre-wrap',
              wordWrap: 'break-word'
            }}
            onKeyDown={handleKeyDown}
            aria-label="Type your message"
          />
          
          {/* File upload button */}
          <label
            htmlFor="file-upload"
            className={cn(
              "absolute bottom-2.5 left-2.5 rounded cursor-pointer",
              "flex items-center justify-center",
              "transition-all duration-150",
              isLarge ? "h-8 w-8" : "h-7 w-7",
              "bg-white/[0.02] text-white/50 hover:text-white/80 hover:bg-white/[0.06] border border-white/[0.06] hover:border-white/[0.12]",
              uploading && "opacity-50 cursor-not-allowed"
            )}
            aria-label="Attach file"
          >
            <Paperclip className={isLarge ? "w-4 h-4" : "w-3.5 h-3.5"} />
            <input
              id="file-upload"
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleFileSelect}
              accept="image/*,application/pdf,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              disabled={uploading}
            />
          </label>

          {/* Optimize button (appears when image intent detected) */}
          {showOptimizeButton && (
            <button
              type="button"
              onClick={() => setShowOptimizationModal(true)}
              className={cn(
                "absolute rounded",
                "px-2.5 text-[11px] font-medium transition-all duration-150",
                isLarge
                  ? "right-12 bottom-2.5 h-8"
                  : "right-11 bottom-2.5 h-7",
                "bg-white/[0.02] text-white/50 hover:text-white/80 hover:bg-white/[0.06]",
                "border border-white/[0.06] hover:border-white/[0.12]"
              )}
              aria-label="Optimize prompt"
            >
              Optimize
            </button>
          )}

          {/* Send button */}
          <button
            type="submit"
            aria-label="Send message"
            disabled={isDisabled}
            className={cn(
              "absolute right-2.5 rounded",
              "flex items-center justify-center",
              "transition-all duration-150",
              isLarge
                ? "bottom-2.5 h-8 w-8"
                : "bottom-2.5 h-7 w-7",
              isDisabled
                ? "bg-white/[0.02] text-white/30 cursor-not-allowed border border-white/[0.06]"
                : "bg-white/[0.02] text-white/50 hover:text-white/80 hover:bg-white/[0.06] border border-white/[0.06] hover:border-white/[0.12]"
            )}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width={isLarge ? "16" : "14"}
              height={isLarge ? "16" : "14"}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M22 2L11 13" />
              <path d="M22 2L15 22L11 13L2 9L22 2Z" />
            </svg>
          </button>
        </div>
      </div>
      <div className="mt-2 px-2 text-xs text-white/40 text-center">
        {isDragging ? (
          <span className="text-white/70">Drop files here to attach</span>
        ) : (
          <>
            Press Enter to send, Shift+Enter for new line
            {uploading && <span className="ml-2">• Uploading files...</span>}
          </>
        )}
      </div>

      {/* Optimization Modal */}
      <OptimizationModal
        isOpen={showOptimizationModal}
        onClose={() => setShowOptimizationModal(false)}
        data={optimizationData}
        onAccept={(optimized) => setValue(optimized)}
      />
    </form>
  );
};

const CenterComposer = React.memo(CenterComposerBase);

export default CenterComposer;

