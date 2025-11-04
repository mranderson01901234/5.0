# Phased Rollout Plan: 50/50 Chat+Artifact Feature

**Version**: 1.0.0  
**Status**: Planning  
**Target Completion**: TBD

---

## Overview

This plan outlines a phased approach to implementing the 50/50 split view feature for chat (left) + artifact creation (right). Each phase builds on the previous, enabling incremental delivery and risk mitigation.

---

## Phase 0: Audit & Planning ✅

**Status**: Complete  
**Duration**: 1 day

**Deliverables**:
- ✅ `AUDIT.md`: Current architecture analysis
- ✅ `TRIGGER_SPEC.md`: Natural-language → artifact decision rules
- ✅ `UI_SPEC.md`: 50/50 split layout specification
- ✅ `API_SPEC.md`: Artifact service contracts
- ✅ `EVENTS.md`: Analytics & logging events
- ✅ `RISKS.md`: Risk register with mitigations
- ✅ `PLAN.md`: This document

**Exit Criteria**:
- All documentation complete
- Stakeholder review approved
- Technical feasibility confirmed

---

## Phase 1: Gatekeeper Prototype + Feature Flags

**Status**: Not Started  
**Duration**: 3-5 days  
**Risk**: Low

### Goals

1. Implement pre-LLM gatekeeper classifier
2. Add feature flags infrastructure
3. Dry-run logging (no artifact creation yet)

### Tasks

#### 1.1 Gatekeeper Implementation
- [ ] Create `apps/llm-gateway/src/gatekeeper.ts`
  - Fast keyword matching (first pass)
  - LLM call to `gpt-4o-mini` for ambiguous cases
  - Confidence scoring algorithm
- [ ] Add `POST /api/artifacts/gatekeeper` endpoint
  - Zod schema validation
  - Rate limiting (20/second)
  - Caching (5-minute TTL)
- [ ] Unit tests for keyword patterns

#### 1.2 Feature Flags
- [ ] Create `apps/llm-gateway/src/featureFlags.ts`
  - Feature flag storage (env vars + database)
  - Per-user flags (for gradual rollout)
- [ ] Add flags:
  - `artifactFeatureEnabled` (master switch)
  - `gatekeeperEnabled`
  - `artifactCreationEnabled`
  - `exportEnabled`
  - `splitViewEnabled`

#### 1.3 Dry-Run Logging
- [ ] Integrate gatekeeper into chat flow (read-only)
- [ ] Log `gatekeeper_decision` events (see `EVENTS.md`)
- [ ] Add analytics dashboard (Grafana/Datadog)
- [ ] Track false positive/negative rates

### Acceptance Criteria

- Gatekeeper returns decisions in <100ms (P95)
- Feature flags toggle correctly
- Events logged for 100% of decisions
- False positive rate <15% (baseline)

### Rollout

- **Internal testing**: All team members
- **Beta**: 10% of users (feature flag `artifactFeatureEnabled=true`)
- **Monitoring**: Track decision accuracy, latency

---

## Phase 2: UI Split Shell + Empty Artifact Pane

**Status**: Not Started  
**Duration**: 5-7 days  
**Risk**: Medium

### Goals

1. Implement 50/50 split layout (UI only)
2. Add empty artifact pane with tabs
3. Ensure chat functionality unchanged

### Tasks

#### 2.1 UI Store
- [ ] Create `apps/web/src/store/uiStore.ts`
  - Zustand store for UI state
  - Actions: `setSplitView()`, `setArtifactPaneWidth()`, etc.
- [ ] Persist to LocalStorage (split view preference)

#### 2.2 Split Layout Components
- [ ] Create `apps/web/src/components/layout/SplitContainer.tsx`
  - Flexbox layout with resizable divider
  - Min widths: 400px each panel
- [ ] Create `apps/web/src/components/layout/ResizableDivider.tsx`
  - Mouse drag handling
  - Keyboard resize (arrow keys)
  - ARIA labels for accessibility

#### 2.3 Artifact Pane Shell
- [ ] Create `apps/web/src/components/artifacts/ArtifactPane.tsx`
  - Empty state component
  - Tab navigation (Table|Document|Spreadsheet|Preview)
  - Glass morphism styling (consistent with chat)

#### 2.4 Integration
- [ ] Modify `apps/web/src/layouts/MainChatLayout.tsx`
  - Conditional rendering based on `splitView` flag
  - Route param `?view=split` support
  - Responsive behavior (<768px = single-pane)

#### 2.5 Testing
- [ ] Visual regression tests
- [ ] Accessibility audit (WCAG 2.1 AA)
- [ ] Mobile/tablet responsive testing

### Acceptance Criteria

- Split view renders correctly on desktop (≥1024px)
- Resize works with mouse + keyboard
- Chat functionality identical to current (no regressions)
- Empty state displays when no artifact
- Mobile collapses to single-pane

### Rollout

- **Internal testing**: All team members
- **Beta**: 50% of users (feature flag `splitViewEnabled=true`)
- **Monitoring**: Track split view usage, resize interactions

---

## Phase 3: Table Artifact MVP

**Status**: Not Started  
**Duration**: 7-10 days  
**Risk**: Medium

### Goals

1. Implement table artifact creation (in-memory, no storage)
2. Render tables in artifact pane
3. Gatekeeper triggers table creation

### Tasks

#### 3.1 Table Artifact Type
- [ ] Create `apps/web/src/types/artifact.ts`
  - `Artifact`, `TableArtifact` types
- [ ] Create `apps/web/src/components/artifacts/TableEditor.tsx`
  - Table rendering (HTML table)
  - Basic editing (read-only initially)
  - Column/row highlighting

#### 3.2 Artifact Creation Flow
- [ ] Extend `useChatStream` hook
  - Detect gatekeeper decision
  - Create artifact in Zustand store
  - Open artifact pane automatically
- [ ] Create `apps/web/src/store/artifactStore.ts`
  - Artifact state management
  - Actions: `createArtifact()`, `updateArtifact()`

#### 3.3 Gatekeeper Integration
- [ ] Call gatekeeper in `useChatStream.send()`
  - Before LLM call (pre-LLM approach)
  - If `shouldCreate=true` and `type="table"`, create artifact
- [ ] Add confirmation prompt for confidence 0.6-0.79

#### 3.4 Table Data Extraction
- [ ] Parse LLM response for table data
  - Markdown table format (`|col1|col2|`)
  - JSON table format
  - Natural language extraction (future)
- [ ] Create `apps/web/src/lib/tableParser.ts`
  - Markdown table → `{columns, rows}`

#### 3.5 Testing
- [ ] Unit tests for table parser
- [ ] Integration tests: gatekeeper → artifact creation
- [ ] E2E tests: User message → table appears

### Acceptance Criteria

- Tables render correctly in artifact pane
- Gatekeeper accuracy >85% for table requests
- Table creation latency <500ms (P95)
- No chat functionality regressions

### Rollout

- **Beta**: 50% of users (`artifactCreationEnabled=true`)
- **Monitoring**: Track table creation success rate, user feedback

---

## Phase 4: Document + Spreadsheet MVP

**Status**: Not Started  
**Duration**: 10-14 days  
**Risk**: Medium

### Goals

1. Implement document artifact creation
2. Implement spreadsheet artifact creation
3. Support all three artifact types in UI

### Tasks

#### 4.1 Document Artifact
- [ ] Create `apps/web/src/components/artifacts/DocumentEditor.tsx`
  - Section rendering
  - Markdown support
  - Read-only initially
- [ ] Document data extraction from LLM
  - Parse section headers
  - Extract content blocks

#### 4.2 Spreadsheet Artifact
- [ ] Create `apps/web/src/components/artifacts/SpreadsheetEditor.tsx`
  - Grid rendering (basic)
  - Cell editing (future)
  - Sheet tabs
- [ ] Spreadsheet data extraction from LLM
  - Parse cell references (A1, B2)
  - Extract sheet names

#### 4.3 Backend API (In-Memory)
- [ ] Create `apps/llm-gateway/src/artifacts/` module
  - `POST /api/artifacts/doc.create`
  - `POST /api/artifacts/sheet.create`
  - Validation schemas (Zod)
  - In-memory storage (no database yet)

#### 4.4 UI Integration
- [ ] Update `ArtifactPane` to support all types
- [ ] Tab switching between artifact types
- [ ] Empty state for each type

#### 4.5 Testing
- [ ] Unit tests for document/spreadsheet parsers
- [ ] E2E tests for all artifact types
- [ ] Gatekeeper accuracy for doc/sheet requests

### Acceptance Criteria

- All three artifact types render correctly
- Gatekeeper accuracy >80% for doc/sheet requests
- No performance regressions

### Rollout

- **Beta**: 50% of users
- **Monitoring**: Track artifact type distribution, creation success rates

---

## Phase 5: Export Pipeline + Storage + Rate Limits

**Status**: Not Started  
**Duration**: 10-14 days  
**Risk**: High

### Goals

1. Implement file generation (PDF/DOCX/XLSX)
2. Add storage backend (local FS → S3/Supabase)
3. Implement export job queue
4. Add rate limiting for artifact operations

### Tasks

#### 5.1 File Generation Libraries
- [ ] Install dependencies:
  - `pdfkit` (PDF)
  - `docx` (DOCX)
  - `exceljs` (XLSX)
- [ ] Create `apps/llm-gateway/src/artifacts/generators/`
  - `pdfGenerator.ts`
  - `docxGenerator.ts`
  - `xlsxGenerator.ts`
- [ ] Unit tests for each generator

#### 5.2 Storage Backend
- [ ] Create `apps/llm-gateway/src/storage/` module
  - Local FS implementation (development)
  - S3 implementation (production)
  - Supabase implementation (optional)
- [ ] Environment-based selection

#### 5.3 Export Job Queue
- [ ] Create `apps/llm-gateway/src/artifacts/exportQueue.ts`
  - Job queue (similar to memory-service)
  - Worker processes for export generation
  - Status tracking (processing/completed/failed)
- [ ] Add `POST /api/artifacts/export` endpoint
  - Queue export job
  - Return job ID immediately
- [ ] Add `GET /api/artifacts/export/:jobId` endpoint
  - Poll for status
  - Return download URL when ready

#### 5.4 Database Schema
- [ ] Create `artifacts` table (SQLite)
- [ ] Create `export_jobs` table
- [ ] Add indexes for performance

#### 5.5 Rate Limiting
- [ ] Separate rate limiters for artifact endpoints
  - Gatekeeper: 20/second
  - Create: 5/minute
  - Export: 2/minute
- [ ] Per-user quotas (100 artifacts/day)

#### 5.6 Frontend Export UI
- [ ] Add "Export" button in artifact pane
- [ ] Export format selector (PDF/DOCX/XLSX)
- [ ] Progress indicator (polling job status)
- [ ] Download button when ready

#### 5.7 Testing
- [ ] Load test: 50 concurrent exports
- [ ] Large file test: 100MB PDF
- [ ] Storage integration tests

### Acceptance Criteria

- Export files generated correctly for all formats
- Export jobs process within 30s (P95)
- Storage backend works (local + cloud)
- Rate limiting prevents abuse
- No memory leaks in export generation

### Rollout

- **Beta**: 25% of users (`exportEnabled=true`)
- **Monitoring**: Track export success rate, storage costs, queue depth

---

## Phase 6: Telemetry, SLOs, On-Call Docs

**Status**: Not Started  
**Duration**: 5-7 days  
**Risk**: Low

### Goals

1. Comprehensive telemetry integration
2. Define SLOs (Service Level Objectives)
3. Create on-call runbooks

### Tasks

#### 6.1 Event Logging
- [ ] Implement all events from `EVENTS.md`
  - `gatekeeper_decision`
  - `artifact_created`
  - `artifact_opened`
  - `export_started`
  - `export_completed`
  - `export_failed`
- [ ] Structured logging (JSON format)
- [ ] Privacy: Truncate/hash sensitive data

#### 6.2 Metrics Dashboard
- [ ] Create Grafana/Datadog dashboard
  - Gatekeeper accuracy
  - Artifact creation success rate
  - Export success rate
  - Latency percentiles (P50, P95, P99)
  - Storage growth
- [ ] Set up alerts (see `RISKS.md`)

#### 6.3 SLOs Definition
- [ ] Define targets:
  - Gatekeeper latency: P95 <100ms
  - Artifact creation: P95 <500ms, success rate >95%
  - Export generation: P95 <30s, success rate >90%
- [ ] Error budgets: 1% of requests can fail

#### 6.4 On-Call Runbooks
- [ ] Document common issues:
  - Export queue backlog
  - False positive spike
  - Storage quota exceeded
- [ ] Escalation procedures
- [ ] Rollback procedures (feature flags)

#### 6.5 Documentation
- [ ] User documentation (how to use artifacts)
- [ ] Developer documentation (API reference)
- [ ] Operational runbooks

### Acceptance Criteria

- All events logged correctly
- Dashboard shows real-time metrics
- SLOs met (measure for 1 week)
- On-call docs reviewed by team

### Rollout

- **Production**: Full rollout
- **Monitoring**: Continuous SLO tracking

---

## Post-Launch: Iteration & Optimization

### Ongoing Tasks

1. **Gatekeeper Tuning**: Improve accuracy based on user feedback
2. **Performance Optimization**: Reduce latency, memory usage
3. **Feature Enhancements**:
   - Inline artifact previews in messages
   - Artifact versioning
   - Collaborative editing (future)
4. **User Feedback**: In-app surveys, analytics analysis

---

## Timeline Estimate

| Phase | Duration | Start | End |
|-------|----------|-------|-----|
| Phase 0 | 1 day | ✅ Complete | ✅ Complete |
| Phase 1 | 3-5 days | TBD | TBD |
| Phase 2 | 5-7 days | TBD | TBD |
| Phase 3 | 7-10 days | TBD | TBD |
| Phase 4 | 10-14 days | TBD | TBD |
| Phase 5 | 10-14 days | TBD | TBD |
| Phase 6 | 5-7 days | TBD | TBD |
| **Total** | **41-58 days** | | |

**Note**: Phases can overlap (e.g., Phase 1 + Phase 2 in parallel with different developers)

---

## Dependencies

### External Dependencies
- LLM API access (OpenAI/Anthropic/Google)
- Storage backend (S3/Supabase) credentials
- Analytics service (Datadog/Grafana)

### Internal Dependencies
- Feature flag infrastructure (Phase 1)
- UI store (Phase 2)
- Gatekeeper (Phase 1)
- Export queue (Phase 5)

---

## Success Metrics

### Phase 1-2 (Foundation)
- Feature flags toggle correctly
- Split view renders without regressions
- Gatekeeper accuracy >80%

### Phase 3-4 (MVP)
- Artifact creation success rate >95%
- User satisfaction >4/5 (survey)
- False positive rate <10%

### Phase 5-6 (Production)
- Export success rate >90%
- SLOs met (latency, success rates)
- Storage costs within budget
- Zero critical bugs in production

---

## Rollback Plan

### Immediate Rollback (Feature Flags)
- Set `artifactFeatureEnabled = false`
- Users see chat-only mode
- No data loss

### Partial Rollback
- Disable specific components:
  - `exportEnabled = false` (disable exports only)
  - `artifactCreationEnabled = false` (disable creation)
  - `splitViewEnabled = false` (disable split UI)

### Data Migration (if needed)
- Export all artifacts to JSON
- Archive in S3/Supabase
- Restore if rollback reversed

---

## Open Questions

1. **Tool-Calling vs Pre-LLM**: Which approach is better? (See `TRIGGER_SPEC.md`)
2. **Storage Backend**: S3 vs Supabase? Cost comparison needed.
3. **Export Format Priority**: PDF first, or all formats simultaneously?
4. **Mobile Strategy**: Full support or desktop-only initially?

---

## Next Steps

1. Review and approve this plan
2. Assign phase owners
3. Set up project board (GitHub Projects/Jira)
4. Create feature branches: `feature/artifact-{phase}`
5. Begin Phase 1 implementation
