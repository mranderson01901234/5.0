# File Upload System - Optimization Plan

**Date:** 2025-11-05
**Status:** Implementation Roadmap
**Branch:** claude/audit-file-upload-011CUq6MhKBMTXytL3vDwQLU
**Based on:** FILE_UPLOAD_AUDIT.md

---

## Executive Summary

This document outlines a phased approach to optimize the file upload system based on the comprehensive audit findings. The plan prioritizes critical bugs, then user experience improvements, followed by enterprise-grade enhancements.

**Total Estimated Effort:** 3-4 weeks (full implementation)
**Recommended Approach:** Implement in phases over 4 sprints

---

## Table of Contents

1. [Phase 1: Critical Fixes (Week 1)](#phase-1-critical-fixes-week-1)
2. [Phase 2: User Experience (Week 2)](#phase-2-user-experience-week-2)
3. [Phase 3: Performance & Scale (Week 3)](#phase-3-performance--scale-week-3)
4. [Phase 4: Enterprise Features (Week 4)](#phase-4-enterprise-features-week-4)
5. [Implementation Details](#implementation-details)
6. [Testing Strategy](#testing-strategy)
7. [Deployment Plan](#deployment-plan)
8. [Success Metrics](#success-metrics)

---

## Phase 1: Critical Fixes (Week 1)

### Objectives
- Fix production-blocking issues
- Ensure core functionality works on all storage backends
- Address security vulnerabilities

### Tasks

#### 1.1 Fix S3 Text Extraction (Priority: 🔴 Critical)

**Problem:** Text extraction fails with 501 error when using S3 storage
**Impact:** Production deployment broken for file processing
**Effort:** 2-3 hours

**Implementation:**

**File:** `apps/llm-gateway/src/routes.ts` (around line 3648)

**Current Code:**
```typescript
if (storageBackend === 's3') {
  return reply.code(501).send({ error: 'S3 extraction not yet implemented' });
}
```

**New Code:**
```typescript
// Remove the 501 error, implement S3 download
let fileBuffer: Buffer;

if (storageBackend === 's3') {
  // Download file from S3 to buffer
  const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
  const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });

  const command = new GetObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET,
    Key: upload.storage_path,
  });

  const response = await s3Client.send(command);
  const chunks: Uint8Array[] = [];

  for await (const chunk of response.Body as any) {
    chunks.push(chunk);
  }

  fileBuffer = Buffer.concat(chunks);
} else {
  // Local storage - read from filesystem
  const fs = require('fs');
  const fullPath = path.join(
    process.env.UPLOAD_STORAGE_PATH || './data/uploads',
    upload.storage_path
  );
  fileBuffer = fs.readFileSync(fullPath);
}

// Extract text from buffer (works for both storage types)
const extracted = await extractTextFromFile(fileBuffer, upload.mime_type);
```

**Testing:**
- ✅ Upload PDF to S3, verify extraction works
- ✅ Upload DOCX to S3, verify extraction works
- ✅ Verify local storage still works
- ✅ Test error handling (S3 unavailable, file not found)

**Acceptance Criteria:**
- Text extraction works on both S3 and local storage
- No 501 errors
- Identical behavior between storage backends

---

#### 1.2 Implement Smart Token Limit Protection (Priority: 🔴 Critical)

**Problem:** Large file text may exceed LLM token limits without warning
**Impact:** Silent truncation, poor user experience, failed API calls
**Effort:** 4-6 hours

**Implementation:**

**File:** `apps/web/src/hooks/useChatStream.ts`

**Add token counting utility:**
```typescript
// utils/tokenCounter.ts
export function estimateTokens(text: string): number {
  // Rough estimate: 1 token ≈ 4 characters
  return Math.ceil(text.length / 4);
}

export function truncateToTokenLimit(
  text: string,
  maxTokens: number,
  suffix: string = '\n\n[Content truncated due to length...]'
): { text: string; wasTruncated: boolean } {
  const estimatedTokens = estimateTokens(text);

  if (estimatedTokens <= maxTokens) {
    return { text, wasTruncated: false };
  }

  // Truncate to max tokens, leaving room for suffix
  const maxChars = (maxTokens - estimateTokens(suffix)) * 4;
  const truncated = text.substring(0, maxChars) + suffix;

  return { text: truncated, wasTruncated: true };
}
```

**Update extraction logic:**
```typescript
// In useChatStream.ts (around line 103)
const MAX_TOKENS_PER_FILE = 50000; // ~200KB of text
const MAX_TOTAL_TOKENS = 150000;   // Total context limit

let totalTokens = estimateTokens(enrichedContent);

for (const attachment of attachments) {
  if (canExtract) {
    try {
      const extracted = await extractFileText(attachment.id, token || undefined);

      if (extracted.extractedText.trim()) {
        // Truncate if needed
        const { text, wasTruncated } = truncateToTokenLimit(
          extracted.extractedText,
          MAX_TOKENS_PER_FILE
        );

        // Check if adding this file would exceed total limit
        const fileTokens = estimateTokens(text);
        if (totalTokens + fileTokens > MAX_TOTAL_TOKENS) {
          log.warn(`[useChatStream] Skipping file ${attachment.filename} - would exceed token limit`);
          extractedTexts.push(`\n\n[File: ${attachment.filename}]\n[File too large to include - please ask specific questions about this file]`);
          continue;
        }

        totalTokens += fileTokens;

        let fileContent = `\n\n[File: ${attachment.filename}]`;
        if (wasTruncated) {
          fileContent += `\n[Note: File content truncated - ${extracted.metadata?.pageCount || 'N/A'} pages, showing first ~50,000 tokens]`;
        }
        if (extracted.metadata?.wordCount) {
          fileContent += `\n[Word count: ${extracted.metadata.wordCount}]`;
        }
        fileContent += `\n${text}`;

        extractedTexts.push(fileContent);
      }
    } catch (error) {
      log.warn(`[useChatStream] Failed to extract text from ${attachment.filename}`, error);
    }
  }
}
```

**Testing:**
- ✅ Upload 10-page PDF → Full content included
- ✅ Upload 100-page PDF → Content truncated with notice
- ✅ Upload 5x 50-page PDFs → Only first 3 included, rest skipped
- ✅ Verify user sees truncation notices in chat

**Acceptance Criteria:**
- Files truncated when exceeding per-file limit
- Files skipped when exceeding total context limit
- User receives clear feedback about truncation
- No silent failures or API errors

---

#### 1.3 Add File Content Verification (Priority: 🔴 Critical - Security)

**Problem:** MIME type can be spoofed, no file header validation
**Impact:** Malicious files could be uploaded and served
**Effort:** 3-4 hours

**Implementation:**

**Install dependency:**
```bash
pnpm add file-type --filter=llm-gateway
```

**File:** `apps/llm-gateway/src/utils/fileValidation.ts` (new file)

```typescript
import { fileTypeFromBuffer } from 'file-type';

export interface FileValidationResult {
  isValid: boolean;
  detectedMimeType?: string;
  error?: string;
}

/**
 * Verify file content matches claimed MIME type using magic numbers
 */
export async function verifyFileContent(
  buffer: Buffer,
  claimedMimeType: string
): Promise<FileValidationResult> {
  try {
    const detected = await fileTypeFromBuffer(buffer);

    // If we can't detect type, be conservative
    if (!detected) {
      // Allow plain text files (no magic number)
      if (claimedMimeType === 'text/plain' || claimedMimeType.startsWith('text/')) {
        return { isValid: true };
      }
      return {
        isValid: false,
        error: 'Could not verify file type - file may be corrupted or unsupported'
      };
    }

    // Check if detected type matches claimed type
    if (detected.mime === claimedMimeType) {
      return { isValid: true, detectedMimeType: detected.mime };
    }

    // Handle common variations
    const allowedVariations: Record<string, string[]> = {
      'application/pdf': ['application/pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/zip' // DOCX are ZIP files
      ],
      'image/jpeg': ['image/jpeg'],
      'image/png': ['image/png'],
      'image/gif': ['image/gif'],
      'image/webp': ['image/webp'],
    };

    const allowed = allowedVariations[claimedMimeType] || [claimedMimeType];
    if (allowed.includes(detected.mime)) {
      return { isValid: true, detectedMimeType: detected.mime };
    }

    return {
      isValid: false,
      error: `File type mismatch: claimed ${claimedMimeType}, detected ${detected.mime}`,
      detectedMimeType: detected.mime
    };
  } catch (error: any) {
    return {
      isValid: false,
      error: `File validation error: ${error.message}`
    };
  }
}
```

**Update routes.ts:**
```typescript
// In POST /api/uploads route (around line 3428)
const fileBuffer = await fileData.toBuffer();

// Verify file content matches MIME type
const validation = await verifyFileContent(fileBuffer, mimeType);
if (!validation.isValid) {
  logger.warn({
    userId,
    filename,
    claimedType: mimeType,
    error: validation.error
  }, 'File validation failed');

  return reply.code(400).send({
    error: validation.error || 'File validation failed'
  });
}

logger.info({
  userId,
  filename,
  mimeType,
  verifiedType: validation.detectedMimeType
}, 'File validated successfully');
```

**Testing:**
- ✅ Upload valid PDF → Accepted
- ✅ Rename .exe to .pdf → Rejected
- ✅ Upload corrupted PDF → Rejected
- ✅ Upload plain text file → Accepted
- ✅ Verify error messages are clear

**Acceptance Criteria:**
- Magic number validation for all file types
- Clear error messages for validation failures
- Logged warnings for suspicious files
- No false positives for valid files

---

### Phase 1 Summary

**Deliverables:**
- ✅ S3 text extraction working
- ✅ Smart token limit protection
- ✅ File content verification

**Estimated Effort:** 10-13 hours (1-2 days)
**Risk:** Low - isolated changes, comprehensive testing possible

---

## Phase 2: User Experience (Week 2)

### Objectives
- Improve upload flow feedback
- Better error handling and user communication
- Client-side optimizations

### Tasks

#### 2.1 Client-Side File Type Validation (Priority: 🟡 Medium)

**Problem:** Users can select unsupported files, error only after upload
**Impact:** Wasted bandwidth, poor UX
**Effort:** 1 hour

**File:** `apps/web/src/components/home/CenterComposer.tsx`

```typescript
// Add validation constants
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/csv',
  'text/markdown',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp'
];

const MIME_TYPE_LABELS: Record<string, string> = {
  'application/pdf': 'PDF',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word Document',
  'text/plain': 'Text File',
  'image/jpeg': 'JPEG Image',
  'image/png': 'PNG Image',
};

// In file selection handler
const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
  const file = event.target.files?.[0];
  if (!file) return;

  // Validate file type
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    const allowedTypes = ALLOWED_MIME_TYPES
      .map(type => MIME_TYPE_LABELS[type] || type)
      .join(', ');

    toast.error(
      `File type "${file.type}" is not supported. ` +
      `Allowed types: ${allowedTypes}`
    );
    event.target.value = ''; // Reset input
    return;
  }

  // Validate file size
  const maxSize = parseInt(import.meta.env.VITE_MAX_UPLOAD_SIZE || '10485760');
  if (file.size > maxSize) {
    toast.error(
      `File size ${formatFileSize(file.size)} exceeds limit of ${formatFileSize(maxSize)}`
    );
    event.target.value = '';
    return;
  }

  // Proceed with upload
  uploadFile(file);
};
```

**Testing:**
- ✅ Select unsupported file → Immediate error, clear message
- ✅ Select oversized file → Immediate error with size info
- ✅ Select valid file → No error, upload proceeds

---

#### 2.2 Extraction Progress Indicator (Priority: 🟡 Medium)

**Problem:** No feedback during text extraction (can take several seconds)
**Impact:** User thinks app is frozen
**Effort:** 2 hours

**File:** `apps/web/src/hooks/useChatStream.ts`

```typescript
// Add state for extraction progress
const [extractionStatus, setExtractionStatus] = useState<string | undefined>();

// In send function
if (attachments && attachments.length > 0) {
  const token = await getToken();
  const extractedTexts: string[] = [];

  for (let i = 0; i < attachments.length; i++) {
    const attachment = attachments[i];
    const canExtract = /* ... */;

    if (canExtract) {
      try {
        // Show progress
        setExtractionStatus(
          `Extracting text from ${attachment.filename} (${i + 1}/${attachments.length})...`
        );

        const extracted = await extractFileText(attachment.id, token || undefined);

        // ... rest of extraction logic
      } catch (error) {
        // ...
      }
    }
  }

  // Clear progress
  setExtractionStatus(undefined);
}
```

**UI Component:**
```typescript
// In CenterComposer.tsx or MessageInput component
{extractionStatus && (
  <div className="extraction-progress">
    <Spinner size="sm" />
    <span>{extractionStatus}</span>
  </div>
)}
```

---

#### 2.3 Increase File Size Limit (Priority: 🟡 Medium)

**Problem:** 10MB may be too restrictive for research papers, reports
**Impact:** Users can't upload legitimate large documents
**Effort:** 30 minutes

**Changes:**

**Backend:** `apps/llm-gateway/src/server.ts` and `routes.ts`
```typescript
// Change from 10MB to 20MB
const MAX_UPLOAD_SIZE = parseInt(process.env.MAX_UPLOAD_SIZE || '20971520'); // 20MB
```

**Frontend:** `.env.example` and docs
```env
VITE_MAX_UPLOAD_SIZE=20971520  # 20MB (20 * 1024 * 1024)
```

**Rationale:**
- Academic papers: Often 5-15MB with images/charts
- Reports with images: 10-20MB common
- Still reasonable for memory/bandwidth

**Alternative:** Tiered limits by file type
```typescript
const MAX_SIZES: Record<string, number> = {
  'application/pdf': 20 * 1024 * 1024,      // 20MB for documents
  'application/vnd...': 20 * 1024 * 1024,  // 20MB for DOCX
  'image/jpeg': 10 * 1024 * 1024,          // 10MB for images
  'image/png': 10 * 1024 * 1024,
};
```

---

#### 2.4 Better Error Messages and User Guidance (Priority: 🟡 Medium)

**Problem:** Generic error messages don't guide users to solutions
**Impact:** Users don't know how to fix issues
**Effort:** 2 hours

**Implementation:**

**Create error message mapper:**
```typescript
// utils/uploadErrorMessages.ts
export function getUploadErrorMessage(error: any): {
  title: string;
  message: string;
  action?: string;
} {
  const errorStr = error?.message || error?.error || String(error);

  if (errorStr.includes('size exceeds limit')) {
    return {
      title: 'File Too Large',
      message: 'The selected file exceeds the maximum upload size of 20MB.',
      action: 'Try compressing the file or splitting it into smaller parts.'
    };
  }

  if (errorStr.includes('not supported')) {
    return {
      title: 'Unsupported File Type',
      message: 'This file type is not supported for upload.',
      action: 'Supported types: PDF, Word documents (.docx), and text files (.txt, .md, .csv).'
    };
  }

  if (errorStr.includes('validation failed') || errorStr.includes('type mismatch')) {
    return {
      title: 'Invalid File',
      message: 'The file appears to be corrupted or the file extension doesn\'t match the content.',
      action: 'Please verify the file is not corrupted and try again.'
    };
  }

  if (errorStr.includes('extraction failed')) {
    return {
      title: 'Could Not Extract Text',
      message: 'We couldn\'t extract text from this file. It may be a scanned document or have complex formatting.',
      action: 'Try converting it to a simpler format or use a text-based PDF.'
    };
  }

  // Generic fallback
  return {
    title: 'Upload Failed',
    message: errorStr,
    action: 'Please try again. If the problem persists, contact support.'
  };
}
```

**Use in upload service:**
```typescript
// In upload.ts
catch (error) {
  const { title, message, action } = getUploadErrorMessage(error);

  toast.error(
    <div>
      <strong>{title}</strong>
      <p>{message}</p>
      {action && <p className="text-sm text-gray-600">{action}</p>}
    </div>,
    { duration: 7000 }
  );

  throw error;
}
```

---

### Phase 2 Summary

**Deliverables:**
- ✅ Client-side file validation
- ✅ Extraction progress indicator
- ✅ Increased file size limits
- ✅ Better error messages

**Estimated Effort:** 6-7 hours (1 day)
**Risk:** Low - UI/UX improvements, easily testable

---

## Phase 3: Performance & Scale (Week 3)

### Objectives
- Optimize for concurrent users
- Reduce memory usage
- Improve database performance

### Tasks

#### 3.1 Implement Extraction Result Caching (Priority: 🟡 Medium)

**Problem:** Same file extracted multiple times if used in different messages
**Impact:** Wasted CPU, slower response times
**Effort:** 6-8 hours

**Database Schema:**
```sql
-- Add to database.ts
CREATE TABLE IF NOT EXISTS upload_extractions (
  upload_id TEXT PRIMARY KEY,
  extracted_text TEXT NOT NULL,
  word_count INTEGER,
  page_count INTEGER,
  extraction_version INTEGER DEFAULT 1,  -- For cache invalidation
  extracted_at INTEGER NOT NULL,
  FOREIGN KEY (upload_id) REFERENCES uploads(id) ON DELETE CASCADE
);

CREATE INDEX idx_extractions_upload ON upload_extractions(upload_id);
```

**Backend Route Update:**
```typescript
// In POST /api/uploads/:id/extract
app.post('/api/uploads/:id/extract', async (request, reply) => {
  // ... auth checks ...

  // Check cache first
  const cached = db.prepare(`
    SELECT extracted_text, word_count, page_count
    FROM upload_extractions
    WHERE upload_id = ?
  `).get(id);

  if (cached) {
    logger.info({ uploadId: id }, 'Returning cached extraction');
    return reply.send({
      uploadId: id,
      filename: upload.filename,
      mimeType: upload.mime_type,
      extractedText: cached.extracted_text,
      metadata: {
        wordCount: cached.word_count,
        pageCount: cached.page_count,
      },
      cached: true,
    });
  }

  // Extract as before...
  const extracted = await extractTextFromFile(fileBuffer, upload.mime_type);

  // Cache the result
  db.prepare(`
    INSERT INTO upload_extractions (
      upload_id, extracted_text, word_count, page_count, extracted_at
    ) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(upload_id) DO UPDATE SET
      extracted_text = excluded.extracted_text,
      word_count = excluded.word_count,
      page_count = excluded.page_count,
      extracted_at = excluded.extracted_at
  `).run(
    id,
    extracted.text,
    extracted.metadata?.wordCount || null,
    extracted.metadata?.pageCount || null,
    Math.floor(Date.now() / 1000)
  );

  // Return result...
});
```

**Cache Invalidation:**
```typescript
// If file content ever changes (re-upload), invalidate cache
// In POST /api/uploads
db.prepare(`DELETE FROM upload_extractions WHERE upload_id = ?`).run(existingFileId);
```

**Benefits:**
- 10-100x faster for cached extractions
- Reduced CPU usage
- Better user experience on file reuse

---

#### 3.2 Add Rate Limiting (Priority: 🟡 Medium - Security)

**Problem:** No protection against upload spam/DoS
**Impact:** Resource exhaustion, potential abuse
**Effort:** 4-5 hours

**Install dependency:**
```bash
pnpm add @fastify/rate-limit --filter=llm-gateway
```

**Implementation:**
```typescript
// In server.ts
import rateLimit from '@fastify/rate-limit';

await app.register(rateLimit, {
  global: false, // Apply selectively per route
});

// In routes.ts - upload endpoint
app.post('/api/uploads', {
  config: {
    rateLimit: {
      max: 10,           // 10 uploads
      timeWindow: 60000  // per minute
    }
  },
  preHandler: [/* auth */],
}, async (request, reply) => {
  // ... upload logic
});

// Extraction endpoint (less restrictive)
app.post('/api/uploads/:id/extract', {
  config: {
    rateLimit: {
      max: 30,           // 30 extractions
      timeWindow: 60000  // per minute
    }
  },
  preHandler: [/* auth */],
}, async (request, reply) => {
  // ... extraction logic
});
```

**Custom rate limit by user:**
```typescript
// Advanced: Per-user rate limiting
const userUploadCounts = new Map<string, { count: number; resetAt: number }>();

function checkUserUploadLimit(userId: string): boolean {
  const now = Date.now();
  const userLimit = userUploadCounts.get(userId);

  if (!userLimit || userLimit.resetAt < now) {
    userUploadCounts.set(userId, { count: 1, resetAt: now + 60000 });
    return true;
  }

  if (userLimit.count >= 10) {
    return false; // Rate limited
  }

  userLimit.count++;
  return true;
}
```

---

#### 3.3 Implement Streaming File Upload (Priority: 🟢 Low)

**Problem:** Entire file loaded into memory during upload
**Impact:** High memory usage, risk of OOM on concurrent uploads
**Effort:** 8-10 hours

**Approach:**
- Use Fastify's streaming multipart parser
- Stream directly to storage (filesystem or S3)
- Never hold full file in memory

**Implementation (advanced - optional):**
```typescript
// In routes.ts
import { pipeline } from 'stream/promises';
import { createWriteStream } from 'fs';

app.post('/api/uploads', async (request, reply) => {
  const data = await request.file();
  const fileStream = data.file; // Readable stream

  // Stream to temp location
  const tempPath = `/tmp/upload-${nanoid()}.tmp`;
  const writeStream = createWriteStream(tempPath);

  try {
    await pipeline(fileStream, writeStream);

    // Now read for validation (could also stream validation)
    const fileBuffer = fs.readFileSync(tempPath);

    // Validate, then move to final location
    // ... rest of upload logic

  } finally {
    fs.unlinkSync(tempPath); // Cleanup
  }
});
```

**Benefits:**
- Constant memory usage regardless of file size
- Support for larger files (50MB+)
- Better concurrent upload handling

**Complexity:** High - affects multiple components

---

#### 3.4 Database Query Optimization (Priority: 🟢 Low)

**Problem:** Missing indexes for common queries
**Effort:** 1 hour

**Add indexes:**
```sql
-- In database.ts

-- For user's all files (not just by thread)
CREATE INDEX IF NOT EXISTS idx_uploads_user
  ON uploads(user_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- For cleanup job efficiency
CREATE INDEX IF NOT EXISTS idx_uploads_deleted
  ON uploads(deleted_at)
  WHERE deleted_at IS NOT NULL;

-- For file lookup by storage path (if needed)
CREATE INDEX IF NOT EXISTS idx_uploads_storage_path
  ON uploads(storage_path)
  WHERE deleted_at IS NULL;
```

---

### Phase 3 Summary

**Deliverables:**
- ✅ Extraction result caching
- ✅ Rate limiting
- ⚠️ Streaming uploads (optional)
- ✅ Database optimization

**Estimated Effort:** 12-15 hours (2 days)
**Risk:** Medium - performance optimizations need careful testing

---

## Phase 4: Enterprise Features (Week 4)

### Objectives
- Support large documents via RAG
- Multi-file context aggregation
- Advanced preprocessing

### Tasks

#### 4.1 RAG Integration for Large Documents (Priority: 🟢 Low - Future)

**Problem:** Cannot effectively process 100+ page documents
**Impact:** Enterprise use cases blocked
**Effort:** 2-3 weeks (full implementation)

**High-Level Architecture:**
```
Upload Large File (200 pages)
  ↓
Split into Chunks (1000 tokens each)
  ↓
Generate Embeddings (OpenAI text-embedding-3-small)
  ↓
Store in Vector DB (existing sidecar-hybrid-rag)
  ↓
User Query → Retrieve Top 5 Relevant Chunks → Send to LLM
```

**Database Schema:**
```sql
CREATE TABLE document_chunks (
  id TEXT PRIMARY KEY,
  upload_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  token_count INTEGER NOT NULL,
  embedding BLOB,  -- Store as blob or use vector DB
  metadata JSON,   -- Page numbers, section titles, etc.
  created_at INTEGER NOT NULL,
  FOREIGN KEY (upload_id) REFERENCES uploads(id) ON DELETE CASCADE
);

CREATE INDEX idx_chunks_upload ON document_chunks(upload_id, chunk_index);
```

**Implementation Steps:**

1. **Chunking Service** (apps/llm-gateway/src/utils/documentChunker.ts)
```typescript
export interface DocumentChunk {
  index: number;
  content: string;
  tokenCount: number;
  metadata: {
    pageNumbers?: number[];
    sectionTitle?: string;
    startChar: number;
    endChar: number;
  };
}

export async function chunkDocument(
  text: string,
  metadata: { pageCount?: number },
  maxTokensPerChunk: number = 1000
): Promise<DocumentChunk[]> {
  const chunks: DocumentChunk[] = [];

  // Smart chunking:
  // - Split by paragraphs first
  // - Respect page boundaries
  // - Keep related content together
  // - Aim for maxTokensPerChunk but allow flexibility

  // Implementation details...

  return chunks;
}
```

2. **Embedding Generation**
```typescript
// Use existing sidecar-hybrid-rag embedding engine
import { EmbeddingEngine } from '../../../sidecar-hybrid-rag/src/storage/embeddingEngine';

export async function embedChunks(chunks: DocumentChunk[]): Promise<number[][]> {
  const engine = new EmbeddingEngine();
  const embeddings = await engine.embedBatch(
    chunks.map(c => c.content)
  );
  return embeddings;
}
```

3. **Vector Storage**
```typescript
// Store in existing vector database
export async function storeDocumentChunks(
  uploadId: string,
  chunks: DocumentChunk[],
  embeddings: number[][]
): Promise<void> {
  // Use sidecar-hybrid-rag vector store
  // Or store in SQLite with simple cosine similarity search
}
```

4. **Retrieval at Query Time**
```typescript
// In useChatStream.ts - before sending message
if (attachments.some(a => a.metadata?.isLargeDocument)) {
  // Use RAG instead of full text extraction
  const relevantChunks = await retrieveRelevantChunks(
    userMessage,
    attachments,
    topK: 5
  );

  enrichedContent = userMessage + '\n\n[Relevant excerpts from documents:]\n' +
    relevantChunks.map(chunk =>
      `[${chunk.filename}, page ${chunk.pageNum}]\n${chunk.content}`
    ).join('\n\n');
}
```

**Benefits:**
- Support for 500+ page documents
- Focused, relevant context (not full text dump)
- Reduced token usage
- Better LLM responses (more targeted context)

**Complexity:** Very High
**Timeline:** 2-3 weeks for MVP

---

#### 4.2 Multi-File Context Aggregation (Priority: 🟢 Low)

**Problem:** Each file processed independently
**Impact:** Cannot compare/analyze multiple documents
**Effort:** 1 week

**Feature:**
```typescript
// User uploads: report_2023.pdf, report_2024.pdf
// User asks: "What changed between the 2023 and 2024 reports?"

// Smart aggregation:
1. Extract text from both files
2. Identify they are related (similar filenames)
3. Structure context for comparison:
   "[2023 Report]\n<content>\n\n[2024 Report]\n<content>"
4. Add instruction: "Compare these two documents..."
```

---

#### 4.3 File Preprocessing Pipeline (Priority: 🟢 Low - Advanced)

**Features:**
- OCR for scanned PDFs (Tesseract)
- Image-to-text for screenshots (GPT-4 Vision)
- Table extraction for structured data
- Metadata extraction (author, keywords, date)

**Effort:** 3-4 weeks for full pipeline

---

### Phase 4 Summary

**Deliverables:**
- ⚠️ RAG integration (if enterprise use case validated)
- ⚠️ Multi-file aggregation (optional)
- ⚠️ Preprocessing pipeline (future enhancement)

**Estimated Effort:** 2-4 weeks (depending on scope)
**Risk:** High - complex features, external dependencies

---

## Implementation Priority Matrix

| Task | Priority | Effort | Impact | Phase |
|------|----------|--------|--------|-------|
| Fix S3 extraction | 🔴 Critical | 2h | High | 1 |
| Token limit protection | 🔴 Critical | 6h | High | 1 |
| File content verification | 🔴 Critical | 4h | High | 1 |
| Client-side validation | 🟡 Medium | 1h | Medium | 2 |
| Extraction progress indicator | 🟡 Medium | 2h | Medium | 2 |
| Increase file size limit | 🟡 Medium | 0.5h | Medium | 2 |
| Better error messages | 🟡 Medium | 2h | Medium | 2 |
| Extraction caching | 🟡 Medium | 8h | High | 3 |
| Rate limiting | 🟡 Medium | 5h | Medium | 3 |
| Streaming uploads | 🟢 Low | 10h | Low | 3 |
| Database optimization | 🟢 Low | 1h | Low | 3 |
| RAG integration | 🟢 Low | 3w | Very High | 4 |
| Multi-file aggregation | 🟢 Low | 1w | Medium | 4 |
| Preprocessing pipeline | 🟢 Low | 4w | Medium | 4 |

---

## Testing Strategy

### Unit Tests

**File Validation:**
```typescript
describe('File Content Verification', () => {
  it('should accept valid PDF files', async () => {
    const pdfBuffer = fs.readFileSync('test/fixtures/sample.pdf');
    const result = await verifyFileContent(pdfBuffer, 'application/pdf');
    expect(result.isValid).toBe(true);
  });

  it('should reject spoofed files', async () => {
    const exeBuffer = fs.readFileSync('test/fixtures/malware.exe');
    const result = await verifyFileContent(exeBuffer, 'application/pdf');
    expect(result.isValid).toBe(false);
  });
});
```

**Token Limiting:**
```typescript
describe('Token Limit Protection', () => {
  it('should truncate large text', () => {
    const largeText = 'word '.repeat(50000); // ~200K tokens
    const { text, wasTruncated } = truncateToTokenLimit(largeText, 50000);
    expect(wasTruncated).toBe(true);
    expect(estimateTokens(text)).toBeLessThanOrEqual(50000);
  });
});
```

### Integration Tests

**S3 Extraction:**
```typescript
describe('S3 Text Extraction', () => {
  it('should extract text from S3-stored PDF', async () => {
    // Upload to S3
    const uploadId = await uploadTestFile('sample.pdf', 's3');

    // Extract text
    const result = await extractFileText(uploadId);

    expect(result.extractedText).toContain('expected content');
  });
});
```

### End-to-End Tests

**Full Upload Flow:**
```typescript
describe('File Upload E2E', () => {
  it('should upload, extract, and use in chat', async () => {
    // 1. Upload file
    const upload = await uploadFile('research.pdf');

    // 2. Send message with file
    const response = await sendMessage(
      'Summarize this paper',
      [upload]
    );

    // 3. Verify LLM received file content
    expect(response).toContain('summary based on file content');
  });
});
```

---

## Deployment Plan

### Phase 1: Critical Fixes

**Deployment Steps:**
1. Deploy to staging environment
2. Run full test suite
3. Manual QA testing (upload various files)
4. Monitor error logs for 24 hours
5. Deploy to production during low-traffic window
6. Monitor metrics (upload success rate, extraction time)

**Rollback Plan:**
- Keep previous version deployed
- Feature flags for new validation logic
- Database migrations are backward compatible

### Phase 2: UX Improvements

**Deployment Steps:**
1. Deploy frontend changes first (client validation)
2. Deploy backend changes (increased limits)
3. A/B test error message improvements
4. Gather user feedback

### Phase 3: Performance

**Deployment Steps:**
1. Add database indexes (zero downtime)
2. Deploy caching layer (gradual rollout)
3. Enable rate limiting (monitor for false positives)
4. Test under load (simulate 100 concurrent uploads)

### Phase 4: Enterprise Features

**Deployment Steps:**
1. Feature flag for RAG mode
2. Beta test with select users
3. Monitor costs (embedding API calls)
4. Gradual rollout to all users

---

## Success Metrics

### Key Performance Indicators

**Phase 1:**
- ✅ S3 extraction success rate: 99%+
- ✅ Zero token limit errors
- ✅ File validation catches 100% of spoofed files

**Phase 2:**
- ✅ Upload error rate: <2%
- ✅ User satisfaction (surveys): 4.5/5+
- ✅ Support tickets about uploads: -50%

**Phase 3:**
- ✅ Extraction time (cached): <100ms
- ✅ Memory usage: -40%
- ✅ Concurrent upload capacity: 50+ simultaneous

**Phase 4:**
- ✅ Support for 500+ page documents
- ✅ Token usage per query: -60% (RAG vs full text)
- ✅ Response quality: maintained or improved

---

## Cost Analysis

### Phase 1-3 (Optimizations)
- **Development:** 4-5 days ($4-5K)
- **Infrastructure:** Minimal ($0-50/month)
- **Net Savings:** $1000s/month (reduced token usage)

### Phase 4 (RAG)
- **Development:** 2-3 weeks ($15-20K)
- **Embedding Costs:** $50-200/month (depending on volume)
- **Vector DB:** $100-500/month (hosted solution)
- **ROI:** Enables enterprise tier ($99-299/month/user)

---

## Conclusion

This optimization plan provides a structured approach to improving the file upload system from a functional MVP to an enterprise-grade feature.

**Recommended Immediate Actions:**
1. **Week 1:** Implement Phase 1 (critical fixes) - **MUST DO**
2. **Week 2:** Implement Phase 2 (UX improvements) - **SHOULD DO**
3. **Week 3:** Implement Phase 3 (performance) - **GOOD TO HAVE**
4. **Week 4+:** Evaluate Phase 4 based on user demand

**Total Investment:** 3-4 weeks development
**Expected Outcome:** Production-ready, scalable file upload system

---

**Next Steps:**
1. Review and approve plan
2. Prioritize phases based on business needs
3. Assign engineering resources
4. Set up monitoring and metrics
5. Begin Phase 1 implementation

**End of Optimization Plan**
