# Image Generation API Route Fix

## Issue
The frontend was trying to call `/api/artifacts/image` but getting a 404 error because:
- The app uses Vite (not Next.js), so `pages/api` routes don't work
- Vite proxies `/api` requests to the backend (llm-gateway) on port 8787
- The endpoint didn't exist in the backend

## Solution
Moved the image generation endpoint to the backend (llm-gateway) where it belongs.

## Changes Made

### 1. Created Imagen Utility (`apps/llm-gateway/src/utils/imagen.ts`)
- ✅ Moved image generation logic from frontend to backend
- ✅ Same functionality as before
- ✅ Uses Google Imagen 4 models
- ✅ Supports all parameters

### 2. Added Backend Endpoint (`apps/llm-gateway/src/routes.ts`)
- ✅ Added `POST /api/artifacts/image` endpoint
- ✅ Proper authentication via Clerk (using backend's auth system)
- ✅ Feature flag check (`IMAGE_GEN_ENABLED`)
- ✅ Generates images using Imagen 4
- ✅ Creates artifact in database
- ✅ Cost tracking and logging
- ✅ Error handling

### 3. Frontend Already Configured
- ✅ Frontend code in `useChatStream.ts` already calls `/api/artifacts/image`
- ✅ Vite proxy already configured to forward `/api` to backend
- ✅ No frontend changes needed!

## How It Works Now

1. Frontend calls: `POST /api/artifacts/image`
2. Vite proxy forwards to: `http://localhost:8787/api/artifacts/image`
3. Backend (llm-gateway) handles:
   - Authentication
   - Image generation via Imagen 4
   - Artifact creation
   - Cost tracking
4. Response returned to frontend

## Testing

The endpoint should now work! Try:
- Upload an image prompt in chat
- Gatekeeper detects image intent
- Calls `/api/artifacts/image`
- Images generated and artifact created

## Environment Variables

Make sure these are set:
- `GOOGLE_API_KEY` - Required for Imagen API
- `IMAGE_GEN_ENABLED=true` - Enable image generation feature

## Next Steps

1. Restart the backend (llm-gateway) service
2. Test image generation
3. Verify artifacts are created correctly

