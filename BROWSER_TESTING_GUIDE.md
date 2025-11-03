# Browser Testing Guide for Hybrid RAG

**Status**: Ready for browser testing ✅

---

## Prerequisites

Before testing in the browser, you need these services running:

1. ✅ **Hybrid RAG Sidecar** (Port 3002) - Already running
2. ⚠️ **Memory Service** (Port 3001) - Needs to be started
3. ⚠️ **LLM Gateway** (Port 8787) - Needs to be started
4. ⚠️ **Web App** (Port 5176) - Needs to be started

---

## Quick Start Commands

### Terminal 1: Memory Service
```bash
cd /home/dp/Desktop/2.0/apps/memory-service
pnpm dev
```

### Terminal 2: LLM Gateway
```bash
cd /home/dp/Desktop/2.0/apps/llm-gateway
pnpm dev
```

### Terminal 3: Web App
```bash
cd /home/dp/Desktop/2.0
pnpm dev:web
# OR
cd apps/web
pnpm dev
```

### Terminal 4: Hybrid RAG (Already Running)
The service is already running on port 3002 from our previous test.

---

## Verify Services Are Running

```bash
# Check health endpoints
curl http://localhost:3001/health  # Memory Service
curl http://localhost:8787/health   # Gateway
curl http://localhost:3002/health   # Hybrid RAG (already working)
curl http://localhost:5176          # Web App
```

---

## What to Test in Browser

### 1. Basic Chat with Web Research

**Query Types That Trigger Web Research**:
- Temporal queries: "What's the latest AI news?"
- Current events: "Tell me about recent AI developments"
- Comparative queries: "Compare React and Vue"
- Complex queries: "What are the best practices for TypeScript?"

**Expected Behavior**:
- Chat should include web search results in context
- Response should reference recent information
- Sources should be mentioned (host names)

### 2. Check Network Tab

Open browser DevTools → Network tab:

1. Look for request to `/v1/rag/hybrid`:
   - Should be called by Gateway's ContextTrimmer
   - Response should include `webResults` array
   - Should have 100ms timeout (non-blocking)

2. Check the streaming response:
   - Should include context from web results
   - Should mention web sources in the response

### 3. Test Different Query Types

**Temporal Query (Should use Web Research)**:
```
"What's the latest news about AI?"
```
Expected: Web results included, recent dates

**Personal Query (Should use Memory)**:
```
"What did we discuss earlier?"
```
Expected: Memory results, no web search

**Conceptual Query (Should use Vector + Memory)**:
```
"Explain how React hooks work"
```
Expected: Vector + Memory results

---

## What Was Fixed

I updated `ContextTrimmer.ts` to include `webResults` in the context:

**Before**:
- Only extracted `memories` and `vectorResults`
- Web results were ignored ❌

**After**:
- Extracts `memories`, `vectorResults`, AND `webResults` ✅
- Web results labeled as `[web]` in context
- Includes source host name

---

## Expected Response Format

When you send a temporal query, the LLM should receive context like:

```
Relevant context:
[web] Forget pumpkin spice; the real news from September was the massive stack of AI updates...
[web] Researchers at the University of Surrey developed an AI that predicts...
[memory] We discussed React hooks last week...
```

---

## Troubleshooting

### If Web Results Don't Appear:

1. **Check Gateway Logs**:
   ```bash
   # Look for Hybrid RAG calls
   grep -i "hybrid\|web" logs/gateway.log
   ```

2. **Check Hybrid RAG Logs**:
   ```bash
   # Should show web research executing
   tail -f /tmp/hybrid-rag.log | grep -i "web"
   ```

3. **Verify Config**:
   - `apps/llm-gateway/config/llm-gateway.json` should have `"hybridRAG": true`
   - Memory service needs `BRAVE_API_KEY` configured

4. **Test Direct Call**:
   ```bash
   curl -X POST http://localhost:3002/v1/rag/hybrid \
     -H "Content-Type: application/json" \
     -d '{"userId": "test", "query": "latest AI news"}'
   ```
   Should return webResults array.

---

## Success Indicators

✅ **In Browser**:
- Chat responses include recent information
- Sources mentioned (e.g., "according to blog.google...")
- Response quality improved with current data

✅ **In Network Tab**:
- `/v1/rag/hybrid` request visible
- Response includes `webResults: [...]`
- Response time < 2 seconds

✅ **In Gateway Logs**:
- "Hybrid RAG query completed" messages
- Web results included in context trimming

---

## Next Steps After Testing

1. **Monitor Performance**: Check latency with all layers active
2. **Test Error Handling**: Disable Qdrant, verify graceful degradation
3. **Test Memory Integration**: Use real userId with conversation history
4. **Test Query Strategy**: Verify correct layers for different query types

---

**Ready to test!** 🚀

Start the services and open http://localhost:5176 in your browser.

