import { createRequire } from 'module';
import mammoth from 'mammoth';
import { logger } from '../log.js';

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

export interface ExtractedText {
  text: string;
  metadata?: {
    pageCount?: number;
    wordCount?: number;
  };
}

/**
 * Extract text from PDF file
 */
export async function extractTextFromPDF(buffer: Buffer): Promise<ExtractedText> {
  try {
    const data = await pdfParse(buffer);
    const text = data.text.trim();
    const wordCount = text.split(/\s+/).filter((w: string) => w.length > 0).length;
    
    return {
      text,
      metadata: {
        pageCount: data.numpages,
        wordCount,
      },
    };
  } catch (error: any) {
    logger.error({ error: error?.message }, 'Failed to extract text from PDF');
    throw new Error(`PDF extraction failed: ${error?.message || 'Unknown error'}`);
  }
}

/**
 * Extract text from DOCX file
 */
export async function extractTextFromDOCX(buffer: Buffer): Promise<ExtractedText> {
  try {
    const result = await mammoth.extractRawText({ buffer });
    const text = result.value.trim();
    const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;
    
    return {
      text,
      metadata: {
        wordCount,
      },
    };
  } catch (error: any) {
    logger.error({ error: error?.message }, 'Failed to extract text from DOCX');
    throw new Error(`DOCX extraction failed: ${error?.message || 'Unknown error'}`);
  }
}

/**
 * Extract text from plain text file
 */
export async function extractTextFromPlainText(buffer: Buffer): Promise<ExtractedText> {
  try {
    const text = buffer.toString('utf-8').trim();
    const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;
    
    return {
      text,
      metadata: {
        wordCount,
      },
    };
  } catch (error: any) {
    logger.error({ error: error?.message }, 'Failed to extract text from plain text file');
    throw new Error(`Text extraction failed: ${error?.message || 'Unknown error'}`);
  }
}

/**
 * Extract text from file based on MIME type
 */
export async function extractTextFromFile(
  buffer: Buffer,
  mimeType: string
): Promise<ExtractedText> {
  if (mimeType === 'application/pdf') {
    return extractTextFromPDF(buffer);
  } else if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mimeType === 'application/msword'
  ) {
    return extractTextFromDOCX(buffer);
  } else if (mimeType === 'text/plain' || mimeType.startsWith('text/')) {
    return extractTextFromPlainText(buffer);
  } else {
    throw new Error(`Unsupported file type for text extraction: ${mimeType}`);
  }
}

/**
 * Check if file type supports text extraction
 */
export function canExtractText(mimeType: string): boolean {
  return (
    mimeType === 'application/pdf' ||
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mimeType === 'application/msword' ||
    mimeType === 'text/plain' ||
    mimeType.startsWith('text/')
  );
}

