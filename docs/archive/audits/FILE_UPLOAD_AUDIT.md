# File Upload Feature Audit Report

**Date**: $(date)  
**Scope**: Web application file upload functionality  
**Status**: AUDIT ONLY - No implementation changes made

---

## Executive Summary

The web application currently has **NO file upload feature implemented** in the frontend. However, there is **infrastructure** in place for file storage and processing in the backend. This report details what exists, what's missing, and recommendations for implementation.

---

## 1. Current State Analysis

### 1.1 Frontend (Web Application)

#### ✅ What EXISTS:
- **Component**: `CenterComposer.tsx` - Text-only chat input component
  - Location: `apps/web/src/components/home/CenterComposer.tsx`
  - Features: Auto-resizing textarea, Enter/Shift+Enter handling, paste support
  - **Status**: NO file upload capability

#### ❌ What's MISSING:
- No file input element (`<input type="file">`)
- No file attachment UI components
- No file preview components
- No drag-and-drop file upload area
- No file upload state management
- No file validation (size, type, etc.)
- No file upload progress indicators
- No file attachment preview/renderer in messages
- No FormData handling for multipart uploads
- No file upload API service functions

**Files Searched**:
- `apps/web/src/components/home/CenterComposer.tsx` - No file upload code
- `apps/web/src/services/gateway.ts` - No file upload API calls
- `apps/web/src/hooks/useChatStream.ts` - No file handling in stream
- All frontend components - No file input elements found

---

### 1.2 Backend (LLM Gateway)

#### ✅ What EXISTS:

**1. Storage Infrastructure** ✅
- **Storage Adapter Interface**: `apps/llm-gateway/src/storage/adapter.ts`
  - Interface: `StorageAdapter` with `upload()` and `getUrl()` methods
  - Supports both local filesystem and S3 storage

- **Local Storage Adapter**: `apps/llm-gateway/src/storage/local.ts`
  - Stores files in `./data/exports` directory
  - Returns URLs like `http://localhost:8787/api/exports/{path}`
  - **Status**: Fully implemented

- **S3 Storage Adapter**: `apps/llm-gateway/src/storage/s3.ts`
  - AWS S3 integration with presigned URLs
  - Configurable bucket, region, expiry
  - **Status**: Fully implemented

- **Storage Factory**: `apps/llm-gateway/src/storage/index.ts`
  - Creates storage adapter based on `STORAGE_BACKEND` env var
  - Supports 'local' and 's3' backends
  - **Status**: Fully implemented

**2. File Serving Endpoint** ✅
- **GET `/api/exports/*`**: `apps/llm-gateway/src/routes.ts:2780`
  - Serves exported files (PDF, DOCX, XLSX)
  - Security: Prevents directory traversal
  - Content-Type detection based on file extension
  - **Status**: Working, but only for exports (not user uploads)

**3. Artifact Creation API** ✅
- **POST `/api/artifacts/create`**: `apps/llm-gateway/src/routes.ts:2128`
  - Creates artifacts (table, doc, sheet, image)
  - Accepts JSON body with artifact data
  - Stores in SQLite database
  - **Status**: Works, but expects JSON data (not file uploads)

**4. Export Worker** ✅
- **Export Processing**: `apps/llm-gateway/src/workers/exportWorker.ts`
  - Processes artifact exports (PDF, DOCX, XLSX)
  - Uses storage adapter to upload files
  - **Status**: Working, but only for artifact exports

#### ❌ What's MISSING:

**1. File Upload Endpoint**
- No `POST /api/uploads` or `/v1/uploads` endpoint
- No multipart/form-data handling
- No file validation middleware
- No file size limits
- No file type restrictions
- No file processing pipeline

**2. File Storage for User Uploads**
- Storage adapters exist but are only used for exports
- No dedicated storage path for user uploads
- No file metadata storage (filename, size, mime type, etc.)

**3. Database Schema**
- No `uploads` or `attachments` table in database
- No foreign key relationships between messages and files
- Artifacts table exists but is for generated artifacts, not uploads

**4. File Processing**
- No image processing/resizing
- No document parsing (PDF, DOCX, etc.)
- No file conversion utilities
- No OCR capabilities

**5. File Security**
- No virus scanning
- No file content validation
- No access control for uploaded files
- No file expiration/cleanup policies

---

### 1.3 API Routes Analysis

**Existing Routes** (`apps/llm-gateway/src/routes.ts`):
- ✅ `POST /api/artifacts/create` - Creates artifacts from JSON data
- ✅ `POST /api/artifacts/export` - Exports artifacts to files
- ✅ `GET /api/exports/*` - Serves exported files
- ✅ `GET /api/exports/status/:id` - Gets export status
- ❌ **NO file upload endpoint**

**Missing Routes**:
- ❌ `POST /api/uploads` or `/v1/uploads` - Upload files
- ❌ `GET /api/uploads/:id` - Get uploaded file
- ❌ `DELETE /api/uploads/:id` - Delete uploaded file
- ❌ `GET /api/uploads` - List user's uploads

---

## 2. Architecture Overview

### 2.1 Current Flow (Artifacts Only)

```
User Request → LLM Gateway → Generate Artifact → Store in DB → Create Export Job → 
Export Worker → Generate File → Upload to Storage → Return URL
```

### 2.2 Proposed Flow (With File Uploads)

```
User Selects File → Frontend Validation → POST /api/uploads (multipart) → 
Backend Validation → Upload to Storage → Store Metadata in DB → 
Return File ID → Attach to Message → Include in Chat Context
```

---

## 3. Implementation Requirements

### 3.1 Frontend Requirements

**High Priority**:
1. **File Input Component**
   - Add file input to `CenterComposer.tsx`
   - Support drag-and-drop
   - Accept multiple file types (images, documents, text files)
   - File size validation (e.g., max 10MB per file)

2. **File Preview Component**
   - Preview images before upload
   - Show file info (name, size, type) for other files
   - Allow removing files before sending

3. **Upload State Management**
   - Track upload progress
   - Handle upload errors
   - Manage file attachments in chat state

4. **File Display in Messages**
   - Render uploaded images inline
   - Show file attachments with download links
   - Display file metadata

**Medium Priority**:
1. Multiple file selection
2. Upload progress indicators
3. File type icons
4. File size formatting

**Low Priority**:
1. Image resizing before upload
2. File compression
3. Paste image from clipboard

### 3.2 Backend Requirements

**High Priority**:
1. **File Upload Endpoint**
   - `POST /api/uploads` or `/v1/uploads`
   - Accept `multipart/form-data`
   - Validate file size (configurable limit)
   - Validate file type (MIME type whitelist)
   - Generate unique file IDs
   - Upload to storage adapter
   - Store metadata in database

2. **Database Schema**
   ```sql
   CREATE TABLE IF NOT EXISTS uploads (
     id TEXT PRIMARY KEY,
     user_id TEXT NOT NULL,
     thread_id TEXT,
     filename TEXT NOT NULL,
     mime_type TEXT NOT NULL,
     size INTEGER NOT NULL,
     storage_path TEXT NOT NULL,
     storage_url TEXT NOT NULL,
     created_at INTEGER NOT NULL DEFAULT (unixepoch('now')),
     deleted_at INTEGER
   );
   
   CREATE INDEX IF NOT EXISTS idx_uploads_user_thread 
     ON uploads(user_id, thread_id) WHERE deleted_at IS NULL;
   ```

3. **File Serving Endpoint**
   - `GET /api/uploads/:id` - Serve uploaded files
   - Access control (only owner can access)
   - Proper Content-Type headers
   - Security: Prevent directory traversal

4. **File Validation**
   - File size limits (env configurable)
   - Allowed MIME types whitelist
   - Filename sanitization
   - Content validation (check file signatures)

**Medium Priority**:
1. File deletion endpoint
2. File list endpoint (per user/thread)
3. File cleanup job (remove old files)
4. Virus scanning integration

**Low Priority**:
1. Image resizing/optimization
2. PDF parsing/extraction
3. Document text extraction
4. OCR capabilities

---

## 4. Integration Points

### 4.1 Chat Integration

**Current**: Messages only contain text content
```typescript
type Message = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string; // Only text
  sources?: Array<...>;
};
```

**Proposed**: Add file attachments
```typescript
type Message = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  attachments?: Array<{
    id: string;
    filename: string;
    mimeType: string;
    url: string;
  }>;
  sources?: Array<...>;
};
```

### 4.2 LLM Context Integration

**Proposed**: Include file content in LLM context
- For images: Include in vision model context (if supported)
- For documents: Extract text and include in prompt
- For text files: Include directly in context

---

## 5. Security Considerations

### 5.1 Current Security (Storage)
- ✅ Directory traversal prevention in export serving
- ✅ File path validation
- ✅ User authentication required

### 5.2 Required Security Enhancements

1. **File Upload Validation**
   - File size limits (prevent DoS)
   - MIME type validation (prevent malicious uploads)
   - Filename sanitization (prevent path injection)
   - Content validation (magic number checking)

2. **Access Control**
   - Files only accessible by owner
   - Thread-based access control (optional)
   - Rate limiting on uploads

3. **Storage Security**
   - Secure file storage paths
   - Encrypted storage (optional)
   - Virus scanning (recommended)

4. **Data Privacy**
   - File retention policies
   - Automatic cleanup of old files
   - GDPR compliance (file deletion on user request)

---

## 6. Dependencies

### 6.1 Frontend Dependencies
- ✅ None required (can use native HTML5 File API)
- Optional: `react-dropzone` for drag-and-drop
- Optional: `file-saver` for download functionality

### 6.2 Backend Dependencies
- ✅ `@fastify/multipart` - Required for multipart/form-data parsing
- ✅ Storage adapters already exist (local/S3)
- Optional: `sharp` for image processing
- Optional: `pdf-parse` for PDF text extraction
- Optional: `mammoth` for DOCX text extraction

---

## 7. Configuration

### 7.1 Environment Variables Needed

**Backend**:
```env
# File upload limits
MAX_UPLOAD_SIZE=10485760  # 10MB in bytes
MAX_FILES_PER_UPLOAD=5

# Allowed file types (comma-separated MIME types)
ALLOWED_MIME_TYPES=image/jpeg,image/png,image/gif,image/webp,application/pdf,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document

# Storage configuration (already exists)
STORAGE_BACKEND=local  # or 's3'
EXPORT_STORAGE_PATH=./data/exports
UPLOAD_STORAGE_PATH=./data/uploads  # New
```

**Frontend**:
```env
# File upload limits (should match backend)
VITE_MAX_UPLOAD_SIZE=10485760
VITE_MAX_FILES_PER_UPLOAD=5
```

---

## 8. Testing Requirements

### 8.1 Frontend Tests
- File selection and validation
- File preview rendering
- Upload progress tracking
- Error handling
- File removal before upload
- Multiple file handling

### 8.2 Backend Tests
- File upload endpoint
- File validation (size, type)
- File storage (local and S3)
- File serving endpoint
- Access control
- Error handling
- File cleanup

### 8.3 Integration Tests
- End-to-end file upload flow
- File attachment to messages
- File display in chat
- File deletion

---

## 9. Implementation Recommendations

### 9.1 Phase 1: Basic File Upload (MVP)
1. Add file input to `CenterComposer.tsx`
2. Create file upload API endpoint
3. Implement basic file storage
4. Add file metadata to database
5. Display uploaded files in messages

### 9.2 Phase 2: Enhanced Features
1. Drag-and-drop support
2. File previews
3. Upload progress indicators
4. Multiple file support
5. File type validation

### 9.3 Phase 3: Advanced Features
1. Image optimization
2. Document text extraction
3. File cleanup jobs
4. Virus scanning
5. File sharing/permissions

---

## 10. Risk Assessment

### 10.1 High Risk
- **File size limits**: Without proper limits, could cause DoS
- **Storage costs**: Large files could increase storage costs significantly
- **Security vulnerabilities**: Malicious file uploads could compromise server

### 10.2 Medium Risk
- **Performance**: Large file uploads could slow down API
- **Storage space**: Need cleanup mechanism for old files
- **User experience**: Poor upload UX could frustrate users

### 10.3 Low Risk
- **Browser compatibility**: File API is well-supported
- **Backend scaling**: Storage adapters handle scaling

---

## 11. Conclusion

### Summary
- ✅ **Backend infrastructure exists** (storage adapters, file serving)
- ❌ **No file upload endpoint** exists
- ❌ **No frontend file upload UI** exists
- ❌ **No database schema** for file uploads

### Recommendation
Implement file upload feature in phases:
1. **Phase 1**: Basic file upload with validation
2. **Phase 2**: Enhanced UX (previews, progress)
3. **Phase 3**: Advanced features (processing, cleanup)

The existing storage infrastructure provides a solid foundation, but significant work is needed in:
- Frontend UI components
- Backend upload endpoint
- Database schema
- Integration with chat system

---

## 12. Files to Create/Modify

### Frontend Files to Create:
- `apps/web/src/components/chat/FileUpload.tsx` - File upload component
- `apps/web/src/components/chat/FilePreview.tsx` - File preview component
- `apps/web/src/components/chat/FileAttachment.tsx` - File attachment display
- `apps/web/src/services/upload.ts` - File upload API service

### Frontend Files to Modify:
- `apps/web/src/components/home/CenterComposer.tsx` - Add file input
- `apps/web/src/components/chat/MessageItem.tsx` - Display file attachments
- `apps/web/src/store/chatStore.ts` - Add attachment state management
- `apps/web/src/hooks/useChatStream.ts` - Include files in message context

### Backend Files to Create:
- `apps/llm-gateway/src/routes/uploads.ts` - Upload routes (or add to routes.ts)
- `apps/llm-gateway/src/middleware/fileValidation.ts` - File validation middleware

### Backend Files to Modify:
- `apps/llm-gateway/src/routes.ts` - Add upload endpoints
- `apps/llm-gateway/src/database.ts` - Add uploads table schema

---

**End of Audit Report**

