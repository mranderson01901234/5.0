import { getEnv } from '@/utils/env';
import { log } from '@/utils/logger';

const { VITE_API_BASE_URL } = getEnv();
const baseUrl = VITE_API_BASE_URL === '/' 
  ? '' 
  : (VITE_API_BASE_URL.endsWith('/') ? VITE_API_BASE_URL.slice(0, -1) : VITE_API_BASE_URL);

export interface UploadResponse {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  url: string;
  createdAt: number;
}

export interface UploadOptions {
  threadId?: string;
  onProgress?: (progress: number) => void;
}

/**
 * Upload a file to the server
 */
export async function uploadFile(
  file: File,
  token?: string,
  options?: UploadOptions
): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append('file', file);
  if (options?.threadId) {
    formData.append('threadId', options.threadId);
  }

  const xhr = new XMLHttpRequest();

  return new Promise((resolve, reject) => {
    // Handle progress
    if (options?.onProgress) {
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const progress = (e.loaded / e.total) * 100;
          options.onProgress?.(progress);
        }
      });
    }

    // Handle completion
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const response = JSON.parse(xhr.responseText) as UploadResponse;
          resolve(response);
        } catch (error) {
          log.error('[upload] Failed to parse upload response', error);
          reject(new Error('Failed to parse upload response'));
        }
      } else {
        try {
          const error = JSON.parse(xhr.responseText);
          reject(new Error(error.error || 'Upload failed'));
        } catch {
          reject(new Error(`Upload failed: ${xhr.statusText}`));
        }
      }
    });

    // Handle errors
    xhr.addEventListener('error', () => {
      reject(new Error('Network error during upload'));
    });

    xhr.addEventListener('abort', () => {
      reject(new Error('Upload aborted'));
    });

    // Start upload
    xhr.open('POST', `${baseUrl}/api/uploads`);
    if (token) {
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    }
    xhr.send(formData);
  });
}

/**
 * Get upload URL for displaying/downloading
 */
export function getUploadUrl(uploadId: string): string {
  return `${baseUrl}/api/uploads/${uploadId}`;
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Get file icon based on MIME type
 */
export function getFileIcon(mimeType: string): string {
  if (mimeType.startsWith('image/')) return '🖼️';
  if (mimeType === 'application/pdf') return '📄';
  if (mimeType.includes('word') || mimeType.includes('document')) return '📝';
  if (mimeType.includes('sheet') || mimeType.includes('excel')) return '📊';
  if (mimeType === 'text/plain') return '📃';
  return '📎';
}

