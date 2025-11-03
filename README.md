# LLM Gateway Monorepo with Hybrid RAG

High-speed chat backend with SSE streaming and intelligent context retrieval.

## Features

🚀 **Hybrid RAG System** - Combines multiple retrieval methods for intelligent context
- **Memory RAG**: Personal context and conversation history (SQLite)
- **Web RAG**: Real-time information via Brave Search
- **Vector RAG**: Semantic similarity search (Qdrant + OpenAI embeddings)

🎯 **Smart Strategy Planning** - Automatically selects the best RAG layers based on query intent

⚡ **SSE Streaming** - Real-time responses with sub-5-second TTFB

## Structure

- `apps/llm-gateway` - Main Fastify gateway service
- `sidecar-hybrid-rag` - Hybrid RAG orchestrator
- `apps/memory-service` - Smart memory storage and retrieval
- `apps/web` - React-based chat UI
- `packages/shared` - Types, DTOs, OpenAPI schema

## Quick Start

### Option 1: Full System with Hybrid RAG (Recommended)

```bash
# Install dependencies
pnpm install

# Start all services (includes Hybrid RAG)
./start-hybrid-rag.sh

# Check status
./check-hybrid-rag.sh

# Stop all services
./stop-hybrid-rag.sh
```

See [QUICKSTART.md](QUICKSTART.md) for detailed setup instructions.

### Option 2: Individual Services

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Start gateway in dev mode
pnpm dev:gateway

# Run load tests
pnpm load:test
```

## Commands

### Master Scripts
- `./start-hybrid-rag.sh` - Start all services with Hybrid RAG
- `./stop-hybrid-rag.sh` - Stop all services
- `./check-hybrid-rag.sh` - Check service health

### Individual Commands
- `pnpm build` - Build all packages
- `pnpm lint` - Lint all packages
- `pnpm typecheck` - Type check all packages
- `pnpm dev:gateway` - Start gateway dev server
- `pnpm load:test` - Run load tests
- `pnpm openapi:build` - Build OpenAPI spec

## Documentation

- **[QUICKSTART.md](QUICKSTART.md)** - Get started in 3 minutes
- **[HYBRID_RAG_SETUP.md](HYBRID_RAG_SETUP.md)** - Comprehensive Hybrid RAG guide
- **[docs/MEMORY_BLUEPRINT.md](docs/MEMORY_BLUEPRINT.md)** - Memory system architecture
- **[sidecar-hybrid-rag/README.md](sidecar-hybrid-rag/README.md)** - Hybrid RAG details

## Architecture

```
┌─────────────┐
│   Web UI    │
└──────┬──────┘
       │
┌──────▼──────┐
│   Gateway   │
└───┬────┬────┘
    │    │
    │    └─────────────┐
    │                  │
┌───▼──────────┐   ┌───▼──────────┐
│  Hybrid RAG  │   │    Memory    │
│   (3002)     │   │   Service    │
└──┬────┬───┬──┘   │   (3001)     │
   │    │   │      └───┬───────┬──┘
   │    │   │          │       │
┌──▼┐ ┌─▼──┐ ┌─▼──┐ ┌─▼─┐   ┌─▼───┐
│Mem│ │Web │ │Vec │ │DB │   │Redis│
│RAG│ │RAG │ │RAG │ └───┘   └─────┘
└───┘ └────┘ └─┬──┘
               │
            ┌──▼────┐
            │Qdrant │
            └───────┘
```

