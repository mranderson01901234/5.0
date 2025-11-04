# Imagen 4 Usage Audit Report

**Generated:** 2025-11-04T11:33:44.246Z

## Summary

- **Total Imagen Call Sites:** 4384
- **Model Tiers Used:** imagen-4.0-generate-001, STANDARD
- **Unique Aspect Ratios:** None detected
- **Rewriter Found:** ✅ Yes
- **Safety Configuration Found:** ✅ Yes
- **Watermark/SynthID Found:** ✅ Yes
- **Retry Logic Found:** ✅ Yes
- **Backoff Strategy Found:** ✅ Yes
- **Concurrency Controls Found:** ❌ No
- **Caching Strategy Found:** ✅ Yes
- **UI Bindings Count:** 143

## Endpoints + Models Found

### Endpoints
- None detected

### Models
- imagen-4.0-generate-001

## Output Sizes and Aspects

No explicit sizes/aspects detected.

## Generation Settings Matrix

| File | Line | Model | Aspect | Images | Safety | Seed |
|------|------|-------|--------|--------|--------|------|
| apps/memory-service/src/composeSearchResponse.ts | 7 | - | - | - | - | - |
| apps/memory-service/src/composeSearchResponse.ts | 24 | - | - | - | - | - |
| apps/memory-service/src/composeSearchResponse.ts | 44 | - | - | - | - | - |
| apps/memory-service/src/composeSearchResponse.ts | 254 | - | - | - | - | - |
| apps/memory-service/src/composeSearchResponse.ts | 268 | - | - | - | - | - |
| apps/memory-service/src/composeSearchResponse.ts | 326 | - | - | - | - | - |
| apps/memory-service/src/composeSearchResponse.ts | 349 | - | - | - | - | - |
| apps/memory-service/src/composeSearchResponse.ts | 7 | - | - | - | - | - |
| apps/memory-service/src/composeSearchResponse.ts | 24 | - | - | - | - | - |
| apps/memory-service/src/composeSearchResponse.ts | 24 | - | - | - | - | - |
| apps/memory-service/src/composeSearchResponse.ts | 268 | - | - | - | - | - |
| apps/memory-service/src/composeSearchResponse.ts | 268 | - | - | - | - | - |
| apps/memory-service/src/composeSearchResponse.ts | 268 | - | - | - | - | - |
| apps/memory-service/src/composeSearchResponse.ts | 326 | - | - | - | - | - |
| apps/memory-service/src/composeSearchResponse.ts | 326 | - | - | - | - | - |
| apps/memory-service/src/composeSearchResponse.ts | 349 | - | - | - | - | - |
| apps/memory-service/src/composeSearchResponse.ts | 44 | - | - | - | - | - |
| apps/memory-service/src/db.ts | 197 | - | - | - | - | - |
| apps/memory-service/src/db.ts | 199 | - | - | - | - | - |
| apps/memory-service/src/db.ts | 203 | - | - | - | - | - |
| apps/memory-service/src/db.ts | 210 | - | - | - | - | - |
| apps/memory-service/src/db.ts | 211 | - | - | - | - | - |
| apps/memory-service/src/db.ts | 214 | - | - | - | - | - |
| apps/memory-service/src/db.ts | 215 | - | - | - | - | - |
| apps/memory-service/src/db.ts | 203 | - | - | - | - | - |
| apps/memory-service/src/embedding-service.ts | 3 | - | - | - | - | - |
| apps/memory-service/src/embedding-service.ts | 58 | - | - | - | - | - |
| apps/memory-service/src/embedding-service.ts | 137 | - | - | - | - | - |
| apps/memory-service/src/embedding-service.ts | 217 | - | - | - | - | - |
| apps/memory-service/src/embedding-service.ts | 218 | - | - | - | - | - |
| apps/memory-service/src/embedding-service.ts | 225 | - | - | - | - | - |
| apps/memory-service/src/embedding-service.ts | 227 | - | - | - | - | - |
| apps/memory-service/src/embedding-service.ts | 233 | - | - | - | - | - |
| apps/memory-service/src/embedding-service.ts | 235 | - | - | - | - | - |
| apps/memory-service/src/embedding-service.ts | 240 | - | - | - | - | - |
| apps/memory-service/src/embedding-service.ts | 244 | - | - | - | - | - |
| apps/memory-service/src/embedding-service.ts | 246 | - | - | - | - | - |
| apps/memory-service/src/embedding-service.ts | 248 | - | - | - | - | - |
| apps/memory-service/src/embedding-service.ts | 250 | - | - | - | - | - |
| apps/memory-service/src/embedding-service.ts | 252 | - | - | - | - | - |
| apps/memory-service/src/embedding-service.ts | 257 | - | - | - | - | - |
| apps/memory-service/src/embedding-service.ts | 259 | - | - | - | - | - |
| apps/memory-service/src/embedding-service.ts | 271 | - | - | - | - | - |
| apps/memory-service/src/embedding-service.ts | 272 | - | - | - | - | - |
| apps/memory-service/src/embedding-service.ts | 280 | - | - | - | - | - |
| apps/memory-service/src/embedding-service.ts | 287 | - | - | - | - | - |
| apps/memory-service/src/embedding-service.ts | 311 | - | - | - | - | - |
| apps/memory-service/src/embedding-service.ts | 313 | - | - | - | - | - |
| apps/memory-service/src/embedding-service.ts | 320 | - | - | - | - | - |
| apps/memory-service/src/embedding-service.ts | 322 | - | - | - | - | - |

*... and 4334 more findings*

## Rewriter Usage

- **/apps/llm-gateway/src/ContextPreprocessor.ts:4** - * Before LLM sees input, rewrite structured data into clean narrative form.
- **/apps/llm-gateway/src/routes.ts:337** - /^(you|can you|could you|please) (rewrite|change|fix|correct|update)/i,
- **/apps/llm-gateway/src/routes.ts:1348** - /^(rewrite|rephrase|fix|change|correct|update)/i,
- **/apps/web/node_modules/@reduxjs/toolkit/src/index.ts:2** - // does not have to import this into each source file it rewrites.
- **/apps/web/node_modules/tailwindcss/src/lib/expandApplyAtRules.js:445** - 'Rewrite the selector without nesting or configure the `tailwindcss/nesting` plugin:',
- **/apps/web/node_modules/tailwindcss/src/lib/expandApplyAtRules.js:517** - let canRewriteSelector =
- **/apps/web/node_modules/tailwindcss/src/lib/expandApplyAtRules.js:520** - if (canRewriteSelector) {
- **/apps/ingestion-service/node_modules/openai/src/resources/vector-stores/vector-stores.ts:490** - * Whether to rewrite the natural language query for vector search.
- **/apps/ingestion-service/node_modules/openai/src/resources/vector-stores/vector-stores.ts:492** - rewrite_query?: boolean;
- **/apps/web/node_modules/@reduxjs/toolkit/src/query/index.ts:2** - // does not have to import this into each source file it rewrites.
- **/apps/web/node_modules/@reduxjs/toolkit/src/react/index.ts:2** - // does not have to import this into each source file it rewrites.
- **/apps/web/node_modules/@reduxjs/toolkit/src/query/react/index.ts:2** - // does not have to import this into each source file it rewrites.

## Safety + Watermark Configuration

### Safety Settings
- **/apps/web/src/pages/api/artifacts/image.ts:39** - Detected in code

### Watermark/SynthID
- **/apps/llm-gateway/node_modules/node-fetch/src/body.js:257** - * @param   String  highWaterMark  highWaterMark for both PassThrough body streams
- **/apps/llm-gateway/node_modules/node-fetch/src/body.js:260** - export const clone = (instance, highWaterMark) => {
- **/apps/llm-gateway/node_modules/node-fetch/src/body.js:274** - p1 = new PassThrough({highWaterMark});
- **/apps/llm-gateway/node_modules/node-fetch/src/body.js:275** - p2 = new PassThrough({highWaterMark});
- **/apps/llm-gateway/node_modules/node-fetch/src/index.js:271** - highWaterMark: request.highWaterMark
- **/apps/llm-gateway/node_modules/node-fetch/src/request.js:138** - this.highWaterMark = init.highWaterMark || input.highWaterMark || 16384;
- **/apps/llm-gateway/node_modules/node-fetch/src/response.js:45** - highWaterMark: options.highWaterMark
- **/apps/llm-gateway/node_modules/node-fetch/src/response.js:80** - get highWaterMark() {
- **/apps/llm-gateway/node_modules/node-fetch/src/response.js:81** - return this[INTERNALS].highWaterMark;
- **/apps/llm-gateway/node_modules/node-fetch/src/response.js:90** - return new Response(clone(this, this.highWaterMark), {
- **/apps/llm-gateway/node_modules/node-fetch/src/response.js:99** - highWaterMark: this.highWaterMark
- **/apps/ingestion-service/node_modules/openai/src/_shims/web-types.d.ts:65** - readonly readableHighWaterMark: number;
- **/apps/ingestion-service/node_modules/openai/src/_shims/auto/types.d.ts:81** - readonly readableHighWaterMark: number;
- **/apps/llm-gateway/node_modules/pdfjs-dist/types/src/shared/util.d.ts:136** - export let WATERMARK: number;

## Timeouts/Retries/Concurrency/Queues

### Timeouts
- **/apps/memory-service/src/composeSearchResponse.ts:7** - Detected
- **/apps/memory-service/src/composeSearchResponse.ts:24** - Detected
- **/apps/memory-service/src/composeSearchResponse.ts:268** - Detected
- **/apps/memory-service/src/composeSearchResponse.ts:326** - Detected
- **/apps/memory-service/src/composeSearchResponse.ts:349** - Detected
- **/apps/memory-service/src/composeSearchResponse.ts:7** - Detected
- **/apps/memory-service/src/composeSearchResponse.ts:24** - Detected
- **/apps/memory-service/src/composeSearchResponse.ts:24** - Detected
- **/apps/memory-service/src/composeSearchResponse.ts:268** - Detected
- **/apps/memory-service/src/composeSearchResponse.ts:268** - Detected

### Retries
- **/apps/memory-service/src/db.ts:203** - Detected
- **/apps/memory-service/src/db.ts:203** - Detected
- **/apps/memory-service/src/embedding-service.ts:271** - Detected
- **/apps/memory-service/src/embedding-service.ts:280** - Detected
- **/apps/memory-service/src/embedding-service.ts:322** - Detected
- **/apps/memory-service/src/embedding-service.ts:323** - Detected
- **/apps/memory-service/src/embedding-service.ts:326** - Detected
- **/apps/memory-service/src/embedding-service.ts:328** - Detected
- **/apps/memory-service/src/embedding-service.ts:330** - Detected
- **/apps/memory-service/src/embedding-service.ts:339** - Detected

### Concurrency
No concurrency controls detected.

### Queues
- **/apps/memory-service/src/composeSearchResponse.ts:44** - Detected
- **/apps/memory-service/src/composeSearchResponse.ts:44** - Detected
- **/apps/memory-service/src/db.ts:197** - Detected
- **/apps/memory-service/src/db.ts:199** - Detected
- **/apps/memory-service/src/db.ts:210** - Detected
- **/apps/memory-service/src/db.ts:211** - Detected
- **/apps/memory-service/src/db.ts:214** - Detected
- **/apps/memory-service/src/db.ts:215** - Detected
- **/apps/memory-service/src/embedding-service.ts:3** - Detected
- **/apps/memory-service/src/embedding-service.ts:217** - Detected

## Caching Strategy

- **/apps/llm-gateway/src/MemoryRecallStabilizer.ts:19** - Detected
- **/apps/llm-gateway/src/MemoryRecallStabilizer.ts:26** - Detected
- **/apps/llm-gateway/node_modules/luxon/src/impl/locale.js:392** - Detected
- **/apps/llm-gateway/node_modules/luxon/src/impl/locale.js:396** - Detected
- **/apps/llm-gateway/node_modules/luxon/src/impl/locale.js:397** - Detected
- **/apps/llm-gateway/node_modules/luxon/src/impl/locale.js:400** - Detected
- **/apps/web/node_modules/tailwindcss/src/lib/setupContextUtils.js:1261** - Detected
- **/apps/llm-gateway/node_modules/google-auth-library/build/src/auth/pluggable-auth-client.d.ts:16** - Detected
- **/apps/llm-gateway/node_modules/google-auth-library/build/src/auth/pluggable-auth-client.d.ts:107** - Detected
- **/apps/llm-gateway/node_modules/google-auth-library/build/src/auth/pluggable-auth-handler.d.ts:24** - Detected

## UI → API Mapping Table

| UI Control | Label | Mapped Parameter |
|------------|-------|-----------------|
| - | - | - |

*No explicit UI bindings detected. Check component files for implicit mappings.*

## ENV Variables Referenced

### In Code
- GCP_LOCATION
- GCP_PROJECT_ID
- GCP_SERVICE_ACCOUNT_PATH
- GOOGLE_API_KEY
- GOOGLE_APPLICATION_CREDENTIALS
- IMAGE_GEN_ENABLED
- VERTEX_AI_ACCESS_TOKEN
- VERTEX_AI_API_KEY

### In .env Files

**.env:**
- GOOGLE_API_KEY
- IMAGE_GEN_ENABLED
- VERTEX_AI_ACCESS_TOKEN
- GCP_PROJECT_ID
- GCP_LOCATION

## Gaps, Risks, and TODOs

No issues detected.
- ⚠️ Concurrency limits not found - may risk rate limits

## Detailed Findings

| File | Line | Function | Model | Aspect | Images | Safety | Seed | Notes |
|------|------|----------|-------|--------|--------|--------|------|-------|
| apps/memory-service/src/composeSearchResponse.ts | 7 | - | - | - | - | - | - | - |
| apps/memory-service/src/composeSearchResponse.ts | 24 | - | - | - | - | - | - | - |
| apps/memory-service/src/composeSearchResponse.ts | 44 | - | - | - | - | - | - | - |
| apps/memory-service/src/composeSearchResponse.ts | 254 | - | - | - | - | - | - | - |
| apps/memory-service/src/composeSearchResponse.ts | 268 | - | - | - | - | - | - | - |
| apps/memory-service/src/composeSearchResponse.ts | 326 | - | - | - | - | - | - | - |
| apps/memory-service/src/composeSearchResponse.ts | 349 | - | - | - | - | - | - | - |
| apps/memory-service/src/composeSearchResponse.ts | 7 | - | - | - | - | - | - | timeout pattern found |
| apps/memory-service/src/composeSearchResponse.ts | 24 | - | - | - | - | - | - | timeout pattern found |
| apps/memory-service/src/composeSearchResponse.ts | 24 | - | - | - | - | - | - | timeout pattern found |
| apps/memory-service/src/composeSearchResponse.ts | 268 | - | - | - | - | - | - | timeout pattern found |
| apps/memory-service/src/composeSearchResponse.ts | 268 | - | - | - | - | - | - | timeout pattern found |
| apps/memory-service/src/composeSearchResponse.ts | 268 | - | - | - | - | - | - | timeout pattern found |
| apps/memory-service/src/composeSearchResponse.ts | 326 | - | - | - | - | - | - | timeout pattern found |
| apps/memory-service/src/composeSearchResponse.ts | 326 | - | - | - | - | - | - | timeout pattern found |
| apps/memory-service/src/composeSearchResponse.ts | 349 | - | - | - | - | - | - | timeout pattern found |
| apps/memory-service/src/composeSearchResponse.ts | 44 | - | - | - | - | - | - | bull pattern found |
| apps/memory-service/src/db.ts | 197 | - | - | - | - | - | - | - |
| apps/memory-service/src/db.ts | 199 | - | - | - | - | - | - | - |
| apps/memory-service/src/db.ts | 203 | - | - | - | - | - | - | - |
| apps/memory-service/src/db.ts | 210 | - | - | - | - | - | - | - |
| apps/memory-service/src/db.ts | 211 | - | - | - | - | - | - | - |
| apps/memory-service/src/db.ts | 214 | - | - | - | - | - | - | - |
| apps/memory-service/src/db.ts | 215 | - | - | - | - | - | - | - |
| apps/memory-service/src/db.ts | 203 | - | - | - | - | - | - | retry pattern found |
| apps/memory-service/src/embedding-service.ts | 3 | - | - | - | - | - | - | - |
| apps/memory-service/src/embedding-service.ts | 58 | - | - | - | - | - | - | - |
| apps/memory-service/src/embedding-service.ts | 137 | - | - | - | - | - | - | - |
| apps/memory-service/src/embedding-service.ts | 217 | - | - | - | - | - | - | - |
| apps/memory-service/src/embedding-service.ts | 218 | - | - | - | - | - | - | - |
| apps/memory-service/src/embedding-service.ts | 225 | - | - | - | - | - | - | - |
| apps/memory-service/src/embedding-service.ts | 227 | - | - | - | - | - | - | - |
| apps/memory-service/src/embedding-service.ts | 233 | - | - | - | - | - | - | - |
| apps/memory-service/src/embedding-service.ts | 235 | - | - | - | - | - | - | - |
| apps/memory-service/src/embedding-service.ts | 240 | - | - | - | - | - | - | - |
| apps/memory-service/src/embedding-service.ts | 244 | - | - | - | - | - | - | - |
| apps/memory-service/src/embedding-service.ts | 246 | - | - | - | - | - | - | - |
| apps/memory-service/src/embedding-service.ts | 248 | - | - | - | - | - | - | - |
| apps/memory-service/src/embedding-service.ts | 250 | - | - | - | - | - | - | - |
| apps/memory-service/src/embedding-service.ts | 252 | - | - | - | - | - | - | - |
| apps/memory-service/src/embedding-service.ts | 257 | - | - | - | - | - | - | - |
| apps/memory-service/src/embedding-service.ts | 259 | - | - | - | - | - | - | - |
| apps/memory-service/src/embedding-service.ts | 271 | - | - | - | - | - | - | - |
| apps/memory-service/src/embedding-service.ts | 272 | - | - | - | - | - | - | - |
| apps/memory-service/src/embedding-service.ts | 280 | - | - | - | - | - | - | - |
| apps/memory-service/src/embedding-service.ts | 287 | - | - | - | - | - | - | - |
| apps/memory-service/src/embedding-service.ts | 311 | - | - | - | - | - | - | - |
| apps/memory-service/src/embedding-service.ts | 313 | - | - | - | - | - | - | - |
| apps/memory-service/src/embedding-service.ts | 320 | - | - | - | - | - | - | - |
| apps/memory-service/src/embedding-service.ts | 322 | - | - | - | - | - | - | - |
| apps/memory-service/src/embedding-service.ts | 323 | - | - | - | - | - | - | - |
| apps/memory-service/src/embedding-service.ts | 325 | - | - | - | - | - | - | - |
| apps/memory-service/src/embedding-service.ts | 326 | - | - | - | - | - | - | - |
| apps/memory-service/src/embedding-service.ts | 328 | - | - | - | - | - | - | - |
| apps/memory-service/src/embedding-service.ts | 330 | - | - | - | - | - | - | - |
| apps/memory-service/src/embedding-service.ts | 332 | - | - | - | - | - | - | - |
| apps/memory-service/src/embedding-service.ts | 339 | - | - | - | - | - | - | - |
| apps/memory-service/src/embedding-service.ts | 340 | - | - | - | - | - | - | - |
| apps/memory-service/src/embedding-service.ts | 342 | - | - | - | - | - | - | - |
| apps/memory-service/src/embedding-service.ts | 343 | - | - | - | - | - | - | - |
| apps/memory-service/src/embedding-service.ts | 345 | - | - | - | - | - | - | - |
| apps/memory-service/src/embedding-service.ts | 348 | - | - | - | - | - | - | - |
| apps/memory-service/src/embedding-service.ts | 356 | - | - | - | - | - | - | - |
| apps/memory-service/src/embedding-service.ts | 271 | - | - | - | - | - | - | retry pattern found |
| apps/memory-service/src/embedding-service.ts | 280 | - | - | - | - | - | - | retry pattern found |
| apps/memory-service/src/embedding-service.ts | 322 | - | - | - | - | - | - | retry pattern found |
| apps/memory-service/src/embedding-service.ts | 323 | - | - | - | - | - | - | retry pattern found |
| apps/memory-service/src/embedding-service.ts | 326 | - | - | - | - | - | - | retry pattern found |
| apps/memory-service/src/embedding-service.ts | 328 | - | - | - | - | - | - | retry pattern found |
| apps/memory-service/src/embedding-service.ts | 330 | - | - | - | - | - | - | retry pattern found |
| apps/memory-service/src/embedding-service.ts | 339 | - | - | - | - | - | - | retry pattern found |
| apps/memory-service/src/embedding-service.ts | 340 | - | - | - | - | - | - | retry pattern found |
| apps/memory-service/src/embedding-service.ts | 343 | - | - | - | - | - | - | retry pattern found |
| apps/memory-service/src/embedding-service.ts | 345 | - | - | - | - | - | - | retry pattern found |
| apps/memory-service/src/embedding-worker.ts | 2 | - | - | - | - | - | - | - |
| apps/memory-service/src/embedding-worker.ts | 3 | - | - | - | - | - | - | - |
| apps/memory-service/src/embedding-worker.ts | 8 | - | - | - | - | - | - | - |
| apps/memory-service/src/embedding-worker.ts | 15 | - | - | - | - | - | - | - |
| apps/memory-service/src/embedding-worker.ts | 34 | - | - | - | - | - | - | - |
| apps/memory-service/src/embedding-worker.ts | 35 | - | - | - | - | - | - | - |
| apps/memory-service/src/embedding-worker.ts | 39 | - | - | - | - | - | - | - |
| apps/memory-service/src/embedding-worker.ts | 55 | - | - | - | - | - | - | - |
| apps/memory-service/src/embedding-worker.ts | 57 | - | - | - | - | - | - | - |
| apps/memory-service/src/embedding-worker.ts | 59 | - | - | - | - | - | - | - |
| apps/memory-service/src/embedding-worker.ts | 66 | - | - | - | - | - | - | - |
| apps/memory-service/src/embedding-worker.ts | 68 | - | - | - | - | - | - | - |
| apps/memory-service/src/embedding-worker.ts | 71 | - | - | - | - | - | - | - |
| apps/memory-service/src/embedding-worker.ts | 78 | - | - | - | - | - | - | - |
| apps/memory-service/src/embedding-worker.ts | 80 | - | - | - | - | - | - | - |
| apps/memory-service/src/embedding-worker.ts | 81 | - | - | - | - | - | - | - |
| apps/memory-service/src/embedding-worker.ts | 15 | - | - | - | - | - | - | timeout pattern found |
| apps/memory-service/src/metrics.ts | 5 | - | - | - | - | - | - | - |
| apps/memory-service/src/metrics.ts | 9 | - | - | - | - | - | - | - |
| apps/memory-service/src/metrics.ts | 13 | - | - | - | - | - | - | - |
| apps/memory-service/src/metrics.ts | 17 | - | - | - | - | - | - | - |
| apps/memory-service/src/metrics.ts | 28 | - | - | - | - | - | - | - |
| apps/memory-service/src/metrics.ts | 29 | - | - | - | - | - | - | - |
| apps/memory-service/src/metrics.ts | 51 | - | - | - | - | - | - | - |
| apps/memory-service/src/metrics.ts | 60 | - | - | - | - | - | - | - |
| apps/memory-service/src/metrics.ts | 65 | - | - | - | - | - | - | - |

*... and 4284 more findings*
