import React from 'react';
import { X } from 'lucide-react';
import { formatFileSize, getFileIcon } from '@/services/upload';
import type { UploadResponse } from '@/services/upload';

interface FilePreviewProps {
  file: File | UploadResponse;
  onRemove?: () => void;
  isUploaded?: boolean;
  uploadProgress?: number;
  isUploading?: boolean;
}

const FilePreview: React.FC<FilePreviewProps> = ({ 
  file, 
  onRemove, 
  isUploaded = false,
  uploadProgress,
  isUploading = false,
}) => {
  const isImage = file instanceof File 
    ? file.type.startsWith('image/')
    : file.mimeType.startsWith('image/');
  
  const filename = file instanceof File ? file.name : file.filename;
  const size = file instanceof File ? file.size : file.size;
  const mimeType = file instanceof File ? file.type : file.mimeType;
  const previewUrl = file instanceof File 
    ? (isImage ? URL.createObjectURL(file) : null)
    : (isImage ? (isUploaded ? `/api/uploads/${file.id}` : null) : null);

  return (
    <div className="relative flex items-center gap-3 p-3 bg-white/5 rounded-lg border border-white/10">
      {isImage && previewUrl && (
        <img
          src={previewUrl}
          alt={filename}
          className="w-12 h-12 object-cover rounded"
        />
      )}
      {!isImage && (
        <div className="w-12 h-12 flex items-center justify-center bg-white/10 rounded text-2xl">
          {getFileIcon(mimeType)}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="text-sm text-white/90 truncate">{filename}</div>
        <div className="text-xs text-white/60">{formatFileSize(size)}</div>
        {/* Upload progress bar */}
        {isUploading && uploadProgress !== undefined && (
          <div className="mt-2">
            <div className="w-full bg-white/10 rounded-full h-1.5 overflow-hidden">
              <div
                className="h-full bg-white/30 transition-all duration-300 ease-out rounded-full"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
            <div className="text-xs text-white/50 mt-1">{Math.round(uploadProgress)}%</div>
          </div>
        )}
      </div>
      {onRemove && !isUploading && (
        <button
          onClick={onRemove}
          className="p-1 rounded hover:bg-white/10 transition-colors"
          aria-label="Remove file"
        >
          <X className="w-4 h-4 text-white/70" />
        </button>
      )}
      {isUploading && (
        <div className="p-1">
          <div className="w-4 h-4 border-2 border-white/30 border-t-white/70 rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
};

export default FilePreview;

