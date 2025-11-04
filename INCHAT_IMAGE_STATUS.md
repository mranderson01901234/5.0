# In-Chat Image Generation Status

**Phase**: Nano Banana (Image Generation Artifact)
**Date**: November 4, 2025

## 1. Overview

This document outlines the implementation status of the in-chat image generation feature, which allows users to generate images from text prompts directly within the chat interface. The feature leverages the Google Gemini API for image creation and renders the output as a new "image" artifact type.

## 2. Feature Implementation

### Key Components

- **Gemini Client** (`apps/web/src/server/google/gemini.ts`): A new client to communicate with the Google Gemini text-to-image API (`gemini-1.5-flash`). It handles API key authentication and parses the `base64`-encoded image response.
- **API Route** (`apps/web/src/pages/api/artifacts/image.ts`): A new `POST` endpoint that takes a `prompt` and `threadId`, calls the Gemini client, and persists the result as an `image` artifact by calling the LLM Gateway's `/api/artifacts/create` endpoint.
- **Artifact Store** (`apps/web/src/store/artifactStore.ts`): The Zustand store was updated to recognize the `image` artifact type, including a new `ImageArtifact` interface and a `createImageArtifact` action.
- **UI Components**:
    - `ArtifactImage.tsx`: A new component to render the image grid, complete with actions for downloading, copying, and opening images in a new tab. It also includes a "Regenerate" button.
    - `ArtifactMessageCard.tsx`: Updated to recognize and render the `ArtifactImage` component when an `image` artifact is present.
- **Gatekeeper Integration** (`apps/llm-gateway/src/gatekeeper.ts`): The Gatekeeper's intent classification logic was enhanced with image-related keywords (e.g., "generate image," "logo," "photorealistic") to automatically trigger the image generation flow.
- **Chat Stream** (`apps/web/src/hooks/useChatStream.ts`): The chat stream hook now checks for the `image` intent from the Gatekeeper and calls the new `/api/artifacts/image` endpoint.

### Environment Variables
- `GOOGLE_API_KEY`: Required for the Gemini API.
- `IMAGE_GEN_ENABLED=true`: Must be set to `true` to enable the feature.

## 3. Example Usage

### cURL Example

To test the image generation endpoint directly:

```bash
curl -X POST http://localhost:3001/api/artifacts/image \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer <YOUR_CLERK_TOKEN>" \\
  -d '{"threadId":"<YOUR_THREAD_ID>","prompt":"isometric neon robot mascot","size":"1024x1024"}'
```
*Note: The port may vary depending on your local setup (e.g., `8787` for wrangler, `3001` for the web app).*

### Screenshot

A screenshot of the generated image artifact card will be added here upon completion of UI testing.

## 4. Notes & Known Issues

- **API Quotas**: The Google Gemini API has usage quotas. Exceeding these limits will result in API errors. Refer to the [Google AI Platform documentation](https://ai.google.dev/gemini-api/docs/quotas) for details.
- **Error Handling**: Errors from the Gemini API or during artifact persistence are logged to the console. The UI currently provides a generic failure message. More specific user-facing error messages can be added in the future.
- **Regenerate Functionality**: The "Regenerate" button in `ArtifactImage.tsx` is currently a placeholder and needs to be wired up to a store action that re-triggers the image generation API call.
- **Authentication**: The API route uses Clerk for authentication, ensuring that only logged-in users can generate images.
