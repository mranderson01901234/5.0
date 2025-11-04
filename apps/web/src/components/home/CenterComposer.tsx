import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { cn } from "../../lib/utils";
import { useChatStream } from "../../hooks/useChatStream";
import { useChatStore } from "../../store/chatStore";
import { log } from "../../utils/logger";
import { useAuth } from "@clerk/clerk-react";
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
  }, [value, attachments, activeStreams, send, getToken, currentThreadId]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  const isDisabled = useMemo(() => 
    activeStreams >= 2 || (!value.trim() && attachments.length === 0) || uploading,
    [activeStreams, value, attachments.length, uploading]
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
          "relative rounded-2xl",
          "border transition-all duration-200",
          isDragging 
            ? "border-white/40 bg-white/10 border-dashed" 
            : "border-white/15 bg-[#0f0f0f]",
          "backdrop-blur-xl overflow-hidden"
        )}
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
              "absolute bottom-3 left-3 rounded-lg cursor-pointer",
              "flex items-center justify-center",
              "transition-all duration-200",
              isLarge ? "h-11 w-11" : "h-9 w-9",
              "bg-white/10 text-white/90 hover:bg-white/20 border border-white/20 hover:border-white/30",
              uploading && "opacity-50 cursor-not-allowed"
            )}
            aria-label="Attach file"
          >
            <Paperclip className={isLarge ? "w-5 h-5" : "w-4 h-4"} />
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
                "absolute rounded-lg",
                "px-3 text-xs transition-all duration-200",
                isLarge
                  ? "right-16 bottom-4 h-11"
                  : "right-14 bottom-3 h-9",
                "bg-white/10 text-white/70 hover:text-white/90 hover:bg-white/15",
                "border border-white/20 hover:border-white/30"
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
              "absolute right-3 rounded-lg",
              "flex items-center justify-center",
              "transition-all duration-200",
              isLarge
                ? "bottom-4 h-11 w-11"
                : "bottom-3 h-9 w-9",
              isDisabled
                ? "bg-white/5 text-white/30 cursor-not-allowed"
                : "bg-white/10 text-white/90 hover:bg-white/20 border border-white/20 hover:border-white/30"
            )}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width={isLarge ? "20" : "18"}
              height={isLarge ? "20" : "18"}
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

