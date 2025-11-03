# Fully Isolated Sidecar Agentic RAG - Implementation Plan

## Executive Summary

This document outlines the complete implementation plan for a fully isolated sidecar Agentic RAG system. The sidecar operates as a completely independent service, processing memory retrieval requests with autonomous agentic decision-making, multi-hop reasoning, and intelligent query refinement.

**Architecture Principle**: Complete isolation - the sidecar is a separate Node.js service with its own process, database, and independent scaling capabilities.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    SYSTEM ARCHITECTURE                       │
└─────────────────────────────────────────────────────────────┘

┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│   Web App    │      │ LLM Gateway  │      │Memory Service│
└──────┬───────┘      └──────┬───────┘      └──────┬───────┘
       │ SSE                  │                      │
       │                      │ HTTP                 │
       └──────────────────────┴──────────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │  Redis Pub/Sub  │
                    │  (Coordination) │
                    └────────┬────────┘
                             │
                ┌────────────┴────────────┐
                │                         │
                ▼                         ▼
    ┌──────────────────────┐  ┌──────────────────────┐
    │  Agentic RAG Sidecar │  │  Other Sidecars       │
    │  (Isolated Service)  │  │  (Research, etc.)     │
    │                       │  │                       │
    │  ┌────────────────┐  │  └──────────────────────┘
    │  │ Agent Orchestr. │  │
    │  │ Query Analyzer  │  │
    │  │ Strategy Planner│  │
    │  │ Embedding Engine │  │
    │  │ Vector DB       │  │
    │  │ Multi-hop Reason │  │
    │  │ Result Synthesizer│ │
    │  └────────────────┘  │
    │                       │
    │  ┌────────────────┐  │
    │  │ Vector Store    │  │
    │  │ (Qdrant/PGVec)  │  │
    │  └────────────────┘  │
    │                       │
    │  ┌────────────────┐  │
    │  │ Embedding Cache │  │
    │  │ Query Cache     │  │
    │  └────────────────┘  │
    └───────────────────────┘
```

---

## Component Breakdown

### 1. Core Agent Components

#### 1.1 Agent Orchestrator (`src/agent/orchestrator.ts`)
**Purpose**: Main coordination loop for agentic decision-making

**Responsibilities**:
- Receives retrieval requests from memory-service/gateway
- Coordinates multi-step agentic reasoning loops
- Manages state across reasoning steps
- Makes autonomous decisions about strategy, refinement, and termination

**Key Methods**:
```typescript
class AgentOrchestrator {
  async processQuery(request: RAGRequest): Promise<RAGResponse>
  async executeStrategy(strategy: RetrievalStrategy): Promise<RetrievalResult>
  async evaluateResults(results: RetrievalResult[]): Promise<Evaluation>
  async refineQueryIfNeeded(query: string, evaluation: Evaluation): Promise<string>
  async synthesizeFinalResults(results: RetrievalResult[]): Promise<SynthesizedResult>
}
```

#### 1.2 Query Analyzer (`src/agent/queryAnalyzer.ts`)
**Purpose**: Understands user query intent and extracts semantic components

**Capabilities**:
- Intent classification (temporal, conceptual, entity-specific, comparative, vague)
- Entity extraction (named entities, topics, concepts)
- Temporal context extraction (dates, timeframes, relative time)
- Complexity assessment (simple vs complex queries)
- Query type detection (what kind of retrieval strategy needed)

**Output**:
```typescript
interface QueryAnalysis {
  intent: QueryIntent;
  entities: string[];
  temporalContext?: TemporalContext;
  complexity: 'simple' | 'medium' | 'complex';
  confidence: number;
  suggestedStrategy: StrategyType;
}
```

#### 1.3 Strategy Planner (`src/agent/strategyPlanner.ts`)
**Purpose**: Autonomous decision-making about retrieval strategy

**Strategies**:
- **Temporal Strategy**: Time-based filtering + semantic search
- **Conceptual Strategy**: Deep semantic search + query expansion
- **Entity Strategy**: Exact match + contextual retrieval
- **Exploratory Strategy**: Multi-hop + iterative refinement
- **Comparative Strategy**: Multi-source + synthesis
- **Hybrid Strategy**: Combination of above

**Decision Logic**:
```typescript
class StrategyPlanner {
  planStrategy(analysis: QueryAnalysis, context: QueryContext): RetrievalStrategy {
    // Autonomous decision-making based on:
    // - Query complexity
    // - Available memory count
    // - User history patterns
    // - Resource constraints
  }
}
```

#### 1.4 Query Expander (`src/agent/queryExpander.ts`)
**Purpose**: Intelligently expands vague or underspecified queries

**Capabilities**:
- LLM-based query expansion (using gpt-4o-mini)
- Concept extraction and related term generation
- Context-aware expansion (uses conversation history)
- User profile-aware expansion (uses user preferences/patterns)
- Multi-lingual support (if needed)

**Example**:
```
Input: "that React thing we discussed"
Expansion: ["React hooks", "React patterns", "useState", "useEffect", "React components"]
```

#### 1.5 Multi-Hop Reasoner (`src/agent/multiHopReasoner.ts`)
**Purpose**: Follows chains of related memories across conversations

**Capabilities**:
- Memory graph traversal
- Relationship detection (same-topic, temporal-sequence, causal, contextual)
- Chain following (max 3 hops configurable)
- Cross-thread memory synthesis
- Relationship scoring

**Algorithm**:
```typescript
class MultiHopReasoner {
  async followChain(
    seedMemories: Memory[],
    maxHops: number = 3,
    relationshipTypes: RelationshipType[]
  ): Promise<MemoryChain> {
    // Start with seed memories
    // Find semantically similar memories
    // Follow relationships
    // Build coherent chain
    // Score and rank chains
  }
}
```

#### 1.6 Result Evaluator (`src/agent/evaluator.ts`)
**Purpose**: Autonomous evaluation of retrieval quality and relevance

**Evaluation Dimensions**:
- Relevance score (semantic similarity to query)
- Completeness (does it answer the query?)
- Temporal coherence (do dates make sense?)
- Confidence scoring (how reliable is this memory?)
- Coverage assessment (are all aspects of query covered?)
- Quality ranking

**Output**:
```typescript
interface Evaluation {
  overallConfidence: number;
  relevanceScore: number;
  completenessScore: number;
  temporalCoherence: number;
  needsRefinement: boolean;
  refinementReason?: string;
}
```

#### 1.7 Result Synthesizer (`src/agent/synthesizer.ts`)
**Purpose**: Combines multiple retrieval results into coherent context

**Capabilities**:
- Memory deduplication
- Temporal ordering
- Relationship mapping
- Contextual grouping
- Summary generation (when appropriate)
- Citation and attribution

---

### 2. Retrieval Components

#### 2.1 Embedding Engine (`src/retrieval/embeddingEngine.ts`)
**Purpose**: Generates and manages embeddings for memories and queries

**Features**:
- OpenAI `text-embedding-3-small` integration (1536 dimensions)
- Batch embedding generation
- Embedding cache (Redis + local)
- Incremental updates
- Query embedding generation (real-time)

**Caching Strategy**:
- Memory embeddings: Permanent cache (Redis with TTL)
- Query embeddings: Short-term cache (5 min TTL)
- Batch processing: Queue-based background jobs

#### 2.2 Vector Search Engine (`src/retrieval/vectorSearch.ts`)
**Purpose**: Performs semantic similarity search in vector space

**Vector Database Options**:
- **Primary**: Qdrant (recommended for performance)
- **Alternative**: PostgreSQL with pgvector (if using existing Postgres)
- **Fallback**: SQLite with in-memory HNSW index (for small scale)

**Search Capabilities**:
- Exact similarity search (cosine, dot product, euclidean)
- Hybrid search (semantic + keyword)
- Filtered search (by user, thread, date, tier)
- Multi-vector search (query expansion)
- Reranking with cross-encoder (optional, for high-quality results)

#### 2.3 Hybrid Retrieval (`src/retrieval/hybridRetriever.ts`)
**Purpose**: Combines multiple retrieval strategies

**Components**:
- Semantic search (vector similarity)
- Keyword search (BM25/FTS)
- Temporal filtering
- Priority/quality filtering
- Tier-based ranking

**Fusion Methods**:
- Reciprocal Rank Fusion (RRF)
- Weighted scoring
- Reranking with LLM

#### 2.4 Temporal Retriever (`src/retrieval/temporalRetriever.ts`)
**Purpose**: Time-aware memory retrieval

**Capabilities**:
- Date range filtering
- Relative time extraction ("last week", "yesterday")
- Temporal context understanding
- Chronological ordering
- Time-decay scoring

---

### 3. Storage & Data Components

#### 3.1 Vector Database (`src/storage/vectorStore.ts`)
**Purpose**: Manages vector storage and indexing

**Implementation Options**:

**Option A: Qdrant (Recommended)**
```typescript
// Qdrant Cloud or Self-hosted
interface QdrantConfig {
  url: string;
  apiKey?: string;
  collection: string;
  dimensions: 1536;
  distance: 'Cosine';
}
```

**Option B: PostgreSQL + pgvector**
```typescript
// If already using Postgres
interface PgVectorConfig {
  connectionString: string;
  table: 'memory_embeddings';
  dimensions: 1536;
}
```

**Schema Design**:
```sql
CREATE TABLE memory_embeddings (
  memory_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  thread_id TEXT,
  content TEXT NOT NULL,
  embedding vector(1536),
  metadata JSONB,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  INDEX ON embedding USING ivfflat (embedding vector_cosine_ops)
);
```

#### 3.2 Embedding Cache (`src/storage/embeddingCache.ts`)
**Purpose**: Caches generated embeddings to avoid recomputation

**Storage**:
- Redis for hot cache (fast lookup)
- Local SQLite for persistence
- TTL-based expiration

**Cache Keys**:
```
embedding:memory:{memoryId}
embedding:query:{hash(query)}
embedding:batch:{batchId}
```

#### 3.3 Query Cache (`src/storage/queryCache.ts`)
**Purpose**: Caches retrieval results for similar queries

**Strategy**:
- Cache key: hash(userId + normalizedQuery)
- TTL: Based on query type (temporal queries = shorter TTL)
- Invalidation: On new memory creation for user

#### 3.4 Memory Graph (`src/storage/memoryGraph.ts`)
**Purpose**: Stores relationships between memories for multi-hop reasoning

**Graph Structure**:
- Nodes: Memories
- Edges: Relationships (same-topic, temporal, contextual, etc.)
- Graph DB: Neo4j (optional) or SQLite with graph structure

**Relationship Types**:
```typescript
enum RelationshipType {
  SAME_TOPIC = 'same_topic',
  TEMPORAL_SEQUENCE = 'temporal_sequence',
  CAUSAL = 'causal',
  CONTEXTUAL = 'contextual',
  ENTITY_RELATED = 'entity_related'
}
```

---

### 4. Communication & Integration

#### 4.1 HTTP API Server (`src/server.ts`)
**Purpose**: REST API for sidecar service

**Endpoints**:
```typescript
POST /v1/rag/query
  Body: {
    userId: string;
    threadId?: string;
    query: string;
    context?: {
      recentMessages: Message[];
      conversationSummary?: string;
    };
    options?: {
      maxHops?: number;
      minConfidence?: number;
      enableCrossThread?: boolean;
      strategy?: StrategyType;
    };
  }
  Response: {
    memories: Memory[];
    agentReasoning?: string;
    confidence: number;
    strategy: StrategyType;
    queryExpansion?: string[];
    multiHopPaths?: MemoryChain[];
  }

POST /v1/rag/embed
  Body: {
    memoryId: string;
    userId: string;
    content: string;
    metadata?: Record<string, any>;
  }
  Response: { success: boolean; embeddingId: string }

GET /v1/rag/health
  Response: { status: 'healthy' | 'degraded' | 'unhealthy'; version: string }

POST /v1/rag/batch-embed
  Body: {
    memories: Array<{ id: string; userId: string; content: string }>;
  }
  Response: { processed: number; failed: number }
```

#### 4.2 Redis Integration (`src/communication/redis.ts`)
**Purpose**: Pub/Sub communication with other services

**Channels**:
```
rag:request:{threadId}:{requestId}  // Incoming requests
rag:response:{threadId}:{requestId} // Outgoing responses
rag:embedding:complete              // Embedding job completion
rag:status                          // Service status updates
```

**Message Format**:
```typescript
interface RedisMessage {
  type: 'request' | 'response' | 'event';
  threadId: string;
  requestId: string;
  payload: any;
  timestamp: number;
}
```

#### 4.3 WebSocket Server (Optional) (`src/communication/websocket.ts`)
**Purpose**: Real-time streaming of agent reasoning process

**Use Cases**:
- Streaming agent thinking process (for debugging/transparency)
- Real-time result updates
- Progress indicators

---

### 5. Background Processing

#### 5.1 Embedding Worker (`src/workers/embeddingWorker.ts`)
**Purpose**: Background embedding generation for new memories

**Workflow**:
1. Listen for new memory events (from Redis)
2. Generate embedding
3. Store in vector DB
4. Update graph relationships
5. Invalidate relevant caches

**Queue Management**:
- Priority queue (new memories > historical backfill)
- Batch processing (process 50 embeddings at once)
- Retry logic with exponential backoff

#### 5.2 Graph Builder (`src/workers/graphBuilder.ts`)
**Purpose**: Builds and maintains memory relationship graph

**Tasks**:
- Calculate semantic similarity between memories
- Detect relationships (same-topic, temporal, etc.)
- Update graph edges
- Cleanup stale relationships

**Frequency**: Runs every 5 minutes (configurable)

---

### 6. Configuration & Deployment

#### 6.1 Configuration (`src/config.ts`)
```typescript
interface AgenticRAGConfig {
  // LLM Configuration
  openaiApiKey: string;
  embeddingModel: 'text-embedding-3-small';
  queryExpansionModel: 'gpt-4o-mini';
  
  // Vector Database
  vectorDb: {
    provider: 'qdrant' | 'pgvector' | 'sqlite';
    url: string;
    collection: string;
  };
  
  // Redis
  redisUrl: string;
  
  // Agent Configuration
  agent: {
    maxHops: number;
    minConfidence: number;
    enableMultiHop: boolean;
    enableQueryExpansion: boolean;
    enableSelfCorrection: boolean;
  };
  
  // Performance
  embeddingBatchSize: number;
  maxConcurrentRequests: number;
  cache: {
    embeddingTTL: number;
    queryTTL: number;
  };
  
  // Feature Flags
  features: {
    multiHop: boolean;
    queryExpansion: boolean;
    temporalRetrieval: boolean;
    graphRelationships: boolean;
  };
}
```

#### 6.2 Environment Variables
```bash
# LLM APIs
OPENAI_API_KEY=sk-...

# Vector Database
VECTOR_DB_PROVIDER=qdrant
QDRANT_URL=http://localhost:6333
QDRANT_API_KEY=...

# Or PostgreSQL
POSTGRES_CONNECTION_STRING=postgresql://...

# Redis
REDIS_URL=redis://localhost:6379

# Agent Configuration
AGENT_MAX_HOPS=3
AGENT_MIN_CONFIDENCE=0.7
AGENT_ENABLE_MULTI_HOP=true

# Performance
MAX_CONCURRENT_REQUESTS=50
EMBEDDING_BATCH_SIZE=50

# Feature Flags
FEATURE_MULTI_HOP=true
FEATURE_QUERY_EXPANSION=true
```

---

## Project Structure

```
sidecar-agentic-rag/
├── package.json
├── tsconfig.json
├── .env.example
├── Dockerfile
├── docker-compose.yml
├── README.md
│
├── src/
│   ├── index.ts                 # Entry point
│   ├── config.ts                # Configuration management
│   ├── server.ts                 # HTTP server
│   │
│   ├── agent/                   # Agentic reasoning components
│   │   ├── orchestrator.ts      # Main agent coordinator
│   │   ├── queryAnalyzer.ts      # Query understanding
│   │   ├── strategyPlanner.ts   # Strategy decision-making
│   │   ├── queryExpander.ts      # Query expansion
│   │   ├── multiHopReasoner.ts   # Multi-hop reasoning
│   │   ├── evaluator.ts         # Result evaluation
│   │   ├── synthesizer.ts        # Result synthesis
│   │   └── types.ts             # Agent type definitions
│   │
│   ├── retrieval/               # Retrieval components
│   │   ├── embeddingEngine.ts   # Embedding generation
│   │   ├── vectorSearch.ts       # Vector similarity search
│   │   ├── hybridRetriever.ts   # Hybrid retrieval
│   │   ├── temporalRetriever.ts # Time-aware retrieval
│   │   └── types.ts             # Retrieval types
│   │
│   ├── storage/                  # Storage components
│   │   ├── vectorStore.ts       # Vector DB interface
│   │   ├── embeddingCache.ts   # Embedding cache
│   │   ├── queryCache.ts        # Query result cache
│   │   ├── memoryGraph.ts       # Memory graph
│   │   └── adapters/            # DB-specific adapters
│   │       ├── qdrantAdapter.ts
│   │       ├── pgvectorAdapter.ts
│   │       └── sqliteAdapter.ts
│   │
│   ├── communication/           # Inter-service communication
│   │   ├── redis.ts             # Redis pub/sub
│   │   ├── websocket.ts         # WebSocket server (optional)
│   │   └── client.ts            # HTTP client for other services
│   │
│   ├── workers/                 # Background workers
│   │   ├── embeddingWorker.ts   # Embedding generation worker
│   │   ├── graphBuilder.ts      # Graph maintenance worker
│   │   └── queue.ts             # Job queue
│   │
│   ├── utils/                   # Utilities
│   │   ├── logger.ts            # Logging
│   │   ├── metrics.ts           # Metrics/telemetry
│   │   ├── errors.ts            # Error handling
│   │   └── validation.ts        # Input validation
│   │
│   └── types/                   # Type definitions
│       ├── requests.ts          # API request types
│       ├── responses.ts          # API response types
│       ├── memory.ts            # Memory types
│       └── agent.ts             # Agent types
│
├── tests/                       # Test suite
│   ├── unit/
│   ├── integration/
│   └── e2e/
│
└── scripts/                     # Utility scripts
    ├── migrate.ts              # Database migrations
    ├── backfill-embeddings.ts   # Backfill historical embeddings
    └── seed.ts                 # Seed test data
```

---

## Implementation Phases

### Phase 1: Foundation (Week 1-2)
**Goal**: Basic infrastructure and simple retrieval

**Tasks**:
1. ✅ Set up project structure
2. ✅ Implement basic HTTP server (Fastify)
3. ✅ Set up vector database (Qdrant or pgvector)
4. ✅ Implement embedding engine (OpenAI integration)
5. ✅ Implement simple vector search (no agentic yet)
6. ✅ Basic Redis integration
7. ✅ Health check endpoint
8. ✅ Basic logging and metrics

**Deliverables**:
- Working HTTP server
- Embedding generation pipeline
- Basic semantic search (query → embeddings → vector search → results)

---

### Phase 2: Core Agent Components (Week 3-4)
**Goal**: Implement agentic reasoning core

**Tasks**:
1. ✅ Query Analyzer (intent classification, entity extraction)
2. ✅ Strategy Planner (basic strategy selection)
3. ✅ Result Evaluator (confidence scoring)
4. ✅ Basic Agent Orchestrator (simple decision loop)
5. ✅ Integration with retrieval pipeline

**Deliverables**:
- Agent can analyze queries and choose basic strategies
- Agent evaluates results and provides confidence scores
- End-to-end agentic retrieval (simple cases)

---

### Phase 3: Advanced Agent Features (Week 5-6)
**Goal**: Full agentic capabilities

**Tasks**:
1. ✅ Query Expander (LLM-based expansion)
2. ✅ Multi-Hop Reasoner (graph traversal)
3. ✅ Result Synthesizer (memory combination)
4. ✅ Self-correction loops (refine on low confidence)
5. ✅ Adaptive strategy selection

**Deliverables**:
- Full agentic reasoning loop
- Query expansion for vague queries
- Multi-hop memory chains
- Intelligent synthesis

---

### Phase 4: Storage & Caching (Week 7)
**Goal**: Optimize performance with caching

**Tasks**:
1. ✅ Embedding cache (Redis + persistence)
2. ✅ Query result cache (with invalidation)
3. ✅ Memory graph (relationship storage)
4. ✅ Cache warming strategies
5. ✅ Cache metrics and monitoring

**Deliverables**:
- Efficient caching layer
- Memory relationship graph
- Reduced API costs through caching

---

### Phase 5: Background Processing (Week 8)
**Goal**: Async embedding generation

**Tasks**:
1. ✅ Embedding worker (listens to memory events)
2. ✅ Batch embedding processing
3. ✅ Graph builder (relationship detection)
4. ✅ Queue management (priority, retry)
5. ✅ Backfill script (historical memories)

**Deliverables**:
- Async embedding generation
- No blocking on memory creation
- Automatic graph building

---

### Phase 6: Integration (Week 9-10)
**Goal**: Connect with existing services

**Tasks**:
1. ✅ Memory-service integration (send queries to sidecar)
2. ✅ Gateway integration (ContextTrimmer uses sidecar)
3. ✅ Redis pub/sub for coordination
4. ✅ Error handling and fallbacks
5. ✅ Feature flags (gradual rollout)

**Deliverables**:
- Sidecar integrated with memory-service
- Gateway uses agentic RAG
- Graceful degradation if sidecar unavailable

---

### Phase 7: Monitoring & Optimization (Week 11-12)
**Goal**: Production readiness

**Tasks**:
1. ✅ Comprehensive metrics (latency, accuracy, costs)
2. ✅ Alerting (errors, performance degradation)
3. ✅ Performance optimization (batching, caching)
4. ✅ Cost monitoring (API usage tracking)
5. ✅ Documentation
6. ✅ Load testing
7. ✅ Production deployment

**Deliverables**:
- Production-ready system
- Full monitoring and alerting
- Performance optimized
- Documentation complete

---

## Integration Points

### 1. Memory Service Integration

**Location**: `apps/memory-service/src/routes.ts`

**Changes**:
```typescript
// In /v1/recall endpoint
app.get('/v1/recall', async (req, reply) => {
  const { userId, threadId, query } = req.query;
  
  // If query provided and agentic RAG enabled, use sidecar
  if (query && config.features.agenticRAG) {
    const sidecarUrl = process.env.AGENTIC_RAG_URL || 'http://localhost:3002';
    
    try {
      const response = await fetch(`${sidecarUrl}/v1/rag/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          threadId,
          query,
          context: { recentMessages: getRecentMessages(threadId) }
        }),
        signal: AbortSignal.timeout(200) // 200ms deadline
      });
      
      if (response.ok) {
        const data = await response.json();
        return reply.send(data);
      }
    } catch (error) {
      // Fallback to simple recall
      logger.warn({ error }, 'Agentic RAG failed, falling back');
    }
  }
  
  // Fallback to existing simple recall
  return simpleRecall(req, reply);
});
```

### 2. Gateway Integration

**Location**: `apps/llm-gateway/src/ContextTrimmer.ts`

**Changes**:
```typescript
// In trim() method
async trim(threadId: string, messages: Message[], userId?: string) {
  // ... existing code ...
  
  if (userId) {
    const lastUserMessage = messages.filter(m => m.role === 'user').pop();
    
    if (lastUserMessage && config.agenticRAG?.enabled) {
      // Use agentic RAG for complex queries
      const isComplexQuery = detectComplexQuery(lastUserMessage.content);
      
      if (isComplexQuery) {
        try {
          const ragMemories = await fetchAgenticRAG({
            userId,
            threadId,
            query: lastUserMessage.content,
            context: { recentMessages: messages.slice(-5) }
          });
          
          if (ragMemories.memories.length > 0) {
            const memoryText = formatMemories(ragMemories.memories);
            trimmed.push({ role: 'system', content: `Relevant memories:\n${memoryText}` });
          }
        } catch (error) {
          // Fallback to simple recall
          const simpleMemories = await simpleRecall(userId, threadId);
          // ... use simple memories
        }
      }
    }
  }
  
  // ... rest of trimming logic ...
}
```

### 3. Memory Creation Events

**Location**: `apps/memory-service/src/routes.ts` (audit handler)

**Changes**:
```typescript
queue.registerHandler('audit', async (job) => {
  // ... existing audit logic ...
  
  // After saving memories
  for (const memory of savedMemories) {
    // Publish to Redis for embedding generation
    await redis.publish('rag:embedding:request', JSON.stringify({
      memoryId: memory.id,
      userId: memory.userId,
      content: memory.content,
      metadata: {
        threadId: memory.threadId,
        priority: memory.priority,
        tier: memory.tier
      }
    }));
  }
});
```

---

## Deployment Strategy

### Development Environment

**docker-compose.yml**:
```yaml
version: '3.8'

services:
  agentic-rag:
    build: ./sidecar-agentic-rag
    ports:
      - "3002:3002"
    environment:
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - REDIS_URL=redis://redis:6379
      - QDRANT_URL=http://qdrant:6333
      - NODE_ENV=development
    depends_on:
      - redis
      - qdrant

  qdrant:
    image: qdrant/qdrant:latest
    ports:
      - "6333:6333"
      - "6334:6334"
    volumes:
      - qdrant_data:/qdrant/storage

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

volumes:
  qdrant_data:
  redis_data:
```

### Production Deployment

**Options**:

1. **Kubernetes** (Recommended for scale)
   - Deployment with HPA (Horizontal Pod Autoscaler)
   - Separate namespace: `agentic-rag`
   - Service discovery for other services
   - ConfigMaps for configuration
   - Secrets for API keys

2. **Docker Swarm** (Simpler orchestration)
   - Service definition
   - Overlay network for service communication
   - Health checks

3. **Standalone Server** (Small scale)
   - PM2 for process management
   - Systemd service
   - Reverse proxy (Nginx)

**Resource Requirements**:
- CPU: 2-4 cores (scales with request volume)
- Memory: 4-8 GB (embeddings in memory cache)
- Storage: 10-50 GB (vector database, grows with memories)
- Network: Low latency to Redis and vector DB

---

## Testing Strategy

### Unit Tests
- Agent components (orchestrator, analyzer, planner)
- Retrieval components (vector search, hybrid retrieval)
- Storage adapters
- Utilities

### Integration Tests
- End-to-end retrieval flow
- Agentic reasoning loops
- Multi-hop traversal
- Query expansion
- Cache behavior

### Load Tests
- Concurrent request handling
- Embedding generation throughput
- Vector search performance
- Cache hit rates
- Memory usage under load

### E2E Tests
- Full integration with memory-service
- Gateway integration
- Redis pub/sub coordination
- Error handling and fallbacks

---

## Monitoring & Observability

### Metrics to Track

**Performance**:
- Request latency (p50, p95, p99)
- Embedding generation time
- Vector search latency
- Cache hit rates
- Agent loop iterations

**Quality**:
- Retrieval relevance (user feedback)
- Confidence scores distribution
- Query expansion effectiveness
- Multi-hop success rate

**Costs**:
- OpenAI API calls (embeddings + LLM)
- Vector DB operations
- Redis operations

**System Health**:
- Error rates
- Service availability
- Queue depth
- Memory usage
- CPU usage

### Logging

**Structured Logging** (Pino):
```typescript
logger.info({
  requestId,
  userId,
  query,
  strategy: 'temporal',
  memoriesFound: 5,
  confidence: 0.85,
  latency: 145,
  agentIterations: 2
}, 'Agentic RAG query completed');
```

### Dashboards

**Grafana Dashboards**:
1. Request Overview (latency, throughput, errors)
2. Agent Performance (strategy distribution, confidence scores)
3. Cost Tracking (API usage, costs per user)
4. System Health (resources, queue depth)

---

## Rollout Plan

### Phase 1: Canary Deployment (10% of queries)
- Feature flag: 10% of queries use agentic RAG
- Monitor metrics closely
- Collect user feedback

### Phase 2: Gradual Rollout (50% of queries)
- Increase to 50% if metrics positive
- Continue monitoring
- A/B testing against simple recall

### Phase 3: Full Rollout (100% of queries)
- Enable for all queries
- Keep simple recall as fallback
- Monitor for 1 week before removing fallback

---

## Success Criteria

**Performance**:
- P95 latency < 200ms (including LLM calls)
- Cache hit rate > 60%
- Error rate < 1%

**Quality**:
- User satisfaction increase (measured via feedback)
- Relevance improvement (measured via A/B testing)
- Memory recall accuracy improvement

**Cost**:
- Within budget: $40-60/month for 1000 users
- Cost per query < $0.0003

**Reliability**:
- 99.9% uptime
- Graceful degradation if services unavailable
- Zero data loss

---

## Risk Mitigation

### Risks & Mitigations

1. **High Latency**
   - Mitigation: Aggressive caching, parallel processing, timeout limits
   - Fallback: Simple recall if agentic takes > 200ms

2. **High Costs**
   - Mitigation: Caching, batch processing, model selection
   - Monitoring: Cost alerts, budget limits

3. **Vector DB Performance**
   - Mitigation: Proper indexing, connection pooling, read replicas
   - Fallback: SQLite for small scale

4. **Service Dependency**
   - Mitigation: Graceful degradation, circuit breakers, retries
   - Fallback: Simple recall always available

5. **Data Consistency**
   - Mitigation: Event-driven updates, eventual consistency model
   - Monitoring: Embedding lag alerts

---

## Timeline Summary

| Phase | Duration | Key Deliverables |
|-------|----------|------------------|
| Phase 1: Foundation | Week 1-2 | Basic infrastructure, embedding generation |
| Phase 2: Core Agent | Week 3-4 | Agent orchestration, query analysis |
| Phase 3: Advanced Features | Week 5-6 | Query expansion, multi-hop reasoning |
| Phase 4: Storage & Caching | Week 7 | Caching layer, memory graph |
| Phase 5: Background Processing | Week 8 | Async workers, embedding pipeline |
| Phase 6: Integration | Week 9-10 | Service integration, end-to-end flow |
| Phase 7: Production Ready | Week 11-12 | Monitoring, optimization, deployment |

**Total Timeline: 12 weeks (3 months)**

---

## Next Steps

1. **Review and Approve Plan**
   - Architecture review
   - Resource allocation
   - Timeline confirmation

2. **Setup Project**
   - Create `sidecar-agentic-rag/` directory
   - Initialize TypeScript project
   - Set up development environment

3. **Phase 1 Kickoff**
   - Implement foundation components
   - Set up vector database
   - Basic embedding generation

4. **Iterative Development**
   - Weekly progress reviews
   - Continuous integration
   - Regular testing

---

## Conclusion

This plan provides a complete roadmap for implementing a fully isolated, production-ready Agentic RAG sidecar. The system will significantly improve memory recall quality while maintaining complete isolation from existing services, enabling independent scaling and deployment.

The phased approach ensures steady progress with incremental value delivery, while comprehensive testing and monitoring ensure production reliability.

---

**Document Version**: 1.0  
**Last Updated**: 2024-12-19  
**Status**: Ready for Implementation

