/**
 * Response Types for Hybrid RAG API
 */

export interface HybridRAGResponse {
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
  strategy: string;

  // Metadata
  latency: number;
  layersExecuted: string[];
  cached: boolean;
}

export interface MemoryResult {
  id: string;
  content: string;
  relevanceScore: number;
  createdAt: number;
  source: {
    userId: string;
    threadId: string;
    priority: number;
    tier: string;
  };
}

export interface WebResult {
  content: string;
  source: {
    url: string;
    host: string;
    date?: string;
    tier: string;
  };
  relevanceScore: number;
  fetchedAt: number;
}

export interface VectorResult {
  content: string;
  source: Record<string, any>;
  similarity: number;
  embeddingId: string;
  retrievedAt: number;
}

export interface GraphPath {
  memories: MemoryResult[];
  relationships: Relationship[];
  relevance: number;
  coherence: number;
  reasoning: string;
}

export interface Relationship {
  from: string;
  to: string;
  type: string;
  strength: number;
}

export interface Conflict {
  type: string;
  left: any;
  right: any;
  severity: 'low' | 'medium' | 'high';
  resolution?: string;
}

