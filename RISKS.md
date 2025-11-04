# Risks & Mitigations Register

**Version**: 1.0.0  
**Purpose**: Identify and mitigate risks for 50/50 chat+artifact feature

---

## UX Risks

### RISK-001: False Positive Artifact Creation

**Severity**: Medium  
**Probability**: Medium

**Description**: Gatekeeper incorrectly triggers artifact creation for chat-only requests.

**Impact**:
- User confusion ("Why did it create a table?")
- Cluttered artifact pane
- User frustration

**Mitigation**:
1. Confidence threshold ≥0.8 for auto-create (lower requires confirmation)
2. "Undo" button to close artifact pane immediately
3. Analytics to track false positives and tune gatekeeper
4. User feedback mechanism ("Was this helpful?")

**Detection**: Track `gatekeeper_decision` events with `shouldCreate=true` but user closes artifact immediately.

---

### RISK-002: UI Clutter on Small Screens

**Severity**: High  
**Probability**: Medium

**Description**: 50/50 split view is unusable on mobile/tablet screens.

**Impact**:
- Poor user experience on mobile
- Feature appears broken
- User abandonment

**Mitigation**:
1. Responsive design: Single-pane on <768px, toggle button
2. Test on real devices (iPhone, Android tablets)
3. Progressive enhancement: Feature disabled by default on mobile
4. Clear visual indicators when split view is unavailable

**Detection**: User analytics for mobile vs desktop usage.

---

### RISK-003: Confusion Between Chat and Artifact

**Severity**: Medium  
**Probability**: Low

**Description**: Users don't understand the relationship between chat messages and artifacts.

**Impact**:
- Users don't know artifacts exist
- Users can't find artifacts after creation
- Lost productivity

**Mitigation**:
1. Visual connection: Highlight artifact references in chat messages
2. Tooltips: Explain artifact pane on first use
3. Empty state: Clear messaging about what artifacts are
4. Inline previews: Show artifact thumbnails in messages

**Detection**: Track artifact open rate vs creation rate.

---

## Technical Risks

### RISK-004: Streaming Collisions

**Severity**: High  
**Probability**: Low

**Description**: Artifact creation triggers during active chat streaming, causing race conditions.

**Impact**:
- Message state corruption
- Artifact data loss
- Application crashes

**Mitigation**:
1. Serialize operations: Queue artifact creation until streaming completes
2. State guards: Check `streaming === false` before artifact ops
3. Error boundaries: Catch and recover from state errors
4. Integration tests: Simulate concurrent streaming + artifact creation

**Evidence**: `apps/web/src/store/chatStore.ts:34` has `streaming` state flag.

---

### RISK-005: Tool-Call Timeouts

**Severity**: Medium  
**Probability**: Medium

**Description**: LLM tool-calling (if implemented) times out or fails mid-stream.

**Impact**:
- Incomplete artifact creation
- User confusion
- Need for retry logic

**Mitigation**:
1. Timeout guards: Max 30s for tool execution
2. Fallback: If tool-call fails, continue with text response
3. Retry logic: Exponential backoff for transient errors
4. User feedback: Show "Artifact creation in progress..." indicator

**Evidence**: `apps/llm-gateway/src/routes.ts` has no tool-call handling yet.

---

### RISK-006: Large File Generation Memory Leaks

**Severity**: High  
**Probability**: Medium

**Description**: Generating large PDF/DOCX/XLSX files consumes excessive memory.

**Impact**:
- Server OOM crashes
- Slow export times
- Service degradation

**Mitigation**:
1. Streaming generation: Use streams instead of in-memory buffers
2. File size limits: Max 100MB per export
3. Worker processes: Isolate export jobs in separate processes
4. Memory monitoring: Alert on memory usage >80%
5. Pagination: Split large artifacts into chunks

**Evidence**: No file generation libraries detected in current codebase.

---

### RISK-007: Storage Costs

**Severity**: Medium  
**Probability**: High

**Description**: Artifact storage (especially exports) grows unbounded.

**Impact**:
- High S3/Supabase costs
- Slow retrieval times
- Storage quota exceeded

**Mitigation**:
1. Retention policy: Delete exports after 30 days
2. Soft deletes: Mark deleted, hard delete after 7 days
3. Compression: Gzip JSON artifacts
4. Monitoring: Track storage growth rate
5. Quotas: Per-user storage limits (10GB default)

**Evidence**: `apps/llm-gateway/src/database.ts` uses SQLite, not cloud storage.

---

## Legal/Compliance Risks

### RISK-008: PII in Artifacts

**Severity**: High  
**Probability**: Medium

**Description**: Artifacts may contain PII (names, emails, addresses) without user consent.

**Impact**:
- GDPR violations
- Legal liability
- User trust loss

**Mitigation**:
1. PII detection: Scan artifact content before storage (similar to memory redaction)
2. User warning: Alert users if PII detected
3. Encryption: Encrypt artifacts at rest
4. Access controls: Ensure only artifact owner can access
5. Audit logs: Track who accessed artifacts

**Evidence**: `apps/memory-service/src/redaction.ts` has PII redaction patterns.

---

### RISK-009: Export File Retention

**Severity**: Medium  
**Probability**: Low

**Description**: Export files (PDF/DOCX/XLSX) stored indefinitely.

**Impact**:
- Compliance violations (data retention policies)
- Storage costs
- Security risk (old files with sensitive data)

**Mitigation**:
1. Auto-expiration: Delete export files after 30 days
2. Presigned URLs: Set expiration (1 hour default)
3. User-initiated deletion: Allow users to delete exports
4. Audit trail: Log all export deletions

**Evidence**: No retention policy exists in current codebase.

---

### RISK-010: Export Audit Trail

**Severity**: Medium  
**Probability**: Low

**Description**: No audit trail for who exported what artifacts.

**Impact**:
- Compliance gaps (SOC 2, ISO 27001)
- Security investigations impossible
- Legal discovery issues

**Mitigation**:
1. Audit logs: Log all export operations (who, what, when)
2. Immutable logs: Store logs in write-once storage
3. Retention: Keep audit logs for 1 year minimum
4. Access: Secure audit log access (admin only)

**Evidence**: `apps/memory-service/src/metrics.ts` has basic metrics, not audit logs.

---

## Operational Risks

### RISK-011: Rate Limit Abuse

**Severity**: Low  
**Probability**: Medium

**Description**: Users abuse artifact creation to generate excessive files.

**Impact**:
- Server overload
- Storage costs
- Service degradation for other users

**Mitigation**:
1. Rate limiting: 5 artifacts/minute, 2 exports/minute (per user)
2. Abuse detection: Block users creating >50 artifacts/hour
3. Quotas: Per-user daily limits (100 artifacts/day)
4. Monitoring: Alert on unusual activity patterns

**Evidence**: `apps/llm-gateway/src/routes.ts:27-42` has token bucket rate limiting.

---

### RISK-012: Export Job Queue Backlog

**Severity**: Medium  
**Probability**: Medium

**Description**: Export jobs queue up faster than workers can process.

**Impact**:
- Slow export times
- User frustration
- Queue overflow

**Mitigation**:
1. Worker scaling: Auto-scale workers based on queue depth
2. Priority queue: Prioritize small exports
3. Timeout: Fail exports after 5 minutes
4. Monitoring: Alert if queue depth >100

**Evidence**: `apps/memory-service/src/queue.ts` has job queue implementation.

---

## Phased Toggles / Feature Flags

### Feature Flags

```typescript
// Feature flags for gradual rollout
const flags = {
  artifactFeatureEnabled: boolean;        // Master switch
  gatekeeperEnabled: boolean;             // Enable/disable gatekeeper
  artifactCreationEnabled: boolean;       // Enable/disable creation
  exportEnabled: boolean;                 // Enable/disable exports
  splitViewEnabled: boolean;              // Enable/disable split UI
};
```

### Rollout Strategy

1. **Phase 1**: Internal testing (10% of users)
2. **Phase 2**: Beta (50% of users)
3. **Phase 3**: Full rollout (100% of users)

### Kill Switch

- Immediate disable: Set `artifactFeatureEnabled = false`
- Fallback: Users see chat-only mode
- No data loss: Artifacts remain, just not accessible

---

## Monitoring & Alerts

### Key Metrics to Monitor

| Metric | Threshold | Alert Action |
|--------|-----------|--------------|
| False positive rate | >10% | Tune gatekeeper |
| Export failure rate | >5% | Investigate errors |
| Export queue depth | >100 | Scale workers |
| Storage growth rate | >10GB/day | Review retention |
| Memory usage | >80% | Scale/optimize |

### Alert Channels

- **PagerDuty**: Critical errors (export failures >20%)
- **Slack**: Warnings (queue depth >50)
- **Email**: Daily digest (usage stats)

---

## Testing Strategy

### Risk-Based Testing

1. **RISK-004 (Streaming collisions)**: Concurrent test (stream + artifact)
2. **RISK-006 (Memory leaks)**: Large file generation test (100MB PDF)
3. **RISK-002 (Mobile clutter)**: Responsive design test (iPhone, iPad)
4. **RISK-001 (False positives)**: Gatekeeper accuracy test (1000 samples)

### Load Testing

- **Concurrent users**: 100 users creating artifacts simultaneously
- **Export load**: 50 concurrent exports
- **Storage**: Generate 1000 artifacts, measure storage growth

---

## Recommendations

1. **Start with MVP**: Table artifacts only, no exports
2. **Gradual rollout**: Feature flags for each component
3. **Monitor closely**: Track all metrics from day 1
4. **Iterate quickly**: Fix false positives within 48 hours
5. **User feedback**: In-app survey after first artifact creation
