# Image Vision Feature Audit

## Executive Summary

The image upload feature works correctly on the frontend, but images are not being processed by the vision model. The system has Gemini 2.5 Flash configured (which supports vision), but the implementation is missing critical components to actually pass images to the model.

## Current State

### ✅ What Works
1. **Frontend Upload**: Files can be uploaded successfully via `CenterComposer.tsx`
2. **File Storage**: Files are stored and URLs are generated correctly
3. **Attachments in Messages**: Attachments are included in message objects with `id`, `filename`, `mimeType`, `size`, and `url`
4. **Model Configuration**: `gemini-2.5-flash` is configured in `llm-gateway.json` as the Google model

### ❌ What's Missing

#### 1. Schema Definition
**Issue**: `ChatStreamRequestSchema` in `packages/shared/src/schemas.ts` doesn't include attachments in the message structure.

**Current Schema**:
```typescript
messages: z.array(
  z.object({
    role: z.enum(['user', 'assistant', 'system']),
    content: z.string(),
  })
)
```

**Required**: Add optional `attachments` field to message schema.

#### 2. Image Detection & Routing
**Issue**: No logic to detect when a message contains images and route to Gemini vision model.

**Location**: `apps/llm-gateway/src/routes.ts` (around line 1476-1493)

**Required**: 
- Detect image attachments in messages
- Force routing to Google provider with Gemini 2.5 Flash when images are present
- Update `IntelligentModelRouter` to detect multimodal queries

#### 3. Google Provider Vision Support
**Issue**: `GoogleProvider.stream()` in `apps/llm-gateway/src/providers/google.ts` only handles text content.

**Current Implementation** (lines 40-44):
```typescript
contents: conversationMessages.map((m) => ({
  role: m.role === 'assistant' ? 'model' : 'user',
  parts: [{ text: m.content }],
})),
```

**Required**: 
- Check for image attachments in messages
- Fetch images from URLs
- Convert images to base64
- Add image parts to the `parts` array in Gemini API format:
```typescript
parts: [
  { text: m.content },
  { inline_data: { mime_type: 'image/jpeg', data: base64Data } }
]
```

#### 4. Message Processing
**Issue**: Attachments are stored in the database but not passed through to the provider when processing messages.

**Location**: `apps/llm-gateway/src/routes.ts` (around line 1455-1465)

**Required**: 
- Extract attachments from messages
- Pass attachments through to the provider
- Handle image fetching and conversion

## Implementation Plan

### Phase 1: Schema Updates
1. Update `ChatStreamRequestSchema` to include optional attachments field
2. Define attachment schema structure:
   ```typescript
   attachment: z.object({
     id: z.string(),
     filename: z.string(),
     mimeType: z.string(),
     size: z.number(),
     url: z.string().optional(),
   }).optional()
   ```

### Phase 2: Image Detection & Routing
1. Add helper function to detect image attachments:
   ```typescript
   function hasImageAttachments(messages: Message[]): boolean {
     return messages.some(msg => 
       msg.attachments?.some(att => att.mimeType.startsWith('image/'))
     );
   }
   ```

2. Update routing logic to force Google/Gemini when images are present:
   ```typescript
   if (hasImageAttachments(body.messages)) {
     finalProvider = 'google';
     finalModel = config.models.google; // 'gemini-2.5-flash'
   }
   ```

3. Update `IntelligentModelRouter` to include multimodal detection

### Phase 3: Google Provider Vision Implementation
1. Add image fetching utility:
   ```typescript
   async function fetchImageAsBase64(url: string): Promise<string>
   ```

2. Update `GoogleProvider.stream()` to:
   - Accept attachments in message structure
   - Process image attachments
   - Convert to Gemini API format
   - Include in `parts` array

### Phase 4: Message Processing Updates
1. Ensure attachments are preserved through the message processing pipeline
2. Fetch attachments from database if needed
3. Pass attachments to provider

## Gemini API Format Reference

For Gemini 2.5 Flash vision, images must be included in the `parts` array:

```json
{
  "contents": [
    {
      "role": "user",
      "parts": [
        { "text": "What's in this image?" },
        {
          "inline_data": {
            "mime_type": "image/jpeg",
            "data": "base64EncodedImageData"
          }
        }
      ]
    }
  ]
}
```

## Testing Checklist

- [ ] Upload image and verify it appears in UI
- [ ] Send message with image attachment
- [ ] Verify request routes to Google provider
- [ ] Verify Gemini 2.5 Flash model is used
- [ ] Verify image is converted to base64 correctly
- [ ] Verify image is included in API request
- [ ] Verify model responds with image analysis
- [ ] Test with multiple images
- [ ] Test with images + text
- [ ] Test error handling (invalid URLs, corrupted images)

## Notes

- Gemini 2.5 Flash supports vision natively
- Images should be base64 encoded
- Maximum image size: 20MB per image
- Supported formats: JPEG, PNG, GIF, WebP
- Multiple images can be included in a single message

