# Google Imagen 4 Implementation Audit

## Executive Summary

The codebase has a **partial implementation** of text-to-image generation, but it's using the **wrong API and model**. The current implementation uses `gemini-1.5-flash` (a text model) instead of Google Imagen 4 (the actual image generation model). This audit identifies what needs to be fixed and implemented to properly support Imagen 4.

## Current State

### ✅ What's Already Implemented

1. **Frontend Integration** (`apps/web/src/hooks/useChatStream.ts`)
   - ✅ Gatekeeper detection for image intent
   - ✅ Automatic triggering of image generation API
   - ✅ Artifact creation and display flow
   - ✅ Error handling

2. **API Route** (`apps/web/src/pages/api/artifacts/image.ts`)
   - ✅ POST endpoint for image generation
   - ✅ Authentication via Clerk
   - ✅ Artifact persistence
   - ✅ Feature flag support (`IMAGE_GEN_ENABLED`)

3. **UI Components**
   - ✅ `ArtifactImage.tsx` - Image display component
   - ✅ `ArtifactMessageCard.tsx` - Integration with chat
   - ✅ Download, copy, and regenerate buttons (UI only)

4. **Gatekeeper Integration** (`apps/llm-gateway/src/gatekeeper.ts`)
   - ✅ Image keyword detection
   - ✅ Intent classification for image generation
   - ✅ Confidence scoring

5. **Artifact System**
   - ✅ Database schema supports image artifacts
   - ✅ Artifact store supports image type
   - ✅ Image artifact data structure

### ❌ Critical Issues

#### 1. Wrong Model (`apps/web/src/server/google/gemini.ts`)
**Current**: Uses `gemini-1.5-flash` (a text model)
```typescript
const IMAGE_GEN_MODEL = 'gemini-1.5-flash'; // ❌ WRONG
```

**Required**: Use `imagen-4` or `imagen-4-ultra`
```typescript
const IMAGE_GEN_MODEL = 'imagen-4'; // ✅ CORRECT
```

#### 2. Wrong API Endpoint
**Current**: Uses Gemini API endpoint
```typescript
const url = `https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_GEN_MODEL}:generateContent?key=${GOOGLE_API_KEY}`;
```

**Required**: Use Imagen API endpoint (Vertex AI or Imagen-specific endpoint)
- Vertex AI: `https://us-central1-aiplatform.googleapis.com/v1/projects/{project}/locations/{location}/publishers/google/models/imagen-4:predict`
- OR Gemini API with Imagen model: `https://generativelanguage.googleapis.com/v1beta/models/imagen-4:generateContent`

#### 3. Wrong Request Format
**Current**: Uses Gemini text generation format
```typescript
{
  contents: [{
    parts: [{ text: prompt }]
  }],
  generationConfig: {
    responseMimeType: "image/png",
  },
}
```

**Required**: Use Imagen-specific format with image generation parameters
```typescript
{
  instances: [{
    prompt: prompt
  }],
  parameters: {
    sampleCount: 1,
    aspectRatio: "1:1",
    safetyFilterLevel: "BLOCK_MEDIUM_AND_HIGH",
    personGeneration: "ALLOW_ADULT"
  }
}
```

OR if using Gemini API format:
```typescript
{
  contents: [{
    parts: [{ text: prompt }]
  }],
  generationConfig: {
    responseMimeType: "image/png",
    temperature: 1.0,
  },
  model: "imagen-4"
}
```

#### 4. Missing Image Generation Parameters
**Current**: Only supports basic `size` parameter (not used correctly)
```typescript
interface ImageGenOptions {
    size?: "1024x1024" | "768x1024" | "1024x768";
}
```

**Required**: Support Imagen 4 parameters:
- `aspectRatio`: "1:1" | "9:16" | "16:9" | "4:3" | "3:4"
- `sampleCount`: number (1-4)
- `safetyFilterLevel`: "BLOCK_NONE" | "BLOCK_ONLY_HIGH" | "BLOCK_MEDIUM_AND_HIGH"
- `personGeneration`: "ALLOW_ALL" | "ALLOW_ADULT" | "DONT_ALLOW"
- `negativePrompt`: string (optional)

#### 5. Missing Error Handling
**Current**: Basic error handling, no specific Imagen error codes

**Required**: Handle Imagen-specific errors:
- Quota exceeded
- Content policy violations
- Invalid prompts
- Model availability

#### 6. Missing Cost Tracking
**Current**: No cost tracking for image generation

**Required**: 
- Track cost per image ($0.04 for Imagen 4, $0.06 for Imagen 4 Ultra)
- Add to usage metrics
- Log cost per generation

#### 7. Missing Regenerate Functionality
**Current**: UI button exists but not wired up

**Required**: Implement regenerate that:
- Calls image API with same prompt
- Optionally supports parameter modification
- Updates artifact with new image

## Implementation Plan

### Phase 1: Fix Core API Implementation

#### 1.1 Update Model and Endpoint
**File**: `apps/web/src/server/google/gemini.ts`

**Changes**:
1. Change model from `gemini-1.5-flash` to `imagen-4`
2. Verify correct API endpoint (check if Gemini API supports Imagen or if Vertex AI is needed)
3. Update request format to match Imagen API

**Research Needed**:
- ✅ Verify if `generativelanguage.googleapis.com` supports Imagen models
- ✅ Check if Vertex AI endpoint is required
- ✅ Determine correct authentication method (API key vs OAuth)

#### 1.2 Update Request Format
**File**: `apps/web/src/server/google/gemini.ts`

**Add**:
```typescript
interface ImageGenOptions {
  aspectRatio?: "1:1" | "9:16" | "16:9" | "4:3" | "3:4";
  sampleCount?: number; // 1-4
  safetyFilterLevel?: "BLOCK_NONE" | "BLOCK_ONLY_HIGH" | "BLOCK_MEDIUM_AND_HIGH";
  personGeneration?: "ALLOW_ALL" | "ALLOW_ADULT" | "DONT_ALLOW";
  negativePrompt?: string;
  seed?: number; // For reproducibility
}
```

**Update `generateImage()` function**:
- Use correct request body format
- Map `size` parameter to `aspectRatio`
- Support all new parameters
- Handle response format correctly

#### 1.3 Update Response Parsing
**Current**: Parses Gemini response format
**Required**: Parse Imagen response format

Imagen response format (Vertex AI):
```json
{
  "predictions": [
    {
      "bytesBase64Encoded": "base64_image_data",
      "mimeType": "image/png"
    }
  ]
}
```

OR Gemini API format:
```json
{
  "candidates": [{
    "content": {
      "parts": [{
        "inlineData": {
          "mimeType": "image/png",
          "data": "base64_image_data"
        }
      }]
    }
  }]
}
```

### Phase 2: Enhance Features

#### 2.1 Add Parameter Support
**Files**: 
- `apps/web/src/server/google/gemini.ts`
- `apps/web/src/pages/api/artifacts/image.ts`
- `apps/web/src/components/chat/ArtifactImage.tsx`

**Add UI controls**:
- Aspect ratio selector
- Number of images selector
- Safety filter options
- Negative prompt input

#### 2.2 Implement Regenerate
**File**: `apps/web/src/components/chat/ArtifactImage.tsx`

**Wire up** `handleRegenerate()`:
1. Call `/api/artifacts/image` with same prompt
2. Update artifact with new image(s)
3. Handle loading states
4. Show error messages

#### 2.3 Add Cost Tracking
**Files**:
- `apps/web/src/server/google/gemini.ts` - Log cost
- `apps/llm-gateway/src/routes.ts` - Track in metrics
- `apps/web/src/pages/api/artifacts/image.ts` - Return cost info

**Add**:
- Cost per image calculation
- Usage metrics
- Cost logging

### Phase 3: Error Handling & Safety

#### 3.1 Enhanced Error Handling
**File**: `apps/web/src/server/google/gemini.ts`

**Handle**:
- Quota exceeded (429)
- Content policy violations (400)
- Invalid prompts (400)
- Model unavailable (503)
- Rate limiting (429)

**Provide user-friendly messages**:
- "Image generation quota exceeded. Please try again later."
- "Prompt violates content policy. Please modify your prompt."
- "Image generation temporarily unavailable."

#### 3.2 Safety Measures
**Add**:
- Prompt validation before API call
- Content moderation checks
- Rate limiting per user
- Cost limits per user

### Phase 4: Documentation & Testing

#### 4.1 API Documentation
**Create**: `docs/IMAGEN_API.md`

**Document**:
- API endpoint
- Request format
- Response format
- Parameters
- Error codes
- Rate limits
- Pricing

#### 4.2 Testing
**Create**: `apps/web/src/server/google/gemini.test.ts`

**Test**:
- ✅ Correct model name
- ✅ Correct API endpoint
- ✅ Request format
- ✅ Response parsing
- ✅ Error handling
- ✅ Parameter validation

## Required API Information

### Imagen 4 API Details (Research Needed)

**Option 1: Vertex AI Endpoint**
- URL: `https://us-central1-aiplatform.googleapis.com/v1/projects/{project}/locations/{location}/publishers/google/models/imagen-4:predict`
- Auth: OAuth 2.0 service account
- Format: Vertex AI standard

**Option 2: Gemini API Endpoint**
- URL: `https://generativelanguage.googleapis.com/v1beta/models/imagen-4:generateContent`
- Auth: API key (same as Gemini)
- Format: Gemini API standard

**Research Tasks**:
1. ✅ Verify which endpoint supports Imagen 4
2. ✅ Check authentication requirements
3. ✅ Verify request/response format
4. ✅ Test API access with current credentials

### Pricing
- **Imagen 4**: $0.04 per image
- **Imagen 4 Ultra**: $0.06 per image
- **Rate Limits**: Check Google Cloud Console

### Model Availability
- **Imagen 4**: Available
- **Imagen 4 Ultra**: Available (premium)
- **Imagen 3**: Deprecated (removal Sept 24, 2025)
- **Imagen 2**: Deprecated (removal Sept 24, 2025)

## Testing Checklist

- [ ] Update model name to `imagen-4`
- [ ] Verify API endpoint works
- [ ] Test basic image generation
- [ ] Test with different aspect ratios
- [ ] Test with multiple images (sampleCount)
- [ ] Test error handling (invalid prompt, quota exceeded)
- [ ] Test regenerate functionality
- [ ] Verify cost tracking
- [ ] Test UI components with real images
- [ ] Test gatekeeper detection
- [ ] Test artifact creation flow
- [ ] Test image download/copy functionality

## Files to Modify

### Core Changes
1. `apps/web/src/server/google/gemini.ts` - **MAJOR REWRITE**
   - Change model name
   - Update API endpoint
   - Fix request format
   - Fix response parsing
   - Add parameter support

2. `apps/web/src/pages/api/artifacts/image.ts` - **UPDATE**
   - Pass parameters to generateImage()
   - Handle new error types
   - Return cost information

3. `apps/web/src/components/chat/ArtifactImage.tsx` - **UPDATE**
   - Wire up regenerate button
   - Add parameter UI (optional)

### Enhancement Files
4. `apps/web/src/types/api.ts` - **ADD**
   - ImageGenOptions interface
   - ImageGenResponse interface

5. `apps/llm-gateway/src/routes.ts` - **ADD**
   - Cost tracking for image generation

6. `docs/IMAGEN_API.md` - **CREATE**
   - API documentation

## Critical Questions to Resolve

1. **Which API endpoint?**
   - Does Gemini API support Imagen models?
   - Or do we need Vertex AI endpoint?
   - What authentication is required?

2. **Authentication Method**
   - Can we use existing `GOOGLE_API_KEY`?
   - Or do we need service account OAuth?
   - Do we need Google Cloud project setup?

3. **Request Format**
   - Gemini API format vs Vertex AI format?
   - Which format does Imagen 4 use?

4. **Response Format**
   - How are images returned?
   - Base64 encoded?
   - Cloud Storage URLs?

## Next Steps

1. **Immediate**: Research Imagen 4 API documentation
   - Check Google Cloud docs
   - Verify endpoint URLs
   - Test API access

2. **Phase 1**: Fix core implementation
   - Update model name
   - Fix API endpoint
   - Fix request/response format

3. **Phase 2**: Add features
   - Parameters
   - Regenerate
   - Cost tracking

4. **Phase 3**: Polish
   - Error handling
   - Testing
   - Documentation

## Notes

- Current implementation flow is correct (gatekeeper → API → artifact)
- UI components are ready
- Database schema supports image artifacts
- Main issue is API implementation using wrong model/endpoint
- Cost tracking should be added for production use
- Safety filters should be implemented for content moderation

