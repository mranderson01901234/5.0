# Hybrid RAG System Setup & Usage Guide

Complete guide for setting up and running the LLM Gateway with Hybrid RAG.

## Quick Start

```bash
# Start all services
./start-hybrid-rag.sh

# Check status
./check-hybrid-rag.sh

# Stop all services
./stop-hybrid-rag.sh
```

## System Architecture

```
┌─────────────────┐
│   Web UI (5176) │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Gateway (8787)  │
└────────┬────────┘
         │
         ├─────────────────┐
         ▼                 ▼
┌─────────────────┐ ┌─────────────────┐
│  Hybrid RAG     │ │  Memory Service │
│   (3002)        │ │     (3001)      │
└────────┬────────┘ └────────┬────────┘
         │                   │
         ├───────────────────┤
         ▼                   ▼
    ┌────────┐          ┌─────────┐
    │ Qdrant │          │ SQLite  │
    │(6333)  │          │  Memory │
    │Vector  │          │   DB    │
    └────────┘          └─────────┘
```

## Services

### 1. Gateway (Port 8787)
- Main LLM routing and chat interface
- Integrates Hybrid RAG for context injection
- SSE streaming for real-time responses

**Dependencies:** Hybrid RAG, Memory Service

### 2. Hybrid RAG (Port 3002)
- Orchestrates multiple RAG layers
- Query analysis and strategy planning
- Result fusion and confidence scoring

**Dependencies:** Memory Service, Qdrant (optional), Redis (optional)

### 3. Memory Service (Port 3001)
- Smart memory storage and retrieval
- Web search capabilities (Brave API)
- Research capsule generation

**Dependencies:** SQLite, Redis (optional)

### 4. Web UI (Port 5176)
- React-based chat interface
- Real-time SSE streaming

**Dependencies:** Gateway

## RAG Layers

### ✅ Web RAG
- **Status:** Always enabled (if Brave API key configured)
- **Source:** Brave Search API
- **Use Case:** Real-time information, current events
- **Performance:** ~3-4 seconds per query

### ⚠️ Vector RAG
- **Status:** Requires Qdrant running
- **Source:** Vector embeddings (OpenAI)
- **Use Case:** Semantic similarity search
- **Performance:** <100ms when enabled

**Enable:** 
```bash
docker run -d -p 6333:6333 --name qdrant qdrant/qdrant
```

### ✅ Memory RAG
- **Status:** Always enabled
- **Source:** SQLite database
- **Use Case:** Personal context, conversation history
- **Performance:** <50ms

## Prerequisites

### Required
1. **Node.js** v20+ and pnpm
2. **Docker** (for Qdrant vector search - optional but recommended)
3. **API Keys** (see below)

### API Keys

Create a `.env` file in the root directory:

```bash
# Required for Hybrid RAG
OPENAI_API_KEY=sk-...          # For embeddings (Vector RAG)
BRAVE_API_KEY=...              # For web search (Web RAG)

# Required for LLM (choose at least one)
ANTHROPIC_API_KEY=sk-...       # Recommended (Claude)
# OR
OPENAI_API_KEY=sk-...          # Can reuse for LLM too

# Optional
REDIS_URL=redis://localhost:6379  # For caching
QDRANT_URL=http://localhost:6333  # Default, usually no need to change
```

## Setup Steps

### 1. Initial Setup

```bash
# Install dependencies
pnpm install

# Verify .env file exists
cat .env

# Check Docker (for Qdrant)
docker ps
```

### 2. Start Services

```bash
# Option A: Use the master script (recommended)
./start-hybrid-rag.sh

# Option B: Start manually
pnpm --filter @memory-service/app dev &
pnpm --filter @llm-gateway/hybrid-rag dev &
pnpm --filter @llm-gateway/app dev &
pnpm dev:web &
```

### 3. Enable Vector RAG (Optional)

```bash
# Start Qdrant
docker run -d -p 6333:6333 --name qdrant qdrant/qdrant

# Verify it's running
docker ps | grep qdrant
curl http://localhost:6333/collections
```

### 4. Verify Setup

```bash
# Check all services
./check-hybrid-rag.sh

# Or manually
curl http://localhost:8787/v1
curl http://localhost:3001/v1/metrics
curl http://localhost:3002/health
curl http://localhost:5176
```

## Testing

### Basic Chat Test

```bash
curl -X POST http://localhost:8787/v1/chat/stream \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test-token" \
  -d '{
    "messages": [{"role": "user", "content": "What are the latest developments in Python async programming?"}],
    "thread_id": "test-thread"
  }'
```

### Hybrid RAG Test

```bash
curl -X POST http://localhost:3002/v1/rag/hybrid \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user",
    "threadId": "test-thread",
    "query": "What are the latest developments in Python async programming?"
  }' | jq .
```

### Expected Response

```json
{
  "memories": [],
  "webResults": [
    {
      "content": "...",
      "source": {
        "url": "https://...",
        "host": "...",
        "date": "8 hours ago",
        "tier": "tier3"
      },
      "relevanceScore": 0.7,
      "fetchedAt": 1234567890
    }
  ],
  "vectorResults": [],
  "synthesis": {
    "totalResults": 2,
    "layerBreakdown": {
      "memory": 0,
      "web": 2,
      "vector": 0,
      "graph": 0
    },
    "fusionMethod": "weighted"
  },
  "confidence": 0.7,
  "strategy": "weighted",
  "latency": 3456
}
```

## Monitoring

### View Logs

```bash
# All services
tail -f logs/gateway.log
tail -f logs/hybrid-rag.log
tail -f logs/memory-service.log
tail -f logs/web.log

# Specific service
tail -f logs/hybrid-rag.log | grep -E "(Web RAG|Strategy planned|Vector search)"
```

### Health Checks

```bash
# Quick status
./check-hybrid-rag.sh

# Detailed
curl http://localhost:3002/health | jq .

# Metrics
curl http://localhost:3001/v1/metrics | jq .
```

### Common Issues

#### Services won't start
```bash
# Check if ports are in use
lsof -ti:8787
lsof -ti:3001
lsof -ti:3002
lsof -ti:5176

# Kill existing processes
kill -9 $(lsof -ti:8787)
```

#### Vector RAG not working
```bash
# Check Qdrant
docker ps | grep qdrant
curl http://localhost:6333/collections

# Check logs
tail -f logs/hybrid-rag.log | grep -i "vector"
```

#### Web RAG timeout
- Check Brave API key in `.env`
- Verify network connectivity
- Check logs: `tail -f logs/hybrid-rag.log | grep -i "web"`
- Normal latency: 3-4 seconds

#### Memory RAG returns nothing
- This is normal if no conversations exist yet
- Start using the chat to create memories
- Check memory DB: `ls -lh apps/memory-service/data/memory.db`

## Configuration

### Service Ports

Configure in `.env`:

```bash
GATEWAY_PORT=8787
MEMORY_SERVICE_PORT=3001
HYBRID_RAG_PORT=3002
```

### RAG Layer Behavior

```bash
# In sidecar-hybrid-rag/src/orchestrator/strategyPlanner.ts
# Adjust layer priorities and fusion methods

# In apps/llm-gateway/src/ContextTrimmer.ts
# Adjust timeout (default: 6000ms)
# Adjust max results (default: 5)
```

### Performance Tuning

```bash
# Enable Redis caching
REDIS_URL=redis://localhost:6379

# Adjust embedding batch size
EMBEDDING_BATCH_SIZE=50

# Adjust cache TTLs
EMBEDDING_CACHE_TTL_SECONDS=604800
QUERY_CACHE_TTL_SECONDS=3600
```

## Development

### File Watch

All services use `tsx watch` for automatic reloading:

- `apps/llm-gateway/package.json`: `tsx watch src/server.ts`
- `sidecar-hybrid-rag/package.json`: `tsx watch src/index.ts`
- `apps/memory-service/package.json`: `tsx watch src/server.ts`

### Adding New RAG Layer

1. Create layer class in `sidecar-hybrid-rag/src/layers/`
2. Register in `sidecar-hybrid-rag/src/orchestrator/hybridOrchestrator.ts`
3. Update strategy planner for when to use it
4. Add to synthesis logic

### Debugging

```bash
# Enable debug logging
export LOG_LEVEL=debug

# Restart services
./stop-hybrid-rag.sh
./start-hybrid-rag.sh

# Watch for specific errors
tail -f logs/hybrid-rag.log | grep -E "(ERROR|WARN)"
```

## Troubleshooting

### Gateway times out on Hybrid RAG
- Check Hybrid RAG is running: `curl http://localhost:3002/health`
- Check logs for errors
- Increase timeout in `ContextTrimmer.ts` if needed

### No results from Hybrid RAG
- Check which layers are enabled: `./check-hybrid-rag.sh`
- Test each layer individually using the API
- Verify API keys are correct

### Services crash on startup
- Check `.env` file exists and has valid keys
- Verify databases are writable: `chmod 644 apps/*/gateway.db`
- Check Docker is running (if using Qdrant)

### Port already in use
```bash
# Find what's using the port
lsof -ti:3002

# Kill it
kill -9 $(lsof -ti:3002)

# Or use the stop script
./stop-hybrid-rag.sh
```

## Next Steps

1. **Populate vector database** - Add embeddings from your documents
2. **Configure research** - Adjust topic extraction and recency hints
3. **Add verification** - Implement fact-checking and citation validation
4. **Optimize performance** - Enable caching, batch processing
5. **Monitor usage** - Track RAG layer effectiveness

## Support

For issues or questions:
- Check logs: `logs/*.log`
- Run health check: `./check-hybrid-rag.sh`
- Review documentation: `docs/`
- Check existing issues

## License

See LICENSE file.

