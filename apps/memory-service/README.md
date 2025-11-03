# Memory Service

Background smart memory processing for the LLM Gateway.

## Architecture

Non-blocking, fire-and-forget service that:
- Receives message events from the gateway
- Scores quality using Q = 0.4r + 0.3i + 0.2c + 0.1h
- Redacts PII with reversible mapping
- Stores memories in SQLite with optimized PRAGMAs
- Triggers audits based on cadence (≥6 msgs, ≥1500 tokens, ≥3 min)

## Usage

```bash
# Install dependencies
pnpm install

# Run dev server
pnpm dev

# Run tests
pnpm test

# Build
pnpm build

# Start production
pnpm start
```

## Environment Variables

- `PORT`: Server port (default: 3001)
- `HOST`: Server host (default: 0.0.0.0)
- `DB_PATH`: SQLite database path (default: ./data/memory.db)
- `LOG_LEVEL`: Logging level (default: info)

## API Endpoints

### POST /v1/events/message
Fire-and-forget message event from gateway. Triggers cadence tracking and audit jobs.

**Request Body:**
```json
{
  "userId": "string",
  "threadId": "string",
  "msgId": "string",
  "role": "user" | "assistant" | "system",
  "content": "string",
  "tokens": {
    "input": 100,
    "output": 50
  },
  "timestamp": 1234567890
}
```

**Response:** 202 Accepted

### POST /v1/jobs/audit
Manually trigger an audit (for testing).

**Request Body:**
```json
{
  "userId": "string",
  "threadId": "string"
}
```

**Response:** 202 Accepted

### GET /v1/memories
List memories with filters.

**Query Parameters:**
- `userId` (required): User ID
- `threadId` (optional): Thread ID
- `limit` (default: 20, max: 100): Results per page
- `offset` (default: 0): Pagination offset
- `minPriority` (optional): Minimum priority score
- `includeDeleted` (default: false): Include soft-deleted memories

**Response:**
```json
{
  "memories": [...],
  "total": 42,
  "limit": 20,
  "offset": 0
}
```

### PATCH /v1/memories/:id
Update a memory.

**Request Body:**
```json
{
  "content": "string (optional)",
  "priority": 0.8,
  "deleted": false
}
```

**Response:** Updated memory object

### GET /v1/metrics
System health and performance metrics.

**Response:**
```json
{
  "jobs": {
    "enqueued": 120,
    "processed": 115,
    "failed": 2,
    "avgLatencyMs": 45,
    "p95LatencyMs": 89
  },
  "memories": {
    "total": 234,
    "savedLastHour": 12,
    "deleted": 5,
    "avgPriority": 0.72
  },
  "audits": {
    "total": 48,
    "avgScore": 0.68,
    "savesPerAudit": 2.3
  },
  "rejections": {
    "belowThreshold": 15,
    "redactedAll": 3,
    "tooLong": 1,
    "rateLimited": 0
  },
  "health": {
    "dbSizeMb": 12.4,
    "queueDepth": 2,
    "lastAuditMsAgo": 45000
  }
}
```

### GET /health
Simple health check.

**Response:**
```json
{
  "status": "ok",
  "timestamp": 1234567890
}
```

## Configuration

See `config/memory.json` for tunable parameters:
- Quality score threshold (default: 0.65)
- Cadence thresholds (msg, token, time)
- Performance budgets (soft: 120ms, hard: 300ms)
- Batch window (300ms)
- Database path and cleanup intervals

## Testing

Comprehensive unit tests for:
- Quality scorer (scorer.spec.ts)
- PII redaction (redaction.spec.ts)
- Cadence triggers (cadence.spec.ts)

Run with:
```bash
pnpm test
```

## Performance

- SQLite with WAL mode, NORMAL sync, mmap (256MB), cache (80MB)
- Write-behind batching with 300ms windows
- Fire-and-forget HTTP emission with 50ms timeout
- In-process job queue with priority scheduling
- 30s audit debounce to prevent thrashing

## Privacy

All PII is redacted before storage:
- Email addresses
- Phone numbers
- SSN
- Credit cards
- API keys
- JWT tokens
- IPv4 addresses (except localhost/private)

Redaction mapping is stored separately for restoration if needed.

## See Also

- [MEMORY_BLUEPRINT.md](../../docs/MEMORY_BLUEPRINT.md) - Complete design document
- Gateway integration: `apps/llm-gateway/src/memoryEmitter.ts`
