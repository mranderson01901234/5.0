# Hybrid RAG Testing Guide

## Quick Testing

### 1. Prerequisites

Start required services:
```bash
# Terminal 1: Qdrant
docker run -p 6333:6333 -p 6334:6334 qdrant/qdrant

# Terminal 2: Redis (optional, for caching)
docker run -p 6379:6379 redis:7-alpine
```

Configure environment:
```bash
cd sidecar-hybrid-rag
cp .env.example .env
# Edit .env with your OPENAI_API_KEY
```

### 2. Start Sidecar
```bash
cd sidecar-hybrid-rag && pnpm dev
```

### 3. Test Health Check
```bash
curl http://localhost:3002/health
```

Expected:
```json
{
  "status": "healthy",
  "service": "hybrid-rag",
  "version": "0.1.0",
  "components": {
    "vector": "healthy"
  },
  "metrics": {
    "totalRequests": 0,
    "avgLatency": 0
  },
  "timestamp": 1234567890
}
```

### 4. Test RAG Query
```bash
curl -X POST http://localhost:3002/v1/rag/hybrid \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test_user_123",
    "threadId": "test_thread_456",
    "query": "What is React?"
  }'
```

---

## End-to-End Testing

### 1. Start All Services

**Terminal 1: Gateway**
```bash
cd apps/llm-gateway && pnpm dev
```

**Terminal 2: Memory Service**
```bash
cd apps/memory-service && pnpm dev
```

**Terminal 3: Hybrid RAG Sidecar**
```bash
cd sidecar-hybrid-rag && pnpm dev
```

**Terminal 4: Qdrant**
```bash
docker run -p 6333:6333 qdrant/qdrant
```

### 2. Enable Hybrid RAG

Edit `apps/llm-gateway/config/llm-gateway.json`:
```json
{
  "flags": {
    "hybridRAG": true
  }
}
```

Restart gateway.

### 3. Create Some Memories

Use the web app or send messages through gateway to create memory data.

### 4. Test Full Flow

Send a message through the web app and check logs:
- Gateway: Should call Hybrid RAG
- Sidecar: Should process query with analysis
- Results should be injected into context

---

## Unit Tests

```bash
cd sidecar-hybrid-rag && pnpm test
```

Current tests:
- Health check endpoint
- Basic RAG endpoint validation

---

## Manual Testing Checklist

- [ ] Health check returns healthy status
- [ ] RAG query returns valid response structure
- [ ] Query analysis working (check logs)
- [ ] Strategy selection happening (check logs)
- [ ] Memory RAG integration working
- [ ] Vector RAG working (if Qdrant has data)
- [ ] Caching working (if Redis running)
- [ ] Gateway integration working (if hybridRAG enabled)
- [ ] Metrics collection working
- [ ] Error handling graceful

---

**Current Status**: Basic smoke tests passing, integration tests pending infrastructure setup.

