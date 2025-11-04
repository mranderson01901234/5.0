# Artifact Service API Specification

**Version**: 1.0.0  
**Purpose**: Define API contracts for artifact creation, storage, and export

---

## Overview

Artifact service provides endpoints for:
1. Creating artifacts (tables, documents, spreadsheets)
2. Retrieving artifact data
3. Exporting artifacts to PDF/DOCX/XLSX
4. Managing artifact storage

**Base Path**: `/api/artifacts`  
**Authentication**: Bearer token (Clerk JWT) required for all endpoints

---

## Endpoints

### POST /api/artifacts/gatekeeper

**Purpose**: Optional pre-LLM classifier to determine if artifact should be created

**Request**:
```typescript
{
  userText: string;
  conversationSummary?: string;
  threadId: string;
  userId: string;
}
```

**Response**:
```typescript
{
  shouldCreate: boolean;
  type: "table" | "doc" | "sheet" | null;
  rationale: string;
  confidence: number;  // 0.0-1.0
}
```

**Status Codes**:
- `200 OK`: Success
- `400 Bad Request`: Invalid input
- `429 Too Many Requests`: Rate limit exceeded (20/second)
- `500 Internal Server Error`: Classifier error

---

### POST /api/artifacts/table.create

**Purpose**: Create a table artifact

**Request**:
```typescript
{
  threadId: string;
  columns: string[];              // Column headers
  rows: any[][];                  // Array of row data
  title?: string;                 // Optional table title
}
```

**Response**:
```typescript
{
  id: string;                     // Artifact ID
  type: "table";
  threadId: string;
  createdAt: number;              // Unix timestamp
  data: {
    columns: string[];
    rows: any[][];
    title?: string;
  };
}
```

**Status Codes**:
- `201 Created`: Artifact created
- `400 Bad Request`: Invalid columns/rows
- `429 Too Many Requests`: Rate limit (5/minute)
- `500 Internal Server Error`: Storage error

**Validation**:
- `columns.length > 0`
- `rows.length >= 0`
- `rows[i].length === columns.length` (all rows same length)
- `columns.length <= 50` (max columns)
- `rows.length <= 10000` (max rows)

---

### POST /api/artifacts/doc.create

**Purpose**: Create a document artifact

**Request**:
```typescript
{
  threadId: string;
  sections: Array<{
    title: string;
    content: string;              // Markdown supported
  }>;
  title?: string;                 // Document title
  format?: "markdown" | "plain";  // Default: "markdown"
}
```

**Response**:
```typescript
{
  id: string;
  type: "doc";
  threadId: string;
  createdAt: number;
  data: {
    sections: Array<{
      title: string;
      content: string;
    }>;
    title?: string;
    format: "markdown" | "plain";
  };
}
```

**Status Codes**:
- `201 Created`: Document created
- `400 Bad Request`: Invalid sections
- `429 Too Many Requests`: Rate limit (5/minute)
- `500 Internal Server Error`: Storage error

**Validation**:
- `sections.length > 0`
- `sections.length <= 50` (max sections)
- Each section: `title.length <= 200`, `content.length <= 100000`

---

### POST /api/artifacts/sheet.create

**Purpose**: Create a spreadsheet artifact

**Request**:
```typescript
{
  threadId: string;
  sheets: Array<{
    name: string;                 // Sheet name
    cells: Record<string, any>;   // A1: value, B2: value, etc.
  }>;
  title?: string;                 // Spreadsheet title
}
```

**Response**:
```typescript
{
  id: string;
  type: "sheet";
  threadId: string;
  createdAt: number;
  data: {
    sheets: Array<{
      name: string;
      cells: Record<string, any>;
    }>;
    title?: string;
  };
}
```

**Status Codes**:
- `201 Created`: Spreadsheet created
- `400 Bad Request`: Invalid sheets/cells
- `429 Too Many Requests`: Rate limit (5/minute)
- `500 Internal Server Error`: Storage error

**Validation**:
- `sheets.length > 0`
- `sheets.length <= 20` (max sheets)
- Cell keys: Valid Excel notation (A1, B2, etc.)
- Total cells across all sheets <= 1000000

---

### GET /api/artifacts/:id

**Purpose**: Retrieve artifact data

**Response**:
```typescript
{
  id: string;
  type: "table" | "doc" | "sheet";
  threadId: string;
  userId: string;
  createdAt: number;
  updatedAt: number;
  data: {
    // Type-specific data (see create endpoints)
  };
  exportUrl?: string;             // If exported, URL to file
}
```

**Status Codes**:
- `200 OK`: Artifact found
- `403 Forbidden`: User doesn't own artifact
- `404 Not Found`: Artifact doesn't exist

---

### POST /api/artifacts/export

**Purpose**: Export artifact to PDF/DOCX/XLSX file

**Request**:
```typescript
{
  id: string;                     // Artifact ID
  format: "pdf" | "docx" | "xlsx";
  options?: {
    // PDF options
    pageSize?: "A4" | "Letter";
    orientation?: "portrait" | "landscape";
    
    // DOCX options
    includeMetadata?: boolean;
    
    // XLSX options
    sheetNames?: string[];        // Export specific sheets only
  };
}
```

**Response**:
```typescript
{
  id: string;                     // Export job ID
  artifactId: string;
  format: "pdf" | "docx" | "xlsx";
  status: "processing" | "completed" | "failed";
  downloadUrl?: string;           // S3/Supabase/GCS URL (when completed)
  expiresAt?: number;             // URL expiration (Unix timestamp)
  error?: string;                 // If failed
}
```

**Status Codes**:
- `202 Accepted`: Export job queued
- `400 Bad Request`: Invalid format/options
- `403 Forbidden`: User doesn't own artifact
- `404 Not Found`: Artifact doesn't exist
- `429 Too Many Requests`: Rate limit (2/minute)
- `500 Internal Server Error`: Export failed

**Async Processing**:
- Export is asynchronous (job queue)
- Client should poll `GET /api/artifacts/export/:jobId` for status
- Or use SSE stream: `GET /api/artifacts/export/:jobId/stream`

---

### GET /api/artifacts/export/:jobId

**Purpose**: Check export job status

**Response**:
```typescript
{
  id: string;
  artifactId: string;
  format: "pdf" | "docx" | "xlsx";
  status: "processing" | "completed" | "failed";
  progress?: number;              // 0-100 if processing
  downloadUrl?: string;
  expiresAt?: number;
  error?: string;
  createdAt: number;
  completedAt?: number;
}
```

**Status Codes**:
- `200 OK`: Job status retrieved
- `404 Not Found`: Job doesn't exist

---

### GET /api/artifacts/thread/:threadId

**Purpose**: List all artifacts for a thread

**Query Parameters**:
- `limit`: Number of results (default: 20, max: 100)
- `offset`: Pagination offset (default: 0)
- `type`: Filter by type (`table` | `doc` | `sheet`)

**Response**:
```typescript
{
  artifacts: Array<{
    id: string;
    type: "table" | "doc" | "sheet";
    createdAt: number;
    title?: string;
  }>;
  total: number;
  limit: number;
  offset: number;
}
```

**Status Codes**:
- `200 OK`: Success
- `403 Forbidden`: User doesn't own thread
- `404 Not Found`: Thread doesn't exist

---

### DELETE /api/artifacts/:id

**Purpose**: Delete an artifact

**Response**:
```typescript
{
  id: string;
  deleted: true;
}
```

**Status Codes**:
- `200 OK`: Artifact deleted
- `403 Forbidden`: User doesn't own artifact
- `404 Not Found`: Artifact doesn't exist

---

## Storage & URL Scheme

### Storage Backend Options

1. **Local File System** (development):
   - Path: `./data/artifacts/{userId}/{artifactId}.json`
   - Exports: `./data/exports/{userId}/{jobId}.{pdf|docx|xlsx}`

2. **S3** (production):
   - Bucket: `artifacts-{env}`
   - Key: `artifacts/{userId}/{artifactId}.json`
   - Exports: `exports/{userId}/{jobId}.{pdf|docx|xlsx}`
   - Presigned URLs: 1-hour expiration

3. **Supabase Storage**:
   - Bucket: `artifacts`
   - Path: `{userId}/{artifactId}.json`
   - Public URLs or signed URLs

### URL Scheme for Downloads

**Presigned URL Format**:
```
https://artifacts.example.com/download/{jobId}?token={presigned_token}&expires={timestamp}
```

**Permanent URL** (if public):
```
https://artifacts.example.com/{userId}/{artifactId}/{format}
```

---

## Error Model

### Standard Error Response

```typescript
{
  error: {
    code: string;                 // Error code (e.g., "VALIDATION_ERROR")
    message: string;              // Human-readable message
    details?: {
      field?: string;             // Field name (for validation errors)
      constraint?: string;        // Constraint violated
    };
  };
}
```

### Error Codes

- `VALIDATION_ERROR`: Invalid input (400)
- `NOT_FOUND`: Resource doesn't exist (404)
- `FORBIDDEN`: User doesn't have permission (403)
- `RATE_LIMIT_EXCEEDED`: Too many requests (429)
- `STORAGE_ERROR`: File storage failed (500)
- `EXPORT_FAILED`: Export generation failed (500)
- `INTERNAL_ERROR`: Unexpected server error (500)

---

## Idempotency Rules

### Create Operations

- **Idempotency Key**: Optional `Idempotency-Key` header
- **Behavior**: If same key used within 5 minutes, return existing artifact
- **Response**: `200 OK` with existing artifact (not `201 Created`)

### Export Operations

- **Idempotency**: Not idempotent (each export creates new file)
- **Deduplication**: If same artifact+format exported within 1 minute, return existing export URL

---

## Rate Limiting

### Per-User Limits

| Endpoint | Limit | Window |
|----------|-------|--------|
| `/gatekeeper` | 20 requests | 1 second |
| `/table.create`, `/doc.create`, `/sheet.create` | 5 requests | 1 minute |
| `/export` | 2 requests | 1 minute |
| `GET /:id` | 100 requests | 1 minute |

### Headers

**Request**:
```
X-RateLimit-Limit: 5
X-RateLimit-Remaining: 3
X-RateLimit-Reset: 1640995200
```

**Response (429)**:
```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests. Retry after 45 seconds."
  },
  "retryAfter": 45
}
```

---

## Database Schema (SQLite)

```sql
CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,                    -- UUID
  user_id TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('table', 'doc', 'sheet')),
  data TEXT NOT NULL,                     -- JSON blob
  title TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch('now')),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch('now')),
  deleted_at INTEGER,
  FOREIGN KEY (thread_id) REFERENCES messages(thread_id)
);

CREATE TABLE IF NOT EXISTS export_jobs (
  id TEXT PRIMARY KEY,                    -- UUID
  artifact_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  format TEXT NOT NULL CHECK(format IN ('pdf', 'docx', 'xlsx')),
  status TEXT NOT NULL CHECK(status IN ('processing', 'completed', 'failed')),
  download_url TEXT,
  expires_at INTEGER,
  error TEXT,
  progress INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch('now')),
  completed_at INTEGER,
  FOREIGN KEY (artifact_id) REFERENCES artifacts(id)
);

CREATE INDEX IF NOT EXISTS idx_artifacts_user_thread ON artifacts(user_id, thread_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_export_jobs_user ON export_jobs(user_id, created_at DESC);
```

---

## File Generation Libraries

### PDF (pdfkit)
```typescript
import PDFDocument from 'pdfkit';
// Generate PDF from table/doc data
```

### DOCX (docx)
```typescript
import { Document, Packer } from 'docx';
// Generate DOCX from document sections
```

### XLSX (exceljs)
```typescript
import ExcelJS from 'exceljs';
// Generate XLSX from spreadsheet cells
```

---

## Implementation Notes

1. **Async Export**: Use job queue (similar to memory-service)
2. **Storage**: Start with local FS, migrate to S3/Supabase later
3. **Validation**: Use Zod schemas (consistent with existing codebase)
4. **Error Handling**: Standardize error responses across all endpoints
5. **Caching**: Cache artifact data in Redis (optional, 5-minute TTL)
