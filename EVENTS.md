# Analytics & Logging Events Specification

**Version**: 1.0.0  
**Purpose**: Define telemetry events for artifact feature monitoring and analytics

---

## Event Types

### Gatekeeper Decision

**Event Name**: `gatekeeper_decision`

**When**: Gatekeeper classifier evaluates user message

**Properties**:
```typescript
{
  userId: string;                  // Required
  threadId: string;                // Required
  userText: string;                // Required (truncated to 200 chars)
  shouldCreate: boolean;           // Required
  type: "table" | "doc" | "sheet" | null;  // Required
  confidence: number;              // Required (0.0-1.0)
  rationale: string;               // Optional (truncated to 100 chars)
  latencyMs: number;               // Required (gatekeeper execution time)
  cached: boolean;                 // Optional (was result cached?)
  timestamp: number;               // Required (Unix timestamp)
}
```

**Example**:
```json
{
  "event": "gatekeeper_decision",
  "userId": "user_abc123",
  "threadId": "thread_xyz789",
  "userText": "Create a table comparing iPhone models",
  "shouldCreate": true,
  "type": "table",
  "confidence": 0.95,
  "rationale": "Explicit table request with structured data",
  "latencyMs": 45,
  "cached": false,
  "timestamp": 1640995200000
}
```

---

### Artifact Opened

**Event Name**: `artifact_opened`

**When**: User opens artifact pane or switches to artifact tab

**Properties**:
```typescript
{
  userId: string;                  // Required
  threadId: string;                // Required
  artifactId: string;              // Required
  type: "table" | "doc" | "sheet"; // Required
  source: "gatekeeper" | "manual" | "message_click";  // Required
  timestamp: number;               // Required
}
```

**Example**:
```json
{
  "event": "artifact_opened",
  "userId": "user_abc123",
  "threadId": "thread_xyz789",
  "artifactId": "art_123456",
  "type": "table",
  "source": "gatekeeper",
  "timestamp": 1640995200000
}
```

---

### Artifact Created

**Event Name**: `artifact_created`

**When**: Artifact successfully created via API

**Properties**:
```typescript
{
  userId: string;                  // Required
  threadId: string;                // Required
  artifactId: string;              // Required
  type: "table" | "doc" | "sheet"; // Required
  size: number;                    // Required (bytes)
  rows?: number;                   // Optional (table/sheet only)
  columns?: number;                // Optional (table/sheet only)
  sheets?: number;                 // Optional (sheet only)
  sections?: number;               // Optional (doc only)
  durationMs: number;              // Required (creation time)
  tokens?: number;                 // Optional (LLM tokens if LLM-generated)
  costEstimate?: number;           // Optional (estimated cost in USD)
  timestamp: number;               // Required
}
```

**Example (Table)**:
```json
{
  "event": "artifact_created",
  "userId": "user_abc123",
  "threadId": "thread_xyz789",
  "artifactId": "art_123456",
  "type": "table",
  "size": 2048,
  "rows": 10,
  "columns": 5,
  "durationMs": 120,
  "tokens": 350,
  "costEstimate": 0.0007,
  "timestamp": 1640995200000
}
```

**Example (Document)**:
```json
{
  "event": "artifact_created",
  "userId": "user_abc123",
  "threadId": "thread_xyz789",
  "artifactId": "art_789012",
  "type": "doc",
  "size": 8192,
  "sections": 4,
  "durationMs": 180,
  "tokens": 1200,
  "costEstimate": 0.0024,
  "timestamp": 1640995200000
}
```

---

### Export Started

**Event Name**: `export_started`

**When**: User initiates artifact export

**Properties**:
```typescript
{
  userId: string;                  // Required
  threadId: string;                // Required
  artifactId: string;              // Required
  exportJobId: string;             // Required
  format: "pdf" | "docx" | "xlsx"; // Required
  artifactType: "table" | "doc" | "sheet";  // Required
  artifactSize: number;            // Required (bytes)
  timestamp: number;               // Required
}
```

**Example**:
```json
{
  "event": "export_started",
  "userId": "user_abc123",
  "threadId": "thread_xyz789",
  "artifactId": "art_123456",
  "exportJobId": "job_987654",
  "format": "pdf",
  "artifactType": "table",
  "artifactSize": 2048,
  "timestamp": 1640995200000
}
```

---

### Export Completed

**Event Name**: `export_completed`

**When**: Export job successfully finishes

**Properties**:
```typescript
{
  userId: string;                  // Required
  threadId: string;                // Required
  artifactId: string;              // Required
  exportJobId: string;             // Required
  format: "pdf" | "docx" | "xlsx"; // Required
  fileSize: number;                // Required (bytes)
  durationMs: number;              // Required (export generation time)
  downloadUrl: string;             // Required (truncated to 100 chars for logs)
  storageBackend: "local" | "s3" | "supabase";  // Required
  timestamp: number;               // Required
}
```

**Example**:
```json
{
  "event": "export_completed",
  "userId": "user_abc123",
  "threadId": "thread_xyz789",
  "artifactId": "art_123456",
  "exportJobId": "job_987654",
  "format": "pdf",
  "fileSize": 45678,
  "durationMs": 2340,
  "downloadUrl": "https://artifacts.example.com/download/job_987654?token=...",
  "storageBackend": "s3",
  "timestamp": 1640995200000
}
```

---

### Export Failed

**Event Name**: `export_failed`

**When**: Export job fails

**Properties**:
```typescript
{
  userId: string;                  // Required
  threadId: string;                // Required
  artifactId: string;              // Required
  exportJobId: string;             // Required
  format: "pdf" | "docx" | "xlsx"; // Required
  errorCode: string;               // Required (e.g., "GENERATION_ERROR", "STORAGE_ERROR")
  errorMessage: string;            // Required (truncated to 200 chars)
  durationMs: number;              // Required (time before failure)
  timestamp: number;               // Required
}
```

**Example**:
```json
{
  "event": "export_failed",
  "userId": "user_abc123",
  "threadId": "thread_xyz789",
  "artifactId": "art_123456",
  "exportJobId": "job_987654",
  "format": "pdf",
  "errorCode": "GENERATION_ERROR",
  "errorMessage": "PDF generation failed: Invalid table structure",
  "durationMs": 1500,
  "timestamp": 1640995200000
}
```

---

### Artifact Deleted

**Event Name**: `artifact_deleted`

**When**: User deletes an artifact

**Properties**:
```typescript
{
  userId: string;                  // Required
  threadId: string;                // Required
  artifactId: string;              // Required
  type: "table" | "doc" | "sheet"; // Required
  ageSeconds: number;              // Required (how old was artifact)
  timestamp: number;               // Required
}
```

---

## Required Properties Summary

| Property | Events | Description |
|----------|--------|-------------|
| `userId` | All | Authenticated user ID |
| `threadId` | All | Conversation thread ID |
| `timestamp` | All | Unix timestamp (milliseconds) |
| `durationMs` | Created, Completed, Failed | Operation duration |
| `size` | Created | Artifact size in bytes |
| `costEstimate` | Created | Estimated cost in USD (optional) |
| `tokens` | Created | LLM tokens if LLM-generated (optional) |

---

## Logging Specifications

### Structured Logging Format

All events should be logged as JSON for easy parsing:

```typescript
logger.info({
  event: "artifact_created",
  userId,
  threadId,
  artifactId,
  // ... other properties
}, "Artifact created");
```

### Log Levels

- **INFO**: Normal operations (created, opened, completed)
- **WARN**: Failed exports, low-confidence gatekeeper decisions
- **ERROR**: System errors, rate limit violations

### Privacy & PII

- **Truncate**: `userText`, `rationale`, `errorMessage` to max lengths
- **Hash**: User IDs for analytics (optional, SHA-256)
- **No Storage**: Never log full artifact content (only metadata)

---

## Metrics to Track

### Success Rates

- Gatekeeper accuracy: `(correct decisions / total decisions) * 100`
- Artifact creation success: `(created / attempted) * 100`
- Export success: `(completed / started) * 100`

### Performance

- Gatekeeper latency: P50, P95, P99
- Artifact creation latency: P50, P95, P99
- Export generation time: P50, P95, P99

### Usage Patterns

- Artifacts per user per day
- Most popular artifact type (table/doc/sheet)
- Most popular export format (pdf/docx/xlsx)
- Average artifact size

### Error Rates

- Gatekeeper false positives/negatives
- Export failures by format
- Rate limit hits per user

---

## Analytics Integration

### Client-Side (Optional)

```typescript
// Track events in frontend (e.g., Google Analytics, PostHog)
analytics.track('artifact_created', {
  artifactId,
  type,
  // ... other properties
});
```

### Server-Side

```typescript
// Log to centralized logging (e.g., Datadog, CloudWatch)
logger.info({ event: 'artifact_created', ...properties });
```

### Storage

- **Short-term**: In-memory metrics (P95, success rates)
- **Long-term**: Time-series database (InfluxDB, TimescaleDB)
- **Analytics**: Data warehouse (BigQuery, Snowflake) for SQL queries

---

## Error Codes Reference

| Code | Description | Event |
|------|-------------|-------|
| `GENERATION_ERROR` | File generation failed | export_failed |
| `STORAGE_ERROR` | File storage failed | export_failed |
| `VALIDATION_ERROR` | Invalid artifact data | export_failed |
| `RATE_LIMIT_EXCEEDED` | Too many requests | All events |
| `TIMEOUT_ERROR` | Operation timeout | export_failed |
| `NOT_FOUND` | Artifact not found | export_failed |

---

## Implementation Checklist

- [ ] Add event logging to gatekeeper
- [ ] Add event logging to artifact creation endpoints
- [ ] Add event logging to export job queue
- [ ] Add structured logging (JSON format)
- [ ] Set up metrics dashboard (Grafana, Datadog)
- [ ] Configure alerts for error rates > 5%
- [ ] Set up analytics pipeline (if using external service)
- [ ] Document privacy policy for event data
