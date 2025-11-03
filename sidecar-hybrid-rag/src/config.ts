/**
 * Hybrid RAG Configuration
 */

export interface HybridRAGConfig {
  // Service
  port: number;
  nodeEnv: string;

  // OpenAI API
  openaiApiKey: string;
  embeddingModel: string;
  queryExpansionModel: string;

  // Vector Database
  vectorDb: {
    provider: 'qdrant';
    url: string;
    apiKey?: string;
    collection: string;
  };

  // Redis
  redisUrl: string;

  // Memory Service
  memoryServiceUrl: string;

  // Agent Configuration
  agent: {
    maxHops: number;
    minConfidence: number;
    enableMultiHop: boolean;
    enableQueryExpansion: boolean;
  };

  // Performance
  maxConcurrentRequests: number;
  embeddingBatchSize: number;

  // Cache Configuration
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

export function loadConfig(): HybridRAGConfig {
  return {
    port: parseInt(process.env.HYBRID_RAG_PORT || process.env.PORT || '3002', 10),
    nodeEnv: process.env.NODE_ENV || 'development',

    openaiApiKey: process.env.OPENAI_API_KEY || '',
    embeddingModel: process.env.EMBEDDING_MODEL || 'text-embedding-3-small',
    queryExpansionModel: process.env.QUERY_EXPANSION_MODEL || 'gpt-4o-mini',

    vectorDb: {
      provider: 'qdrant',
      url: process.env.QDRANT_URL || 'http://localhost:6333',
      apiKey: process.env.QDRANT_API_KEY,
      collection: process.env.QDRANT_WORLD_KNOWLEDGE_COLLECTION || 'world_knowledge',
    },

    redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',

    memoryServiceUrl: process.env.MEMORY_SERVICE_URL || 'http://localhost:3001',

    agent: {
      maxHops: parseInt(process.env.AGENT_MAX_HOPS || '3', 10),
      minConfidence: parseFloat(process.env.AGENT_MIN_CONFIDENCE || '0.7'),
      enableMultiHop: process.env.AGENT_ENABLE_MULTI_HOP === 'true',
      enableQueryExpansion: process.env.AGENT_ENABLE_QUERY_EXPANSION === 'true',
    },

    maxConcurrentRequests: parseInt(process.env.MAX_CONCURRENT_REQUESTS || '50', 10),
    embeddingBatchSize: parseInt(process.env.EMBEDDING_BATCH_SIZE || '50', 10),

    cache: {
      embeddingTTL: parseInt(process.env.EMBEDDING_CACHE_TTL_SECONDS || '604800', 10),
      queryTTL: parseInt(process.env.QUERY_CACHE_TTL_SECONDS || '3600', 10),
    },

    features: {
      multiHop: process.env.FEATURE_MULTI_HOP !== 'false',
      queryExpansion: process.env.FEATURE_QUERY_EXPANSION !== 'false',
      temporalRetrieval: process.env.FEATURE_TEMPORAL_RETRIEVAL !== 'false',
      graphRelationships: process.env.FEATURE_GRAPH_RELATIONSHIPS !== 'false',
    },
  };
}

