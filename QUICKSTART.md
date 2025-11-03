# Quick Start Guide - Hybrid RAG

Get your LLM Gateway with Hybrid RAG running in 3 minutes.

## Prerequisites

✅ Node.js v20+ and pnpm  
✅ Docker (optional, for vector search)  
✅ API keys: OpenAI, Brave, and at least one LLM provider

## 1. Setup Environment

```bash
# Create .env file
cat > .env << 'EOF'
OPENAI_API_KEY=sk-your-key-here
BRAVE_API_KEY=your-brave-key-here
ANTHROPIC_API_KEY=sk-your-key-here

# Optional
REDIS_URL=redis://localhost:6379
EOF
```

## 2. Install Dependencies

```bash
pnpm install
```

## 3. Start Services

```bash
# One command to start everything
./start-hybrid-rag.sh
```

Wait for all services to start (takes ~30 seconds).

## 4. Verify

```bash
# Check status
./check-hybrid-rag.sh
```

You should see all services marked with ✅.

## 5. Test

### Open Web UI
Visit: http://localhost:5176

### Or test via API
```bash
curl -X POST http://localhost:8787/v1/chat/stream \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test-token" \
  -d '{
    "messages": [{"role": "user", "content": "What are the latest developments in Python async programming?"}],
    "thread_id": "test"
  }'
```

## Optional: Enable Vector Search

```bash
# Start Qdrant
docker run -d -p 6333:6333 --name qdrant qdrant/qdrant

# Verify
curl http://localhost:6333/collections
```

## Stop Services

```bash
./stop-hybrid-rag.sh
```

## Troubleshooting

### Port already in use
```bash
./stop-hybrid-rag.sh  # Stop all services first
```

### Service won't start
```bash
# Check logs
tail -f logs/hybrid-rag.log

# Reinstall dependencies
pnpm install
```

### Vector search not working
```bash
# Check Qdrant is running
docker ps | grep qdrant

# If not, start it
docker start qdrant
```

## Next Steps

- Read [HYBRID_RAG_SETUP.md](HYBRID_RAG_SETUP.md) for detailed documentation
- Explore the architecture in the docs folder
- Customize RAG layers for your use case

## Need Help?

- Check logs: `logs/*.log`
- Run health check: `./check-hybrid-rag.sh`
- Review [HYBRID_RAG_SETUP.md](HYBRID_RAG_SETUP.md)

## Architecture Overview

```
Web UI → Gateway → Hybrid RAG → [Memory RAG + Web RAG + Vector RAG]
                                    ↓           ↓           ↓
                                 SQLite      Brave      Qdrant
```

All RAG layers work together to provide the best context to the LLM!

