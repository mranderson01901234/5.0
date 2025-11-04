# Image Generation Configuration Check

## ✅ Verified Working Components

1. **Database Schema**: ✅ Already supports 'image' type
   - Table: `artifacts`
   - Constraint: `CHECK(type IN ('table', 'doc', 'sheet', 'image'))`
   - Location: `apps/llm-gateway/gateway.db`

2. **Backend Endpoint**: ✅ `/api/artifacts/image` exists
   - Route handler: `apps/llm-gateway/src/routes.ts` line 2281
   - Authentication: Required via Clerk
   - Feature flag: `IMAGE_GEN_ENABLED=true`

3. **Backend Server**: ✅ Running on port 8787
   - Health check: `http://localhost:8787/api/health` ✅

4. **Environment Variables**: ✅ Set correctly
   - `IMAGE_GEN_ENABLED=true`
   - `VERTEX_AI_ACCESS_TOKEN` ✅ Set
   - `GCP_PROJECT_ID` ✅ Set (default: ultra-welder-475901-k9)
   - `GCP_LOCATION` ✅ Set (default: us-central1)

5. **Frontend Proxy**: ✅ Vite proxy configured
   - Proxy `/api/*` → `http://localhost:8787`
   - Location: `apps/web/vite.config.ts`

6. **Frontend Code**: ✅ Updated
   - `useChatStream.ts` calls `/api/artifacts/image`
   - `ArtifactImage.tsx` calls `/api/artifacts/image`

## 🔧 Configuration Checklist

### Backend (llm-gateway)
- [x] Database migration supports 'image' type
- [x] Route `/api/artifacts/image` registered
- [x] `generateImage` function imported from `utils/imagen.ts`
- [x] `IMAGE_GEN_ENABLED=true` in environment
- [x] Vertex AI credentials configured

### Frontend (web)
- [x] Vite proxy configured for `/api/*`
- [x] `useChatStream.ts` uses correct endpoint
- [x] `ArtifactImage.tsx` uses correct endpoint
- [x] `VITE_API_BASE_URL` set (or defaults to '/')

## 🐛 Common Issues & Solutions

### Issue 1: Database constraint error
**Error**: `CHECK constraint failed: type IN ('table', 'doc', 'sheet')`
**Solution**: ✅ Database already migrated - constraint includes 'image'

### Issue 2: 500 Internal Server Error
**Possible causes**:
1. Backend not running on port 8787
2. Database not accessible
3. Vertex AI authentication failed
4. Image generation failed

### Issue 3: Frontend calling wrong URL
**Error**: `POST http://localhost:5173/api/artifacts/image 500`
**Solution**: Should proxy to backend - check Vite proxy config

## 📝 Testing Steps

1. **Test Backend Directly**:
```bash
curl -X POST http://localhost:8787/api/artifacts/image \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"threadId":"test","prompt":"a cat"}'
```

2. **Test Frontend**: 
   - Open browser console
   - Generate image from chat
   - Check network tab for `/api/artifacts/image` request

3. **Check Backend Logs**:
   - Look for image generation logs
   - Check for database errors
   - Verify Vertex AI API calls

## 🔍 Debug Commands

```bash
# Check database schema
sqlite3 apps/llm-gateway/gateway.db "SELECT sql FROM sqlite_master WHERE type='table' AND name='artifacts';"

# Check backend health
curl http://localhost:8787/api/health

# Check environment variables
grep -E "IMAGE_GEN_ENABLED|VERTEX_AI" .env

# Check if backend is running
ps aux | grep "llm-gateway\|8787"
```

