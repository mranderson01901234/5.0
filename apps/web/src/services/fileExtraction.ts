import { getEnv } from '@/utils/env';

const { VITE_API_BASE_URL } = getEnv();
const baseUrl = VITE_API_BASE_URL === '/' 
  ? '' 
  : (VITE_API_BASE_URL.endsWith('/') ? VITE_API_BASE_URL.slice(0, -1) : VITE_API_BASE_URL);

export interface ExtractedTextResponse {
  uploadId: string;
  filename: string;
  mimeType: string;
  extractedText: string;
  metadata?: {
    pageCount?: number;
    wordCount?: number;
  };
}

/**
 * Extract text content from an uploaded file
 */
export async function extractFileText(
  uploadId: string,
  token?: string
): Promise<ExtractedTextResponse> {
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${baseUrl}/api/uploads/${uploadId}/extract`, {
    method: 'POST',
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to extract text' }));
    throw new Error(error.error || 'Failed to extract text');
  }

  return await response.json();
}

