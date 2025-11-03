/**
 * Request Types for Hybrid RAG API
 */

export interface HybridRAGRequest {
  userId: string;
  threadId?: string;
  query: string;
  context?: {
    recentMessages?: Array<{
      role: string;
      content: string;
    }>;
    conversationSummary?: string;
    userPreferences?: Record<string, any>;
  };
  options?: {
    maxResults?: number;
    minConfidence?: number;
    enableVerification?: boolean;
    enableMemory?: boolean;
    enableWebResearch?: boolean;
    enableVector?: boolean;
    enableGraph?: boolean;
    maxHops?: number;
  };
}

export interface RAGRequest {
  userId: string;
  threadId?: string;
  query: string;
  context?: Record<string, any>;
  options?: Record<string, any>;
}

