# Hybrid Agentic RAG Blueprint
## Complete Implementation Guide

**Version**: 1.0  
**Status**: Production Ready  
**Timeline**: 22 weeks (5.5 months)  
**Architecture**: Fully Isolated Sidecar with Hybrid Orchestration

---

## Executive Summary

This blueprint defines a complete **Hybrid Agentic RAG** system combining:
- **Agentic RAG**: Autonomous reasoning and intelligent retrieval
- **Verified RAG**: Source verification and fact-checking
- **Memory RAG**: Conversation history and personal context
- **Web Research RAG**: Real-time external information

The system operates as a fully isolated sidecar service with complete independence from existing services, enabling autonomous scaling and deployment.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    HYBRID RAG ECOSYSTEM                         │
└─────────────────────────────────────────────────────────────────┘

┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│   Web App    │      │ LLM Gateway  │      │Memory Service│
└──────┬───────┘      └──────┬───────┘      └──────┬───────┘
       │ SSE                  │ HTTP                 │
       └──────────────────────┴──────────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │  Redis Pub/Sub  │
                    │  (Coordination) │
                    └────────┬────────┘
                             │
                             ▼
    ┌──────────────────────────────────────────────────────┐
    │     HYBRID AGENTIC RAG SIDECAR                        │
    │     (Isolated Service - Port 3002)                    │
    │                                                        │
    │  ┌────────────────────────────────────────────────┐  │
    │  │  HYBRID ORCHESTRATOR                            │  │
    │  │  - Query Analysis                               │  │
    │  │  - Strategy Planning                            │  │
    │  │  - Layer Coordination                           │  │
    │  │  - Conflict Detection                           │  │
    │  │  - Result Synthesis                            │  │
    │  └────────────────────────────────────────────────┘  │
    │                    │                                  │
    │        ┌────────────┼────────────┐                    │
    │        │            │            │                     │
    │        ▼            ▼            ▼                     │
    │  ┌──────────┐ ┌──────────┐ ┌──────────┐             │
    │  │  Memory  │ │   Web    │ │  Vector  │             │
    │  │   RAG    │ │ Research │ │  Search  │             │
    │  │  Layer   │ │   RAG    │ │  Layer   │             │
    │  └────┬─────┘ └────┬─────┘ └────┬─────┘             │
    │       │            │            │                     │
    │       └────────────┼────────────┘                     │
    │                    │                                  │
    │                    ▼                                  │
    │  ┌────────────────────────────────────────────────┐  │
    │  │  VERIFICATION LAYER                             │  │
    │  │  - Source Verification                          │  │
    │  │  - Fact Cross-Checking                          │  │
    │  │  - Citation Validation                         │  │
    │  │  - Temporal Validation                         │  │
    │  │  - Authority Scoring                           │  │
    │  └────────────────────────────────────────────────┘  │
    │                    │                                  │
    │                    ▼                                  │
    │  ┌────────────────────────────────────────────────┐  │
    │  │  SYNTHESIS LAYER                                │  │
    │  │  - Layer Fusion                                 │  │
    │  │  - Deduplication                                │  │
    │  │  - Temporal Ordering                            │  │
    │  │  - Relevance Ranking                            │  │
    │  │  - Confidence Scoring                           │  │
    │  └────────────────────────────────────────────────┘  │
    │                                                        │
    │  ┌────────────────────────────────────────────────┐  │
    │  │  STORAGE LAYER                                  │  │
    │  │  - Vector DB (Qdrant)                           │  │
    │  │  - Embedding Cache (Redis)                      │  │
    │  │  - Query Cache (Redis)                         │  │
    │  │  - Memory Graph (SQLite)                        │  │
    │  └────────────────────────────────────────────────┘  │
    │                                                        │
    │  ┌────────────────────────────────────────────────┐  │
    │  │  BACKGROUND WORKERS                             │  │
    │  │  - Embedding Generator                          │  │
    │  │  - Graph Builder                                │  │
    │  │  - Verification Updater                         │  │
    │  └────────────────────────────────────────────────┘  │
    └────────────────────────────────────────────────────────┘
```

---

## Component Architecture

### 1. Hybrid Orchestrator

**File**: `src/orchestrator/hybridOrchestrator.ts`

**Purpose**: Main coordination point for all RAG layers

**Responsibilities**:
- Query analysis and intent detection
- Strategy planning (which layers to use)
- Parallel layer coordination
- Conflict detection and resolution
- Result synthesis from all layers
- Confidence scoring

**Core Interface**:
```typescript
export class HybridOrchestrator {
  /**
   * Main entry point - processes query through hybrid RAG
   */
  async processQuery(request: HybridRAGRequest): Promise<HybridRAGResponse> {
    // 1. Analyze query
    const analysis = await this.queryAnalyzer.analyze(request);
    
    // 2. Plan strategy
    const strategy = await this.strategyPlanner.plan(analysis);
    
    // 3. Execute parallel retrieval
    const layerResults = await this.executeLayers(strategy, request);
    
    // 4. Verify results
    const verifiedResults = await this.verifyResults(layerResults, strategy);
    
    // 5. Detect conflicts
    const conflicts = await this.detectConflicts(verifiedResults);
    
    // 6. Synthesize final result
    return await this.synthesize(verifiedResults, conflicts, strategy);
  }
  
  /**
   * Execute retrieval from multiple layers in parallel
   */
  private async executeLayers(
    strategy: RetrievalStrategy,
    request: HybridRAGRequest
  ): Promise<LayerResults> {
    const promises: Promise<any>[] = [];
    
    if (strategy.useMemory) {
      promises.push(this.memoryRAG.retrieve(request));
    }
    
    if (strategy.useWebResearch) {
      promises.push(this.webResearchRAG.retrieve(request));
    }
    
    if (strategy.useVector) {
      promises.push(this.vectorRAG.retrieve(request));
    }
    
    if (strategy.useGraph) {
      promises.push(this.graphRAG.retrieve(request));
    }
    
    const [memory, web, vector, graph] = await Promise.all(promises);
    
    return { memory, web, vector, graph };
  }
  
  /**
   * Verify all retrieved results
   */
  private async verifyResults(
    results: LayerResults,
    strategy: RetrievalStrategy
  ): Promise<VerifiedResults> {
    if (!strategy.enableVerification) {
      return this.skipVerification(results);
    }
    
    const verified = await Promise.all([
      this.verifier.verifyMemory(results.memory),
      this.verifier.verifyWeb(results.web),
      this.verifier.verifyVector(results.vector),
      this.verifier.verifyGraph(results.graph),
    ]);
    
    return {
      memory: verified[0],
      web: verified[1],
      vector: verified[2],
      graph: verified[3],
    };
  }
  
  /**
   * Detect conflicts between layers
   */
  private async detectConflicts(
    results: VerifiedResults
  ): Promise<Conflict[]> {
    const conflicts: Conflict[] = [];
    
    // Memory vs Web conflicts
    const memoryWebConflicts = this.findConflicts(
      results.memory,
      results.web,
      'memory_vs_web'
    );
    conflicts.push(...memoryWebConflicts);
    
    // Memory vs Vector conflicts
    const memoryVectorConflicts = this.findConflicts(
      results.memory,
      results.vector,
      'memory_vs_vector'
    );
    conflicts.push(...memoryVectorConflicts);
    
    // Web vs Vector conflicts
    const webVectorConflicts = this.findConflicts(
      results.web,
      results.vector,
      'web_vs_vector'
    );
    conflicts.push(...webVectorConflicts);
    
    return conflicts;
  }
  
  /**
   * Synthesize final result from all layers
   */
  private async synthesize(
    results: VerifiedResults,
    conflicts: Conflict[],
    strategy: RetrievalStrategy
  ): Promise<HybridRAGResponse> {
    return this.synthesizer.synthesize({
      memory: results.memory,
      web: results.web,
      vector: results.vector,
      graph: results.graph,
      conflicts,
      strategy,
      query: strategy.originalQuery,
    });
  }
}
```

---

### 2. Query Analyzer

**File**: `src/orchestrator/queryAnalyzer.ts`

**Purpose**: Understands user query intent and complexity

**Capabilities**:
```typescript
export class QueryAnalyzer {
  /**
   * Analyze query to determine intent, complexity, and requirements
   */
  async analyze(query: string, context: QueryContext): Promise<QueryAnalysis> {
    // Intent classification
    const intent = await this.classifyIntent(query);
    
    // Entity extraction
    const entities = await this.extractEntities(query);
    
    // Temporal context
    const temporal = this.extractTemporalContext(query);
    
    // Complexity assessment
    const complexity = await this.assessComplexity(query);
    
    // Query type detection
    const queryType = this.detectQueryType(query, intent);
    
    return {
      intent,
      entities,
      temporal,
      complexity,
      queryType,
      requiresPersonalContext: this.needsPersonalContext(intent),
      requiresCurrentInfo: this.needsCurrentInfo(intent, temporal),
      requiresVerification: this.needsVerification(queryType),
      confidence: this.calculateAnalysisConfidence(intent, entities),
    };
  }
  
  /**
   * Classify query intent
   */
  private async classifyIntent(query: string): Promise<QueryIntent> {
    // Use LLM for intent classification
    const response = await this.llm.classifyIntent(query);
    
    return {
      primary: response.intent, // 'personal', 'factual', 'conceptual', 'comparative', 'temporal'
      secondary: response.subIntent,
      confidence: response.confidence,
    };
  }
  
  /**
   * Extract entities (people, places, concepts, etc.)
   */
  private async extractEntities(query: string): Promise<string[]> {
    // Use NER (Named Entity Recognition) or LLM extraction
    return await this.entityExtractor.extract(query);
  }
  
  /**
   * Extract temporal context (dates, timeframes)
   */
  private extractTemporalContext(query: string): TemporalContext | null {
    // Pattern matching for temporal expressions
    const patterns = {
      lastWeek: /last\s+week/i,
      lastMonth: /last\s+month/i,
      yesterday: /yesterday/i,
      today: /today|now|current/i,
      date: /\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4}/,
    };
    
    // Extract and normalize
    // Return TemporalContext with timeframe, dates, etc.
  }
  
  /**
   * Assess query complexity
   */
  private async assessComplexity(query: string): Promise<Complexity> {
    // Factors:
    // - Query length and structure
    // - Number of entities/concepts
    // - Vagueness indicators
    // - Multi-part questions
    
    const score = this.complexityScorer.score(query);
    
    if (score < 0.3) return 'simple';
    if (score < 0.7) return 'medium';
    return 'complex';
  }
  
  /**
   * Detect query type
   */
  private detectQueryType(
    query: string,
    intent: QueryIntent
  ): QueryType {
    // Personal/Historical: "What did I prefer?"
    // Current Events: "What happened today?"
    // Conceptual: "How does React work?"
    // Comparative: "React vs Vue"
    // Factual: "What is React?"
    // Vague: "That thing we discussed"
    
    if (intent.primary === 'personal') return 'personal';
    if (intent.primary === 'temporal') return 'temporal';
    if (intent.primary === 'comparative') return 'comparative';
    if (intent.primary === 'conceptual') return 'conceptual';
    return 'factual';
  }
}
```

---

### 3. Strategy Planner

**File**: `src/orchestrator/strategyPlanner.ts`

**Purpose**: Decides which RAG layers to use for each query

**Strategy Decision Logic**:
```typescript
export class StrategyPlanner {
  /**
   * Plan retrieval strategy based on query analysis
   */
  async plan(analysis: QueryAnalysis): Promise<RetrievalStrategy> {
    const strategy: RetrievalStrategy = {
      useMemory: false,
      useWebResearch: false,
      useVector: false,
      useGraph: false,
      enableVerification: false,
      layerPriority: [],
      fusionMethod: 'weighted',
      originalQuery: analysis.originalQuery,
    };
    
    // Personal/Historical queries → Memory + Graph
    if (analysis.queryType === 'personal') {
      strategy.useMemory = true;
      strategy.useGraph = true;
      strategy.enableVerification = false; // Trust user memory
      strategy.layerPriority = ['memory', 'graph'];
      strategy.fusionMethod = 'memory_priority';
      return strategy;
    }
    
    // Current Events → Web Research + Vector + Verification
    if (analysis.queryType === 'temporal' && analysis.temporal?.isRecent) {
      strategy.useWebResearch = true;
      strategy.useVector = true;
      strategy.enableVerification = true; // Critical for news
      strategy.layerPriority = ['web', 'vector'];
      strategy.fusionMethod = 'recency_weighted';
      return strategy;
    }
    
    // Conceptual queries → Vector + Memory
    if (analysis.queryType === 'conceptual') {
      strategy.useVector = true;
      strategy.useMemory = true; // User's past understanding
      strategy.enableVerification = true;
      strategy.layerPriority = ['vector', 'memory'];
      strategy.fusionMethod = 'semantic_priority';
      return strategy;
    }
    
    // Comparative queries → All layers
    if (analysis.queryType === 'comparative') {
      strategy.useMemory = true;
      strategy.useWebResearch = true;
      strategy.useVector = true;
      strategy.useGraph = true;
      strategy.enableVerification = true;
      strategy.layerPriority = ['web', 'vector', 'memory', 'graph'];
      strategy.fusionMethod = 'comprehensive';
      return strategy;
    }
    
    // Complex/Vague queries → All layers + Agentic expansion
    if (analysis.complexity === 'complex') {
      strategy.useMemory = true;
      strategy.useWebResearch = true;
      strategy.useVector = true;
      strategy.useGraph = true;
      strategy.enableVerification = true;
      strategy.layerPriority = ['vector', 'web', 'memory', 'graph'];
      strategy.fusionMethod = 'agentic_synthesis';
      strategy.needsExpansion = true;
      return strategy;
    }
    
    // Default: Simple factual → Vector + Web
    strategy.useVector = true;
    strategy.useWebResearch = true;
    strategy.enableVerification = true;
    strategy.layerPriority = ['vector', 'web'];
    strategy.fusionMethod = 'weighted';
    
    return strategy;
  }
}
```

---

### 4. Memory RAG Layer

**File**: `src/layers/memoryRAG.ts`

**Purpose**: Retrieves from conversation history and stored memories

**Implementation**:
```typescript
export class MemoryRAGLayer {
  constructor(
    private memoryService: MemoryServiceClient,
    private embeddingCache: EmbeddingCache,
    private vectorDB: VectorDatabase
  ) {}
  
  /**
   * Retrieve memories using hybrid approach
   */
  async retrieve(request: HybridRAGRequest): Promise<MemoryResult[]> {
    const { userId, query, threadId, context } = request;
    
    // Strategy: Hybrid keyword + semantic
    const [keywordResults, semanticResults] = await Promise.all([
      this.keywordRetrieval(userId, query, threadId),
      this.semanticRetrieval(userId, query, threadId),
    ]);
    
    // Merge and deduplicate
    const merged = this.mergeResults(keywordResults, semanticResults);
    
    // Apply filters
    const filtered = this.applyFilters(merged, context);
    
    // Rank by relevance
    const ranked = await this.rankByRelevance(filtered, query);
    
    return ranked;
  }
  
  /**
   * Keyword-based retrieval (fallback/primary for simple queries)
   */
  private async keywordRetrieval(
    userId: string,
    query: string,
    threadId?: string
  ): Promise<MemoryResult[]> {
    // Use existing memory-service /v1/recall endpoint
    const response = await this.memoryService.recall({
      userId,
      threadId,
      maxItems: 10,
    });
    
    // Filter by keyword match
    const queryTerms = this.extractTerms(query);
    return response.memories
      .filter(m => this.matchesKeywords(m.content, queryTerms))
      .map(m => this.toMemoryResult(m));
  }
  
  /**
   * Semantic retrieval (primary for complex queries)
   */
  private async semanticRetrieval(
    userId: string,
    query: string,
    threadId?: string
  ): Promise<MemoryResult[]> {
    // Generate query embedding
    const queryEmbedding = await this.embeddingCache.getEmbedding(query);
    
    // Vector search
    const vectorResults = await this.vectorDB.search({
      userId,
      queryVector: queryEmbedding,
      topK: 10,
      minSimilarity: 0.7,
      filters: threadId ? { threadId } : undefined,
    });
    
    // Convert to MemoryResult
    return vectorResults.map(vr => this.toMemoryResult(vr));
  }
  
  /**
   * Cross-thread memory retrieval (using graph)
   */
  async retrieveCrossThread(
    userId: string,
    seedMemories: MemoryResult[]
  ): Promise<MemoryResult[]> {
    // Use graph relationships to find related memories
    const related = await this.graphTraversal.followRelations(
      seedMemories,
      {
        userId,
        maxHops: 2,
        relationshipTypes: ['same_topic', 'contextual'],
      }
    );
    
    return related;
  }
  
  /**
   * Temporal filtering
   */
  private async temporalFilter(
    memories: MemoryResult[],
    temporal: TemporalContext
  ): Promise<MemoryResult[]> {
    if (!temporal) return memories;
    
    const cutoff = this.calculateCutoff(temporal);
    
    return memories.filter(m => {
      const memoryDate = new Date(m.createdAt * 1000);
      return memoryDate >= cutoff;
    });
  }
}
```

---

### 5. Web Research RAG Layer

**File**: `src/layers/webResearchRAG.ts`

**Purpose**: Retrieves from real-time web search (integrates with existing research pipeline)

**Implementation**:
```typescript
export class WebResearchRAGLayer {
  constructor(
    private researchPipeline: ResearchPipelineClient,
    private braveAPI: BraveSearchClient,
    private newsDataAPI: NewsDataClient
  ) {}
  
  /**
   * Retrieve from web research
   */
  async retrieve(request: HybridRAGRequest): Promise<WebResult[]> {
    const { query, context } = request;
    
    // Check for existing research capsule
    const cached = await this.checkCache(query, context);
    if (cached) {
      return this.capsuleToResults(cached);
    }
    
    // Trigger new research
    const capsule = await this.researchPipeline.research({
      query,
      context,
    });
    
    if (!capsule) return [];
    
    // Convert capsule to WebResult format
    return this.capsuleToResults(capsule);
  }
  
  /**
   * Direct web search (bypass research pipeline for simple queries)
   */
  async directSearch(
    query: string,
    options: SearchOptions = {}
  ): Promise<WebResult[]> {
    const results = await this.braveAPI.search(query, {
      count: 10,
      freshness: options.freshness || 'month',
    });
    
    return results.map(item => ({
      content: item.snippet || item.title,
      source: {
        url: item.url,
        host: item.host,
        date: item.date,
        tier: this.getAuthorityTier(item.host),
      },
      relevanceScore: this.calculateRelevance(item, query),
      fetchedAt: Date.now(),
    }));
  }
  
  /**
   * Convert research capsule to WebResult
   */
  private capsuleToResults(capsule: ResearchCapsule): WebResult[] {
    return capsule.claims.map(claim => ({
      content: claim.text,
      source: this.findSourceForClaim(claim, capsule.sources),
      relevanceScore: claim.confidence === 'high' ? 0.9 : 0.7,
      fetchedAt: new Date(capsule.fetchedAt).getTime(),
      verification: {
        consensusCount: this.getConsensusCount(claim, capsule),
        sourceTiers: capsule.sources.map(s => s.tier),
      },
    }));
  }
}
```

---

### 6. Vector Search RAG Layer

**File**: `src/layers/vectorRAG.ts`

**Purpose**: Semantic similarity search using embeddings

**Implementation**:
```typescript
export class VectorRAGLayer {
  constructor(
    private vectorDB: VectorDatabase,
    private embeddingEngine: EmbeddingEngine
  ) {}
  
  /**
   * Semantic retrieval using vector similarity
   */
  async retrieve(request: HybridRAGRequest): Promise<VectorResult[]> {
    const { query, userId } = request;
    
    // Generate query embedding
    const queryEmbedding = await this.embeddingEngine.embedQuery(query);
    
    // Vector similarity search
    const results = await this.vectorDB.search({
      userId,
      queryVector: queryEmbedding,
      topK: 10,
      minSimilarity: 0.7,
      filters: this.buildFilters(request),
    });
    
    // Convert to VectorResult
    return results.map(r => ({
      content: r.content,
      source: r.metadata,
      similarity: r.score,
      embeddingId: r.id,
      retrievedAt: Date.now(),
    }));
  }
  
  /**
   * Hybrid search (vector + keyword)
   */
  async hybridSearch(
    request: HybridRAGRequest
  ): Promise<VectorResult[]> {
    const { query, userId } = request;
    
    // Parallel: vector + keyword
    const [vectorResults, keywordResults] = await Promise.all([
      this.retrieve(request),
      this.keywordSearch(query, userId),
    ]);
    
    // Reciprocal Rank Fusion
    return this.rrfFusion(vectorResults, keywordResults);
  }
  
  /**
   * Multi-query expansion
   */
  async expandedSearch(
    originalQuery: string,
    expansions: string[]
  ): Promise<VectorResult[]> {
    // Search with each expansion
    const allResults = await Promise.all(
      expansions.map(exp => this.retrieve({ query: exp }))
    );
    
    // Merge and deduplicate
    return this.mergeAndRank(allResults.flat());
  }
}
```

---

### 7. Graph RAG Layer

**File**: `src/layers/graphRAG.ts`

**Purpose**: Multi-hop reasoning across memory relationships

**Implementation**:
```typescript
export class GraphRAGLayer {
  constructor(
    private graphDB: GraphDatabase,
    private memoryRAG: MemoryRAGLayer
  ) {}
  
  /**
   * Multi-hop reasoning from seed memories
   */
  async retrieve(request: HybridRAGRequest): Promise<GraphResult[]> {
    const { userId, query } = request;
    
    // Step 1: Get seed memories (from Memory RAG or query)
    const seedMemories = await this.getSeedMemories(userId, query);
    
    if (seedMemories.length === 0) return [];
    
    // Step 2: Follow relationships
    const chains = await this.followChains(seedMemories, {
      maxHops: 3,
      relationshipTypes: ['same_topic', 'temporal_sequence', 'contextual'],
      minStrength: 0.5,
    });
    
    // Step 3: Build coherent paths
    const paths = this.buildPaths(chains);
    
    // Step 4: Rank by relevance
    const ranked = await this.rankPaths(paths, query);
    
    return ranked;
  }
  
  /**
   * Follow relationship chains
   */
  private async followChains(
    seedMemories: MemoryResult[],
    options: TraversalOptions
  ): Promise<MemoryChain[]> {
    const chains: MemoryChain[] = [];
    
    for (const seed of seedMemories) {
      const chain = await this.traverseFrom(seed, options);
      chains.push(chain);
    }
    
    return chains;
  }
  
  /**
   * Traverse from a memory following relationships
   */
  private async traverseFrom(
    memory: MemoryResult,
    options: TraversalOptions,
    currentHop: number = 0,
    visited: Set<string> = new Set()
  ): Promise<MemoryChain> {
    if (currentHop >= options.maxHops) {
      return { memories: [memory], relationships: [] };
    }
    
    visited.add(memory.id);
    
    // Get relationships
    const relationships = await this.graphDB.getRelationships(memory.id, {
      types: options.relationshipTypes,
      minStrength: options.minStrength,
    });
    
    // Follow each relationship
    const nextMemories = await Promise.all(
      relationships
        .filter(rel => !visited.has(rel.targetId))
        .map(async rel => {
          const target = await this.memoryRAG.getById(rel.targetId);
          const subChain = await this.traverseFrom(
            target,
            options,
            currentHop + 1,
            new Set(visited)
          );
          return {
            relationship: rel,
            chain: subChain,
          };
        })
    );
    
    // Build chain
    return {
      memories: [memory, ...nextMemories.flatMap(n => n.chain.memories)],
      relationships: [
        ...relationships,
        ...nextMemories.flatMap(n => [n.relationship, ...n.chain.relationships]),
      ],
    };
  }
  
  /**
   * Rank paths by relevance to query
   */
  private async rankPaths(
    paths: MemoryChain[],
    query: string
  ): Promise<GraphResult[]> {
    const queryEmbedding = await this.embeddingEngine.embedQuery(query);
    
    return paths
      .map(path => ({
        path,
        relevance: this.calculatePathRelevance(path, queryEmbedding),
        coherence: this.calculateCoherence(path),
      }))
      .sort((a, b) => {
        // Weighted: relevance (70%) + coherence (30%)
        const scoreA = 0.7 * a.relevance + 0.3 * a.coherence;
        const scoreB = 0.7 * b.relevance + 0.3 * b.coherence;
        return scoreB - scoreA;
      })
      .slice(0, 5)
      .map(r => ({
        memories: r.path.memories,
        relationships: r.path.relationships,
        relevance: r.relevance,
        coherence: r.coherence,
        reasoning: this.generateReasoning(r.path),
      }));
  }
}
```

---

### 8. Verification Layer

**File**: `src/verification/verifier.ts`

**Purpose**: Verifies sources, facts, and citations

**Components**:

#### 8.1 Source Verifier
```typescript
export class SourceVerifier {
  /**
   * Verify source credibility and accessibility
   */
  async verifySource(source: Source): Promise<SourceVerification> {
    // Domain reputation
    const domainReputation = await this.checkDomainReputation(source.host);
    
    // URL accessibility
    const accessibility = await this.checkAccessibility(source.url);
    
    // SSL validity
    const sslValid = await this.checkSSL(source.url);
    
    // Domain age
    const domainAge = await this.getDomainAge(source.host);
    
    return {
      verified: domainReputation.tier <= 2 && accessibility.accessible && sslValid,
      confidence: this.calculateConfidence(domainReputation, accessibility, sslValid),
      domainReputation,
      accessibility,
      sslValid,
      domainAge,
      warnings: this.collectWarnings(domainReputation, accessibility, sslValid),
    };
  }
  
  /**
   * Check domain reputation (uses existing tier system)
   */
  private async checkDomainReputation(host: string): Promise<DomainReputation> {
    // Use existing authority tier logic from research pipeline
    const tier = this.getAuthorityTier(host);
    
    return {
      tier,
      isVerified: tier <= 2,
      category: this.categorizeDomain(host),
    };
  }
}
```

#### 8.2 Fact Checker
```typescript
export class FactChecker {
  /**
   * Cross-check facts across multiple sources
   */
  async crossCheck(
    claim: string,
    sources: Source[]
  ): Promise<FactCheckResult> {
    // Check consensus
    const consensus = this.detectConsensus(claim, sources);
    
    // Check for conflicts
    const conflicts = this.detectConflicts(claim, sources);
    
    // Check independence
    const independence = this.checkSourceIndependence(sources);
    
    return {
      verified: consensus.strength >= 0.7 && conflicts.length === 0,
      consensus,
      conflicts,
      independence,
      confidence: this.calculateConfidence(consensus, conflicts, independence),
      sources: sources.map(s => ({
        source: s,
        supportsClaim: this.sourceSupportsClaim(s, claim),
      })),
    };
  }
  
  /**
   * Detect consensus across sources
   */
  private detectConsensus(
    claim: string,
    sources: Source[]
  ): ConsensusResult {
    // Group sources by whether they support claim
    const supporting = sources.filter(s => this.sourceSupportsClaim(s, claim));
    const opposing = sources.filter(s => !this.sourceSupportsClaim(s, claim));
    
    const supportRatio = supporting.length / sources.length;
    
    return {
      strength: supportRatio,
      supportingCount: supporting.length,
      opposingCount: opposing.length,
      totalSources: sources.length,
      isConsensus: supportRatio >= 0.7,
    };
  }
}
```

#### 8.3 Citation Validator
```typescript
export class CitationValidator {
  /**
   * Validate that source actually supports the claim
   */
  async validateCitation(
    claim: string,
    source: Source
  ): Promise<CitationValidation> {
    // Fetch source content (if available)
    const sourceContent = await this.fetchSourceContent(source);
    
    if (!sourceContent) {
      return {
        valid: false,
        reason: 'source_unavailable',
        confidence: 0,
      };
    }
    
    // Check semantic similarity
    const similarity = await this.checkSemanticSimilarity(
      claim,
      sourceContent
    );
    
    // Check if claim is in context
    const inContext = this.isInContext(claim, sourceContent);
    
    return {
      valid: similarity > 0.7 && inContext,
      similarity,
      inContext,
      confidence: (similarity + (inContext ? 1 : 0)) / 2,
      sourceExcerpt: this.extractRelevantExcerpt(sourceContent, claim),
    };
  }
}
```

#### 8.4 Temporal Validator
```typescript
export class TemporalValidator {
  /**
   * Validate information freshness
   */
  async validateFreshness(
    claim: string,
    date: string,
    topicTTL: TTLClass
  ): Promise<TemporalValidation> {
    const claimDate = new Date(date);
    const now = new Date();
    const age = now.getTime() - claimDate.getTime();
    
    // TTL requirements
    const ttlRequirements = {
      'news/current': 24 * 60 * 60 * 1000, // 24 hours
      'pricing': 7 * 24 * 60 * 60 * 1000, // 7 days
      'releases': 30 * 24 * 60 * 60 * 1000, // 30 days
      'docs': 90 * 24 * 60 * 60 * 1000, // 90 days
      'general': 365 * 24 * 60 * 60 * 1000, // 1 year
    };
    
    const maxAge = ttlRequirements[topicTTL];
    const isFresh = age <= maxAge;
    
    return {
      fresh: isFresh,
      ageDays: age / (24 * 60 * 60 * 1000),
      maxAgeDays: maxAge / (24 * 60 * 60 * 1000),
      confidence: isFresh ? 1.0 : Math.max(0, 1 - (age / maxAge)),
      warning: !isFresh ? `Information is ${Math.floor(ageDays)} days old` : null,
    };
  }
}
```

---

### 9. Synthesis Layer

**File**: `src/synthesis/synthesizer.ts`

**Purpose**: Combines results from all layers into unified response

**Implementation**:
```typescript
export class Synthesizer {
  /**
   * Synthesize results from all layers
   */
  async synthesize(input: SynthesisInput): Promise<HybridRAGResponse> {
    const { memory, web, vector, graph, conflicts, strategy } = input;
    
    // Step 1: Merge all results
    const merged = this.mergeResults(memory, web, vector, graph);
    
    // Step 2: Deduplicate
    const deduplicated = this.deduplicate(merged);
    
    // Step 3: Apply fusion method
    const fused = await this.fuse(deduplicated, strategy.fusionMethod);
    
    // Step 4: Temporal ordering
    const ordered = this.temporalOrder(fused);
    
    // Step 5: Relevance ranking
    const ranked = await this.rankByRelevance(ordered, strategy.originalQuery);
    
    // Step 6: Build final response
    return {
      memories: ranked.memories,
      webResults: ranked.web,
      vectorResults: ranked.vector,
      graphPaths: ranked.graph,
      conflicts,
      confidence: this.calculateOverallConfidence(ranked),
      verification: this.summarizeVerification(ranked),
      synthesis: {
        totalResults: ranked.total,
        layerBreakdown: {
          memory: memory.length,
          web: web.length,
          vector: vector.length,
          graph: graph.length,
        },
        fusionMethod: strategy.fusionMethod,
      },
    };
  }
  
  /**
   * Merge results from all layers
   */
  private mergeResults(
    memory: MemoryResult[],
    web: WebResult[],
    vector: VectorResult[],
    graph: GraphResult[]
  ): MergedResult[] {
    const merged: MergedResult[] = [];
    
    // Add memory results
    merged.push(...memory.map(m => ({
      content: m.content,
      source: { type: 'memory', ...m.source },
      relevance: m.relevanceScore,
      layer: 'memory',
      timestamp: m.createdAt,
    })));
    
    // Add web results
    merged.push(...web.map(w => ({
      content: w.content,
      source: { type: 'web', ...w.source },
      relevance: w.relevanceScore,
      layer: 'web',
      timestamp: w.fetchedAt,
    })));
    
    // Add vector results
    merged.push(...vector.map(v => ({
      content: v.content,
      source: { type: 'vector', ...v.source },
      relevance: v.similarity,
      layer: 'vector',
      timestamp: v.retrievedAt,
    })));
    
    // Add graph results (flatten paths)
    merged.push(...graph.flatMap(g => g.memories.map(m => ({
      content: m.content,
      source: { type: 'graph', path: g.reasoning },
      relevance: g.relevance,
      layer: 'graph',
      timestamp: m.createdAt,
    }))));
    
    return merged;
  }
  
  /**
   * Deduplicate similar results
   */
  private deduplicate(results: MergedResult[]): MergedResult[] {
    const seen = new Set<string>();
    const deduplicated: MergedResult[] = [];
    
    for (const result of results) {
      // Create hash from content (normalized)
      const hash = this.normalizeAndHash(result.content);
      
      if (!seen.has(hash)) {
        seen.add(hash);
        deduplicated.push(result);
      } else {
        // Merge with existing (keep highest relevance)
        const existing = deduplicated.find(r => 
          this.normalizeAndHash(r.content) === hash
        );
        if (existing && result.relevance > existing.relevance) {
          Object.assign(existing, result);
        }
      }
    }
    
    return deduplicated;
  }
  
  /**
   * Apply fusion method
   */
  private async fuse(
    results: MergedResult[],
    method: FusionMethod
  ): Promise<MergedResult[]> {
    switch (method) {
      case 'weighted':
        return this.weightedFusion(results);
      
      case 'memory_priority':
        return this.memoryPriorityFusion(results);
      
      case 'recency_weighted':
        return this.recencyWeightedFusion(results);
      
      case 'semantic_priority':
        return this.semanticPriorityFusion(results);
      
      case 'comprehensive':
        return this.comprehensiveFusion(results);
      
      case 'agentic_synthesis':
        return await this.agenticFusion(results);
      
      default:
        return this.weightedFusion(results);
    }
  }
  
  /**
   * Weighted fusion (default)
   */
  private weightedFusion(results: MergedResult[]): MergedResult[] {
    // Weight by layer and relevance
    const weights = {
      memory: 0.3,
      web: 0.3,
      vector: 0.3,
      graph: 0.1,
    };
    
    return results.map(r => ({
      ...r,
      finalScore: r.relevance * weights[r.layer as keyof typeof weights],
    })).sort((a, b) => b.finalScore - a.finalScore);
  }
  
  /**
   * Agentic fusion (LLM-based synthesis)
   */
  private async agenticFusion(results: MergedResult[]): Promise<MergedResult[]> {
    // Use LLM to synthesize and rank results
    const prompt = this.buildSynthesisPrompt(results);
    const synthesis = await this.llm.synthesize(prompt);
    
    return synthesis.rankedResults;
  }
}
```

---

### 10. Storage Components

#### 10.1 Vector Database (Qdrant)
**File**: `src/storage/vectorStore.ts`

```typescript
export class VectorStore {
  constructor(private qdrant: QdrantClient) {}
  
  /**
   * Search using vector similarity
   */
  async search(options: VectorSearchOptions): Promise<VectorSearchResult[]> {
    const results = await this.qdrant.search(options.collection, {
      vector: options.queryVector,
      limit: options.topK,
      score_threshold: options.minSimilarity,
      filter: this.buildFilter(options.filters),
    });
    
    return results.map(r => ({
      id: r.id,
      content: r.payload.content,
      metadata: r.payload,
      score: r.score,
    }));
  }
  
  /**
   * Upsert embeddings
   */
  async upsert(vectors: VectorPayload[]): Promise<void> {
    await this.qdrant.upsert('memories', {
      points: vectors.map(v => ({
        id: v.id,
        vector: v.embedding,
        payload: v.payload,
      })),
    });
  }
}
```

#### 10.2 Embedding Engine
**File**: `src/storage/embeddingEngine.ts`

```typescript
export class EmbeddingEngine {
  constructor(
    private openai: OpenAI,
    private cache: EmbeddingCache
  ) {}
  
  /**
   * Generate embedding for text
   */
  async embed(text: string): Promise<number[]> {
    // Check cache first
    const cached = await this.cache.get(text);
    if (cached) return cached;
    
    // Generate embedding
    const response = await this.openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
    });
    
    const embedding = response.data[0].embedding;
    
    // Cache it
    await this.cache.set(text, embedding);
    
    return embedding;
  }
  
  /**
   * Batch embedding generation
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    // Check cache for each
    const results: number[][] = [];
    const toGenerate: { text: string; index: number }[] = [];
    
    for (let i = 0; i < texts.length; i++) {
      const cached = await this.cache.get(texts[i]);
      if (cached) {
        results[i] = cached;
      } else {
        toGenerate.push({ text: texts[i], index: i });
      }
    }
    
    // Generate missing embeddings
    if (toGenerate.length > 0) {
      const response = await this.openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: toGenerate.map(t => t.text),
      });
      
      // Store results
      for (let i = 0; i < response.data.length; i++) {
        const embedding = response.data[i].embedding;
        const originalIndex = toGenerate[i].index;
        results[originalIndex] = embedding;
        
        // Cache
        await this.cache.set(toGenerate[i].text, embedding);
      }
    }
    
    return results;
  }
}
```

---

## API Design

### Main Endpoint: POST /v1/rag/hybrid

**Request**:
```typescript
interface HybridRAGRequest {
  userId: string;
  threadId?: string;
  query: string;
  context?: {
    recentMessages?: Message[];
    conversationSummary?: string;
    userPreferences?: Record<string, any>;
  };
  options?: {
    maxResults?: number; // Default: 10
    minConfidence?: number; // Default: 0.7
    enableVerification?: boolean; // Default: true
    enableMemory?: boolean; // Default: true
    enableWebResearch?: boolean; // Default: true
    enableVector?: boolean; // Default: true
    enableGraph?: boolean; // Default: true
    maxHops?: number; // Default: 3
    strategy?: RetrievalStrategy; // Auto-selected if not provided
  };
}
```

**Response**:
```typescript
interface HybridRAGResponse {
  // Results from each layer
  memories: MemoryResult[];
  webResults: WebResult[];
  vectorResults: VectorResult[];
  graphPaths: GraphPath[];
  
  // Synthesis
  synthesis: {
    totalResults: number;
    layerBreakdown: {
      memory: number;
      web: number;
      vector: number;
      graph: number;
    };
    fusionMethod: string;
  };
    
    // Overall confidence
    confidence: number;
    
    // Verification summary
    verification: {
      verifiedCount: number;
      unverifiedCount: number;
      conflictCount: number;
      sourcesVerified: number;
    };
    
    // Conflicts detected
    conflicts: Conflict[];
    
    // Agent reasoning (if enabled)
    agentReasoning?: string;
    
    // Query expansion (if used)
    queryExpansion?: string[];
    
    // Strategy used
    strategy: RetrievalStrategy;
    
    // Metadata
    latency: number;
    layersExecuted: string[];
    cached: boolean;
  };
}
```

---

## Background Workers

### 1. Embedding Generator Worker
**File**: `src/workers/embeddingWorker.ts`

```typescript
export class EmbeddingWorker {
  async process(job: EmbeddingJob): Promise<void> {
    const { memoryId, userId, content } = job;
    
    // Generate embedding
    const embedding = await this.embeddingEngine.embed(content);
    
    // Store in vector DB
    await this.vectorStore.upsert({
      id: memoryId,
      embedding,
      payload: {
        userId,
        content,
        memoryId,
      },
    });
    
    // Update memory record
    await this.memoryService.updateEmbedding(memoryId, {
      embeddingId: memoryId,
      embeddingUpdatedAt: Date.now(),
    });
  }
}
```

### 2. Graph Builder Worker
**File**: `src/workers/graphBuilder.ts`

```typescript
export class GraphBuilder {
  async buildRelationships(userId: string): Promise<void> {
    // Get all memories for user
    const memories = await this.memoryService.getAll(userId);
    
    // Calculate relationships
    for (let i = 0; i < memories.length; i++) {
      for (let j = i + 1; j < memories.length; j++) {
        const relationship = await this.calculateRelationship(
          memories[i],
          memories[j]
        );
        
        if (relationship.strength > 0.5) {
          await this.graphDB.createRelationship({
            sourceId: memories[i].id,
            targetId: memories[j].id,
            type: relationship.type,
            strength: relationship.strength,
          });
        }
      }
    }
  }
  
  private async calculateRelationship(
    mem1: Memory,
    mem2: Memory
  ): Promise<Relationship> {
    // Semantic similarity
    const semantic = await this.calculateSemanticSimilarity(mem1, mem2);
    
    // Temporal proximity
    const temporal = this.calculateTemporalProximity(mem1, mem2);
    
    // Entity overlap
    const entity = this.calculateEntityOverlap(mem1, mem2);
    
    // Determine relationship type
    const type = this.determineRelationshipType(semantic, temporal, entity);
    
    return {
      type,
      strength: (semantic * 0.5 + temporal * 0.3 + entity * 0.2),
    };
  }
}
```

---

## Project Structure

```
sidecar-hybrid-rag/
├── package.json
├── tsconfig.json
├── .env.example
├── Dockerfile
├── docker-compose.yml
├── README.md
│
├── src/
│   ├── index.ts                    # Entry point
│   ├── config.ts                   # Configuration
│   ├── server.ts                   # HTTP server
│   │
│   ├── orchestrator/               # Hybrid orchestration
│   │   ├── hybridOrchestrator.ts    # Main coordinator
│   │   ├── queryAnalyzer.ts        # Query understanding
│   │   ├── strategyPlanner.ts      # Strategy selection
│   │   └── conflictDetector.ts     # Conflict detection
│   │
│   ├── layers/                     # RAG layers
│   │   ├── memoryRAG.ts            # Memory retrieval
│   │   ├── webResearchRAG.ts       # Web research
│   │   ├── vectorRAG.ts            # Vector search
│   │   └── graphRAG.ts             # Graph traversal
│   │
│   ├── verification/               # Verification layer
│   │   ├── verifier.ts             # Main verifier
│   │   ├── sourceVerifier.ts       # Source validation
│   │   ├── factChecker.ts          # Fact cross-checking
│   │   ├── citationValidator.ts   # Citation validation
│   │   └── temporalValidator.ts    # Freshness validation
│   │
│   ├── synthesis/                  # Result synthesis
│   │   ├── synthesizer.ts           # Main synthesizer
│   │   ├── fusionMethods.ts        # Fusion algorithms
│   │   └── ranker.ts               # Relevance ranking
│   │
│   ├── storage/                     # Storage layer
│   │   ├── vectorStore.ts           # Vector DB interface
│   │   ├── embeddingEngine.ts       # Embedding generation
│   │   ├── embeddingCache.ts        # Embedding cache
│   │   ├── queryCache.ts            # Query result cache
│   │   ├── graphDB.ts               # Graph database
│   │   └── adapters/
│   │       ├── qdrantAdapter.ts     # Qdrant implementation
│   │       └── sqliteGraphAdapter.ts # SQLite graph
│   │
│   ├── workers/                     # Background workers
│   │   ├── embeddingWorker.ts       # Embedding generation
│   │   ├── graphBuilder.ts          # Graph building
│   │   └── verificationUpdater.ts  # Verification updates
│   │
│   ├── communication/               # Inter-service communication
│   │   ├── redis.ts                 # Redis pub/sub
│   │   ├── memoryServiceClient.ts   # Memory service client
│   │   ├── researchClient.ts        # Research pipeline client
│   │   └── gatewayClient.ts         # Gateway client
│   │
│   ├── utils/
│   │   ├── logger.ts                # Logging
│   │   ├── metrics.ts               # Metrics
│   │   ├── errors.ts                # Error handling
│   │   └── validation.ts            # Input validation
│   │
│   └── types/
│       ├── requests.ts              # Request types
│       ├── responses.ts              # Response types
│       ├── layers.ts                # Layer types
│       └── verification.ts           # Verification types
│
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
│
└── scripts/
    ├── migrate.ts                   # Database migrations
    ├── backfill-embeddings.ts       # Backfill embeddings
    └── seed.ts                      # Seed test data
```

---

## Implementation Phases

### Phase 1: Agentic + Memory Foundation (Weeks 1-12)

**Goal**: Core agentic RAG with memory integration

**Deliverables**:
1. Hybrid orchestrator (basic)
2. Query analyzer
3. Strategy planner (simplified)
4. Memory RAG layer (semantic + keyword)
5. Vector search layer
6. Graph traversal layer
7. Basic synthesis

**Timeline**: 12 weeks (as per original Agentic RAG plan)

---

### Phase 2: Web Research Integration (Weeks 13-14)

**Goal**: Integrate existing web research pipeline

**Deliverables**:
1. Web Research RAG layer
2. Integration with research sidecar
3. Capsule-to-result conversion
4. Parallel execution with memory/vector

**Timeline**: 2 weeks

---

### Phase 3: Verification Layer (Weeks 15-18)

**Goal**: Add source and fact verification

**Deliverables**:
1. Source verifier (domain reputation, accessibility)
2. Fact checker (consensus detection)
3. Citation validator
4. Temporal validator
5. Integration with all layers
6. Verification metadata

**Timeline**: 4 weeks

---

### Phase 4: Enhanced Orchestration (Weeks 19-20)

**Goal**: Complete hybrid orchestration

**Deliverables**:
1. Full strategy planning (all query types)
2. Conflict detection and resolution
3. Advanced fusion methods
4. Agentic synthesis (LLM-based)
5. Query expansion integration

**Timeline**: 2 weeks

---

### Phase 5: Synthesis & Optimization (Weeks 21-22)

**Goal**: Polish and optimize

**Deliverables**:
1. Advanced synthesis algorithms
2. Performance optimization
3. Caching improvements
4. Error handling
5. Monitoring and metrics
6. Documentation

**Timeline**: 2 weeks

**Total**: 22 weeks (5.5 months)

---

## Integration Points

### 1. Memory Service Integration

**Location**: `apps/memory-service/src/routes.ts`

**Changes**:
```typescript
// In /v1/recall endpoint
app.get('/v1/recall', async (req, reply) => {
  const { userId, threadId, query } = req.query;
  
  // If query provided, use hybrid RAG
  if (query && config.features.hybridRAG) {
    const ragUrl = process.env.HYBRID_RAG_URL || 'http://localhost:3002';
    
    try {
      const response = await fetch(`${ragUrl}/v1/rag/hybrid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          threadId,
          query,
          options: {
            maxResults: 5,
            enableMemory: true,
            enableWebResearch: false, // Only for complex queries
            enableVector: true,
          },
        }),
        signal: AbortSignal.timeout(200),
      });
      
      if (response.ok) {
        const data = await response.json();
        return reply.send({
          memories: data.memories,
          confidence: data.confidence,
        });
      }
    } catch (error) {
      // Fallback to simple recall
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
async trim(threadId: string, messages: Message[], userId?: string) {
  // ... existing code ...
  
  if (userId) {
    const lastUserMessage = messages.filter(m => m.role === 'user').pop();
    
    if (lastUserMessage && config.hybridRAG?.enabled) {
      const isComplexQuery = detectComplexQuery(lastUserMessage.content);
      
      if (isComplexQuery) {
        try {
          const ragResponse = await fetchHybridRAG({
            userId,
            threadId,
            query: lastUserMessage.content,
            context: {
              recentMessages: messages.slice(-5),
              conversationSummary: await getSummary(threadId),
            },
            options: {
              maxResults: 5,
              minConfidence: 0.7,
            },
          });
          
          if (ragResponse.memories.length > 0) {
            const memoryText = formatMemories(ragResponse.memories);
            trimmed.push({
              role: 'system',
              content: `Relevant context:\n${memoryText}`,
            });
          }
          
          // Add web research if available
          if (ragResponse.webResults.length > 0) {
            const webText = formatWebResults(ragResponse.webResults);
            trimmed.push({
              role: 'system',
              content: `Current information:\n${webText}`,
            });
          }
        } catch (error) {
          // Fallback to simple recall
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
        tier: memory.tier,
      },
    }));
    
    // Also trigger graph relationship calculation
    await redis.publish('rag:graph:update', JSON.stringify({
      userId: memory.userId,
      memoryId: memory.id,
    }));
  }
});
```

---

## Configuration

**File**: `src/config.ts`

```typescript
interface HybridRAGConfig {
  // Service URLs
  memoryServiceUrl: string;
  researchPipelineUrl: string;
  
  // Vector Database
  vectorDb: {
    provider: 'qdrant' | 'pgvector';
    url: string;
    collection: string;
    apiKey?: string;
  };
  
  // Redis
  redisUrl: string;
  
  // LLM APIs
  openaiApiKey: string;
  embeddingModel: 'text-embedding-3-small';
  queryExpansionModel: 'gpt-4o-mini';
  
  // Agent Configuration
  agent: {
    maxHops: number; // Default: 3
    minConfidence: number; // Default: 0.7
    enableMultiHop: boolean; // Default: true
    enableQueryExpansion: boolean; // Default: true
    enableSelfCorrection: boolean; // Default: true
  };
  
  // Verification Configuration
  verification: {
    enableSourceVerification: boolean; // Default: true
    enableFactChecking: boolean; // Default: true
    enableCitationValidation: boolean; // Default: false (expensive)
    enableTemporalValidation: boolean; // Default: true
    requireConsensus: number; // Default: 2 sources
  };
  
  // Layer Configuration
  layers: {
    memory: {
      enabled: boolean;
      keywordWeight: number; // 0.4
      semanticWeight: number; // 0.6
    };
    webResearch: {
      enabled: boolean;
      useCachedCapsules: boolean;
      directSearchFallback: boolean;
    };
    vector: {
      enabled: boolean;
      minSimilarity: number; // 0.7
      topK: number; // 10
    };
    graph: {
      enabled: boolean;
      maxHops: number; // 3
      minStrength: number; // 0.5
    };
  };
  
  // Performance
  maxConcurrentRequests: number; // Default: 50
  embeddingBatchSize: number; // Default: 50
  cache: {
    embeddingTTL: number; // Default: 7 days
    queryTTL: number; // Default: 1 hour
  };
  
  // Feature Flags
  features: {
    hybridMode: boolean; // Default: true
    verificationMode: boolean; // Default: true
    agenticSynthesis: boolean; // Default: true
    queryExpansion: boolean; // Default: true
  };
}
```

---

## Performance Considerations

### Latency Budgets

| Operation | Target | Max | Notes |
|-----------|--------|-----|-------|
| Query Analysis | 50ms | 100ms | LLM call |
| Layer Retrieval (parallel) | 150ms | 300ms | All layers in parallel |
| Verification | 100ms | 200ms | Parallel verification |
| Synthesis | 50ms | 100ms | Algorithmic or LLM |
| **Total** | **350ms** | **700ms** | **P95 target** |

### Optimization Strategies

1. **Parallel Execution**: All layers retrieve simultaneously
2. **Caching**: Aggressive caching of embeddings and queries
3. **Early Termination**: Stop if confidence threshold met
4. **Tiered Verification**: Only verify high-priority results
5. **Batch Processing**: Batch embedding generation

---

## Error Handling & Resilience

### Fallback Strategy

```typescript
class HybridRAGOrchestrator {
  async processQuery(request: HybridRAGRequest): Promise<HybridRAGResponse> {
    try {
      // Try full hybrid
      return await this.fullHybrid(request);
    } catch (error) {
      // Fallback 1: Try without verification
      try {
        return await this.hybridWithoutVerification(request);
      } catch (error) {
        // Fallback 2: Try memory-only
        try {
          return await this.memoryOnly(request);
        } catch (error) {
          // Fallback 3: Simple keyword search
          return await this.simpleKeywordSearch(request);
        }
      }
    }
  }
}
```

### Circuit Breakers

- Vector DB: If Qdrant down, fall back to keyword search
- Web Research: If API fails, continue without web results
- Verification: If verification fails, return unverified results with flag
- LLM: If LLM fails, use rule-based fallbacks

---

## Monitoring & Metrics

### Key Metrics

1. **Performance**:
   - Request latency (p50, p95, p99)
   - Layer execution times
   - Cache hit rates
   - Verification times

2. **Quality**:
   - Confidence score distribution
   - Verification success rate
   - Conflict detection rate
   - User satisfaction (if available)

3. **Costs**:
   - LLM API calls (embeddings + reasoning)
   - Vector DB operations
   - Web research API calls
   - Redis operations

4. **System Health**:
   - Error rates by layer
   - Service availability
   - Queue depth
   - Resource usage

---

## Deployment

### Docker Compose

```yaml
version: '3.8'

services:
  hybrid-rag:
    build: ./sidecar-hybrid-rag
    ports:
      - "3002:3002"
    environment:
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - REDIS_URL=redis://redis:6379
      - QDRANT_URL=http://qdrant:6333
      - MEMORY_SERVICE_URL=http://memory-service:3001
      - RESEARCH_PIPELINE_URL=http://memory-service:3001
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

---

## Success Criteria

### Performance
- ✅ P95 latency < 700ms
- ✅ Cache hit rate > 60%
- ✅ Error rate < 1%

### Quality
- ✅ Confidence scores > 0.7 for 80% of queries
- ✅ Verification success rate > 90%
- ✅ Conflict detection accuracy > 85%

### Cost
- ✅ Within budget: $57-95/month for 1000 users
- ✅ Cost per query < $0.0006

### Reliability
- ✅ 99.9% uptime
- ✅ Graceful degradation
- ✅ Zero data loss

---

## Timeline Summary

| Phase | Duration | Key Deliverables |
|-------|----------|------------------|
| Phase 1: Agentic + Memory | 12 weeks | Core agentic, semantic search, graph traversal |
| Phase 2: Web Integration | 2 weeks | Web research layer integration |
| Phase 3: Verification | 4 weeks | Source verification, fact-checking |
| Phase 4: Enhanced Orchestration | 2 weeks | Full hybrid coordination |
| Phase 5: Synthesis & Polish | 2 weeks | Optimization, monitoring, docs |
| **Total** | **22 weeks** | **Complete Hybrid System** |

---

## Next Steps

1. **Review & Approve Blueprint**
2. **Set up Project Structure**
3. **Initialize Vector Database (Qdrant)**
4. **Begin Phase 1 Implementation**

**Status**: Ready for implementation 🚀

