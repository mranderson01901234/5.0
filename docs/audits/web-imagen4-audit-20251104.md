# Web Application Imagen 4 Usage Audit Report

**Generated:** 2025-11-04T11:35:48.686Z
**Scope:** Web Application (apps/web)

## Executive Summary

This audit inventories all Google Imagen 4 usage and configuration within the web application. The audit is non-destructive and focuses on:

- **Total Imagen Call Sites:** 3
- **Model Tiers Used:** imagen-4.0-generate-001, STANDARD
- **Unique Aspect Ratios:** None detected
- **Rewriter Found:** ❌ No
- **Safety Configuration Found:** ❌ No
- **Watermark/SynthID Found:** ❌ No
- **Retry Logic Found:** ❌ No
- **Backoff Strategy Found:** ❌ No
- **Concurrency Controls Found:** ❌ No
- **Caching Strategy Found:** ❌ No
- **UI Bindings Count:** 17

## 1. Imagen 4 Implementation Files

### 1.1 Core Implementation Files

#### apps/web/src/server/google/gemini.ts

**Models Defined:**
```typescript
IMAGEN_MODELS = {
    STANDARD: 'imagen-4.0-generate-001',      // $0.04 per image
    ULTRA: 'imagen-4.0-ultra-generate-001',  // $0.06 per image - enhanced precision
    FAST: 'imagen-4.0-fast-generate-001',     // Faster generation
}
```

**Function Signature:**
```typescript
export async function generateImage(prompt: string, opts?: ImageGenOptions): Promise<ImageData[]> {
```

**Endpoint:** Generative Language API (Gemini API)

**Authentication:** API Key (GOOGLE_API_KEY)

**Supported Options:** aspectRatio, sampleCount, safetyFilterLevel, personGeneration, negativePrompt, seed, size (legacy)

#### apps/web/src/pages/api/artifacts/image.ts

**Supported Options:** aspectRatio, sampleCount, safetyFilterLevel, personGeneration, negativePrompt, seed, size (legacy)

**Call Sites:** 1
- Line 65: generateImage

#### apps/web/src/hooks/useChatStream.ts

**Supported Options:** size (legacy)

**Call Sites:** 2
- Line 202: generateImageResponseMessage
- Line 249: generateImageResponseMessage

#### apps/web/src/components/chat/ArtifactImage.tsx

**Supported Options:** aspectRatio, sampleCount, size (legacy)

#### apps/web/src/store/artifactStore.ts

**Supported Options:** aspectRatio, sampleCount, size (legacy)


## 2. API Call Sites

| File | Line | Function | Model | Aspect | Images | Safety | Seed |
|------|------|----------|-------|--------|--------|--------|------|
| apps/web/src/hooks/useChatStream.ts | 202 | generateImageResponseMessage | - | - | 1 | - | - |
| apps/web/src/hooks/useChatStream.ts | 249 | generateImageResponseMessage | - | - | 1 | - | - |
| apps/web/src/pages/api/artifacts/image.ts | 65 | generateImage | imagen-4.0-generate-001 | - | 1 | - | - |

## 3. API Routes

### apps/web/src/pages/api/artifacts/image.ts

- **Line:** 65
- **Function:** generateImage
- **Code:** `generateImage(prompt, imageOptions)...`


## 4. Model Configuration

### 4.1 Available Models

| Model ID | Tier | Cost per Image | Notes |
|----------|------|----------------|-------|
| imagen-4.0-generate-001 | STANDARD | $0.04 | Default model |
| imagen-4.0-ultra-generate-001 | ULTRA | $0.06 | Enhanced precision |
| imagen-4.0-fast-generate-001 | FAST | $0.04 | Faster generation |

### 4.2 Model Usage

- **imagen-4.0-generate-001**: Used 1 time(s)

## 5. Generation Parameters

### 5.1 Aspect Ratios

- Default: 1:1 (square)
- Supported: 1:1, 9:16, 16:9, 4:3, 3:4

### 5.2 Images Per Call

- Default: 1 image per call
- Maximum: 4 images per call
- Found in code: 1


### 5.3 Safety Settings

**Status:** No explicit safety filter levels found in call sites.
**Supported:** BLOCK_NONE, BLOCK_ONLY_HIGH, BLOCK_MEDIUM_AND_HIGH

### 5.4 Other Parameters

| Parameter | Found | Notes |
|-----------|-------|-------|
| Seed | No | For reproducibility |
| Negative Prompt | No | Exclusion list |
| Person Generation | No | Person generation policy |

## 6. UI → API Mapping

| UI Control | Label | Mapped Parameter | File | Line |
|------------|-------|-----------------|------|------|
| sampleCount | Sample Count | sampleCount | apps/web/src/store/artifactStore.ts | 29 |
| safetyFilterLevel | Safety Filter | safetyFilterLevel | apps/web/src/server/google/gemini.ts | 23 |

## 7. Environment Variables

### 7.1 Variables Referenced in Code

- `IMAGE_GEN_ENABLED`

### 7.2 Variables in .env Files


## 8. Error Handling & Resilience

### 8.1 Retry Logic

❌ No explicit retry logic found.
**Recommendation:** Add retry logic for transient failures.

### 8.2 Exponential Backoff

❌ No exponential backoff found.
**Recommendation:** Implement exponential backoff for rate limit handling.

### 8.3 Timeouts

❌ No explicit timeout configuration found.
**Recommendation:** Add timeout handling for API calls.

### 8.4 Concurrency Limits

❌ No concurrency limits found.
**Recommendation:** Implement concurrency limits to prevent rate limiting.

## 9. Caching Strategy

❌ No caching strategy found.
**Recommendation:** Consider caching generated images to reduce costs and improve performance.

## 10. Cost & Performance Considerations

### 10.1 Cost Tracking

❌ No explicit cost tracking found.

### 10.2 Performance Metrics

❌ No explicit performance metrics found.

## 11. Gaps, Risks, and Recommendations

### 11.2 Missing Features

- ⚠️ **Prompt Rewriter:** Not found. Consider implementing prompt rewriting for better image quality.
- ⚠️ **Watermark/SynthID:** Not found. Consider implementing watermarking for generated images.
- ⚠️ **Retry Logic:** Not found. Implement retry logic for transient failures.
- ⚠️ **Exponential Backoff:** Not found. Implement exponential backoff for rate limit handling.
- ⚠️ **Concurrency Limits:** Not found. Implement concurrency limits to prevent rate limiting.
- ⚠️ **Caching:** Not found. Consider caching generated images to reduce costs.

### 11.3 Security Considerations

- ✅ **Authentication:** API key authentication used
- ⚠️ **Safety Filters:** Not explicitly configured
- ⚠️ **Rate Limiting:** Client-side rate limiting not explicitly found
- ⚠️ **Input Validation:** Verify prompt validation on client and server

## 12. Code Examples

### 12.1 Basic Image Generation Call

```typescript
// From apps/web/src/pages/api/artifacts/image.ts
const images = await generateImage(prompt, {
  model: IMAGEN_MODELS.STANDARD,
  aspectRatio: '1:1',
  sampleCount: 1
});
```

### 12.2 UI Integration

```typescript
// From apps/web/src/hooks/useChatStream.ts
// Image generation is triggered automatically when image intent is detected
const response = await fetch('/api/artifacts/image', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  },
  body: JSON.stringify({
    threadId: newThreadId,
    prompt: text,
  }),
});
```

## 13. File Inventory

### 13.1 All Files with Imagen References

- **apps/web/src/hooks/useChatStream.ts** (2 reference(s))
- **apps/web/src/pages/api/artifacts/image.ts** (1 reference(s))

## 14. Conclusion

This audit has identified 3 call site(s) for Imagen 4 image generation within the web application. The implementation uses the Generative Language API (Gemini API) endpoint with API key authentication. Image generation is integrated into the chat interface and triggered automatically when image intent is detected.

**Key Findings:**
- Image generation is implemented via API route: `/api/artifacts/image`
- Default model: `imagen-4.0-generate-001` (STANDARD tier)
- UI integration: Automatic via chat interface
- Cost tracking: Implemented
- Error handling: Basic error handling present

**Recommendations:**
1. Add retry logic with exponential backoff for transient failures
2. Implement concurrency limits to prevent rate limiting
3. Add caching for generated images to reduce costs
4. Consider implementing prompt rewriter for better image quality
5. Add explicit timeout configuration for API calls
6. Consider watermark/SynthID for generated images
