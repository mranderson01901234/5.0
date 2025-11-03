# Hybrid Agentic RAG Sidecar

Production-ready hybrid RAG system combining Memory, Web Research, Vector Search, and Graph RAG with autonomous agentic orchestration.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│      HYBRID RAG SIDECAR (Port 3002)                    │
│                                                          │
│  ┌────────────────────────────────────────────────┐     │
│  │ Hybrid Orchestrator                            │     │
│  │ ├── Query Analyzer                             │     │
│  │ ├── Strategy Planner                           │     │
│  │ └── Layer Coordinator                         │     │
│  └────────────────────────────────────────────────┘     │
│                      │                                   │
│        ┌─────────────┼─────────────┐                     │
│        │             │             │                     │
│        ▼             ▼             ▼                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐              │
│  │ Memory   │ │   Web    │ │  Vector  │              │
│  │   RAG    │ │ Research │ │  Search  │              │
│  └──────────┘ └──────────┘ └──────────┘              │
│        │             │             │                     │
│        └─────────────┼─────────────┘                     │
│                      │                                   │
│        ┌─────────────┴─────────────┐                     │
│        │                           │                     │
│        ▼                           ▼                     │
│  ┌──────────────────┐    ┌──────────────────┐          │
│  │ Verification     │    │ Synthesis        │          │
│  │   Layer          │    │   Layer          │          │
│  └──────────────────┘    └──────────────────┘          │
└──────────────────────────────────────────────────────────┘
```

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm
- Redis (for pub/sub and caching)
- Qdrant (vector database)
- OpenAI API key

### Installation

```bash
# Install dependencies
pnpm install

# Copy environment template
cp .env.example .env

# Edit .env with your API keys
```

### Development

```bash
# Start dev server
pnpm dev

# Build
pnpm build

# Run production
pnpm start

# Type check
pnpm typecheck
```

### Docker Compose

Add to main docker-compose.yml:

```yaml
services:
  hybrid-rag:
    build: ./sidecar-hybrid-rag
    ports:
      - "3002:3002"
    environment:
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - REDIS_URL=redis://redis:6379
      - QDRANT_URL=http://qdrant:6333
    depends_on:
      - redis
      - qdrant

  qdrant:
    image: qdrant/qdrant:latest
    ports:
      - "6333:6333"
    volumes:
      - qdrant_data:/qdrant/storage
```

## Implementation Phases

### Phase 1: Agentic + Memory Foundation ✅ COMPLETE
- ✅ Project setup
- ✅ Hybrid orchestrator with full agentic flow
- ✅ Query analyzer with 6 intent types
- ✅ Strategy planner with 6 fusion methods
- ✅ Memory RAG layer integrated
- ✅ Vector search layer working
- ✅ Query expansion implemented
- ✅ Caching layer (Redis + local)
- ✅ Gateway integration
- ✅ Production monitoring

### Phase 2: Web Research Integration (Weeks 13-14)
- ⏳ Web Research RAG layer
- ⏳ Integration with research pipeline
- ⏳ Parallel execution

### Phase 3: Verification Layer (Weeks 15-18)
- ⏳ Source verification
- ⏳ Fact cross-checking
- ⏳ Citation validation
- ⏳ Temporal validation

### Phase 4: Enhanced Orchestration (Weeks 19-20)
- ⏳ Graph RAG layer
- ⏳ Conflict detection
- ⏳ Advanced fusion methods

### Phase 5: Synthesis & Optimization (Weeks 21-22)
- ⏳ Performance optimization
- ⏳ Advanced monitoring
- ⏳ Production hardening

## API Endpoints

### POST /v1/rag/hybrid

Main Hybrid RAG query endpoint.

**Request**:
```json
{
  "userId": "user_123",
  "threadId": "thread_456",
  "query": "What did we discuss about React?",
  "context": {
    "recentMessages": [...]
  },
  "options": {
    "maxResults": 10,
    "enableVerification": true
  }
}
```

**Response**:
```json
{
  "memories": [...],
  "webResults": [...],
  "vectorResults": [...],
  "graphPaths": [...],
  "confidence": 0.85,
  "strategy": "temporal"
}
```

### GET /health

Health check endpoint.

**Response**:
```json
{
  "status": "healthy",
  "service": "hybrid-rag",
  "version": "0.1.0",
  "timestamp": 1234567890
}
```

## Configuration

See `.env.example` for all configuration options.

Key settings:
- `PORT`: Server port (default: 3002)
- `OPENAI_API_KEY`: OpenAI API key
- `QDRANT_URL`: Qdrant vector database URL
- `REDIS_URL`: Redis connection string
- `AGENT_MAX_HOPS`: Max graph traversal hops (default: 3)
- `AGENT_MIN_CONFIDENCE`: Minimum confidence threshold (default: 0.7)

## Documentation

- [Hybrid Agentic RAG Blueprint](../../HYBRID_AGENTIC_RAG_BLUEPRINT.md) - Complete architecture
- [Agentic RAG Implementation Plan](../../AGENTIC_RAG_IMPLEMENTATION_PLAN.md) - Phase 1 plan
- [Architecture Analysis](../../HYBRID_RAG_ARCHITECTURE_ANALYSIS.md) - Strategy analysis

## License

Private - Internal Use Only

