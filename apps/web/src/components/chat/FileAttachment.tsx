import React from 'react';
import { Download, FileText, Image as ImageIcon } from 'lucide-react';
import { getUploadUrl, formatFileSize, getFileIcon } from '@/services/upload';

export interface FileAttachment {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  url?: string;
}

interface FileAttachmentProps {
  attachment: FileAttachment;
}

const FileAttachment: React.FC<FileAttachmentProps> = ({ attachment }) => {
  const isImage = attachment.mimeType.startsWith('image/');
  const uploadUrl = attachment.url || getUploadUrl(attachment.id);

  return (
    <div className="mt-2 p-3 bg-white/5 rounded-lg border border-white/10 hover:bg-white/10 transition-colors">
      <div className="flex items-center gap-3">
        {isImage ? (
          <a
            href={uploadUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-shrink-0"
          >
            <img
              src={uploadUrl}
              alt={attachment.filename}
              className="w-16 h-16 object-cover rounded cursor-pointer"
            />
          </a>
        ) : (
          <div className="flex-shrink-0 w-16 h-16 flex items-center justify-center bg-white/10 rounded text-2xl">
            {getFileIcon(attachment.mimeType)}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="text-sm text-white/90 truncate">{attachment.filename}</div>
          <div className="text-xs text-white/60 mt-1">{formatFileSize(attachment.size)}</div>
        </div>
        <a
          href={uploadUrl}
          download={attachment.filename}
          className="p-2 rounded hover:bg-white/10 transition-colors"
          aria-label="Download file"
        >
          <Download className="w-4 h-4 text-white/70" />
        </a>
      </div>
    </div>
  );
};

export default FileAttachment;

