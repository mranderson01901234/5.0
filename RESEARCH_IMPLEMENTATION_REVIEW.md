# Hidden Research via Memory-Review Cadence: Implementation Review

## Executive Summary

This document reviews the prompt requirements against the current codebase implementation and identifies gaps, conflicts, and revision suggestions before building the plan.

---

## Critical Gaps & Mismatches

### 1. Memory Review Cadence Mismatch

**Prompt Requirement:**
- Trigger research "~every 8 turns" during memory review batches

**Current Implementation:**
- `apps/memory-service/src/cadence.ts`: Triggers on `msgCount >= 6`, `tokenCount >= 1500`, or `timeElapsed >= 3min`
- **Issue**: Not turn-based; uses message/token/time thresholds instead of strict 8-turn cadence
- **Impact**: Research may trigger at different intervals than expected

**Revision Suggestion:**
- Add turn tracking to `CadenceTracker` alongside existing thresholds
- Consider hybrid: use turn-based for research jobs, keep thresholds for audit jobs
- Or clarify: "8 turns" means 8 message pairs (user+assistant), or 8 user messages?

---

### 2. Missing Topic/Entity Extraction

**Prompt Requirement:**
- Memory review emits `{topic, entities, lastVerified, freshness}` 
- Enqueue research when "Topic stable AND (stale per TTL OR low-confidence memories)"

**Current Implementation:**
- `apps/memory-service/src/routes.ts` (audit handler): Only scores and saves messages
- **Issue**: No topic extraction, no entity detection, no topic stability tracking
- No `lastVerified` timestamps or freshness checks

**Revision Suggestion:**
- Add topic extraction module (LLM-based or keyword-based)
- Track topic stability across batches (persist topic → threadId mapping)
- Add entity extraction (can reuse existing `ENTITY_MARKERS` from `scorer.ts`)
- Store `lastVerified` per topic in database or in-memory cache

---

### 3. No Sidecar Architecture

**Prompt Requirement:**
- Sidecar-only network I/O in `sidecar/research/*`
- Research runs in worker, never blocks chat

**Current Implementation:**
- No `sidecar/` directory exists
- **Issue**: Entire sidecar structure must be created from scratch

**Revision Suggestion:**
- Create `sidecar/research/` at workspace root or in `apps/`
- Clarify: Is sidecar a separate service/process, or just an isolated module?
- If separate process, need inter-process communication (Redis pub/sub, HTTP, or queue)

---

### 4. No Redis Integration

**Prompt Requirement:**
- Publish capsules to Redis `factPack:{threadId}:{batchId}`
- Cache keys use Redis
- Use Redis for negative caching

**Current Implementation:**
- No Redis client found in codebase
- **Issue**: Need to add Redis dependency and connection

**Revision Suggestion:**
- Add `ioredis` or `redis` package
- Create Redis connection module (with graceful fallback if Redis unavailable)
- Use in-memory cache as fallback for development

---

### 5. Job Queue Type Missing

**Prompt Requirement:**
- Memory review enqueues `ResearchJob` to research queue

**Current Implementation:**
- `apps/memory-service/src/queue.ts`: Only supports `'audit'` and `'write-batch'` types
- **Issue**: Need to add `'research'` job type, or create separate research queue

**Revision Suggestion:**
- Extend `Job` interface to include `'research'` type
- Or create separate `ResearchQueue` if sidecar is separate process
- Handle priority: research jobs should be lower than audit jobs

---

### 6. Missing Early-Window Injection

**Prompt Requirement:**
- Chat streaming server polls for `factPack:{turnId}` during first 2-3s
- If capsule arrives, inject into response (non-blocking)

**Current Implementation:**
- `apps/llm-gateway/src/routes.ts`: Streaming route has no research polling
- **Issue**: No mechanism to inject research capsules into streaming response

**Revision Suggestion:**
- Add polling loop in streaming route (non-blocking, early window only)
- Use Redis pub/sub or polling to check for capsules
- Clarify: How to inject into SSE stream? Append to first token? Use special event type?

---

### 7. Auto-Search Orchestrator Reference

**Prompt Requirement:**
- "Remove any existing awaits to auto-search on the hot path (`apps/web/lib/autoSearch/orchestrator.ts`)"

**Current Implementation:**
- File does not exist in this codebase
- `RESEARCH_AUTO_SUGGEST_AUDIT.md` documents auto-search, but no actual files found

**Revision Suggestion:**
- **Clarification needed**: Does this file exist elsewhere? Is it in a different repo?
- If it doesn't exist, remove this requirement or mark as N/A
- If it does exist, need to locate it first

---

### 8. Missing Environment Configuration

**Prompt Requirement:**
- Add flags to `.env.example`: `RESEARCH_SIDECAR_ENABLED`, `FEATURE_MEMORY_REVIEW_TRIGGER`, etc.

**Current Implementation:**
- No `.env.example` file found
- **Issue**: Need to create one with all flags

**Revision Suggestion:**
- Create `.env.example` with all required flags
- Add validation/loading in config modules
- Document default values (flags disabled by default for safety)

---

### 9. Missing Topic Classification

**Prompt Requirement:**
- `ttlClass`: `'news/current'|'pricing'|'releases'|'docs'|'general'`
- `recencyHint`: `'day'|'week'|'month'`

**Current Implementation:**
- No topic classification logic exists
- **Issue**: Need to classify topics to determine cache TTL and search freshness

**Revision Suggestion:**
- Add topic classifier (LLM-based or rule-based)
- Use keywords/patterns from `RESEARCH_AUTO_SUGGEST_AUDIT.md` as starting point
- Map topics to `ttlClass` and `recencyHint`

---

### 10. Missing Batch ID Tracking

**Prompt Requirement:**
- Research jobs include `batchId` for deduplication
- Capsules stored per `batchId`

**Current Implementation:**
- No batch tracking in memory service
- **Issue**: Need to generate and track batch IDs

**Revision Suggestion:**
- Generate `batchId` when audit triggers (UUID or timestamp-based)
- Store batch metadata (topic, entities, timestamp)
- Use batch ID for cache keys and Redis pub/sub channels

---

## Architectural Questions

1. **Sidecar Process vs Module?**
   - Is sidecar a separate Node.js process, or just a module within memory-service?
   - If separate: need IPC (Redis pub/sub, HTTP, or shared queue)
   - If module: can use existing JobQueue

2. **Turn Counting**
   - Does "8 turns" mean 8 message pairs (user+assistant) or 8 user messages?
   - Current cadence uses message count, not turn count

3. **Research Job Priority**
   - Should research jobs run in parallel with audit jobs?
   - Or wait until audit completes?

4. **Capsule Injection Format**
   - How should capsules be injected into SSE stream?
   - New event type? Append to content? Tool result?

5. **Redis Dependency**
   - Is Redis required or optional?
   - Should system work without Redis (graceful degradation)?

6. **Personal Topic Handling**
   - **UPDATE**: Personal topics are **essential** for knowledgeable and tailored responses
   - Should NOT be filtered/blocked at this time
   - May add selective filtering for highly sensitive topics later (to be revised)

---

## Positive Alignments

✅ **Job Queue System**: Existing queue can be extended for research jobs  
✅ **Memory Review Triggering**: Audit system already triggers at intervals  
✅ **Non-blocking Architecture**: Memory service already fire-and-forget  
✅ **Scoring System**: Entity markers and relevance scoring exist  
✅ **Rate Limiting**: Can reuse existing patterns  
✅ **Telemetry**: Metrics infrastructure exists  

---

## Recommended Revisions to Prompt

1. **Clarify turn counting**: Define "turn" (user message vs user+assistant pair)
2. **Specify sidecar architecture**: Separate process or module?
3. **Redis requirement**: Required or optional with fallback?
4. **Auto-search orchestrator**: Confirm file location or remove requirement
5. **Injection format**: Specify how capsules appear in SSE stream
6. **Topic extraction**: Specify method (LLM, keyword, hybrid)
7. **Batch ID generation**: Clarify when and how batch IDs are created

---

## Implementation Readiness

**Ready:**
- Job queue extension
- Memory review integration point
- Non-blocking patterns
- Scoring/classification foundation

**Needs Creation:**
- Sidecar module structure
- Redis integration
- Topic/entity extraction
- Research pipeline (fetch → rerank → capsule)
- Early-window injection
- Environment config
- Test suite

**Needs Clarification:**
- Turn counting semantics
- Sidecar architecture
- Redis requirement
- Auto-search orchestrator location
- Injection format

---

Next Steps: Address clarifications, then build detailed implementation plan.

