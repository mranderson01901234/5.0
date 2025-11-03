import { z } from 'zod';

// ============================================================================
// Memory Tier Enum
// ============================================================================

export const MemoryTier = z.enum(['TIER1', 'TIER2', 'TIER3']);

// ============================================================================
// Memory Schemas
// ============================================================================

export const MemorySchema = z.object({
  id: z.string(),
  userId: z.string(),
  threadId: z.string(),
  content: z.string().max(1024),
  entities: z.string().optional().nullable(),
  priority: z.number().min(0).max(1).default(0.5),
  confidence: z.number().min(0).max(1).default(0.5),
  redactionMap: z.string().optional().nullable(),
  tier: MemoryTier.default('TIER3'),
  sourceThreadId: z.string().optional().nullable(),
  repeats: z.number().int().nonnegative().default(1),
  threadSet: z.string().optional().nullable(), // JSON array of thread IDs
  lastSeenTs: z.number().int().positive().optional().nullable(),
  createdAt: z.number().int().positive(),
  updatedAt: z.number().int().positive(),
  deletedAt: z.number().int().positive().optional().nullable(),
});

export const MemoryAuditSchema = z.object({
  id: z.string(),
  userId: z.string(),
  threadId: z.string(),
  startMsgId: z.string().optional().nullable(),
  endMsgId: z.string().optional().nullable(),
  tokenCount: z.number().int().nonnegative(),
  score: z.number(),
  saved: z.number().int().nonnegative(),
  createdAt: z.number().int().positive(),
});

// ============================================================================
// Message Event Schema (from Gateway)
// ============================================================================

export const MessageEventSchema = z.object({
  userId: z.string(),
  threadId: z.string(),
  msgId: z.string(),
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string(),
  tokens: z.object({
    input: z.number().int().nonnegative(),
    output: z.number().int().nonnegative(),
  }),
  timestamp: z.number().int().positive().optional(),
});

// ============================================================================
// API Request/Response Schemas
// ============================================================================

export const ListMemoriesQuerySchema = z.object({
  userId: z.string(),
  threadId: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).default(20),
  offset: z.coerce.number().int().nonnegative().default(0),
  minPriority: z.coerce.number().min(0).max(1).optional(),
  includeDeleted: z.coerce.boolean().default(false),
});

export const PatchMemorySchema = z.object({
  content: z.string().max(1024).optional(),
  priority: z.number().min(0).max(1).optional(),
  deleted: z.boolean().optional(),
});

export const ListMemoriesResponseSchema = z.object({
  memories: z.array(MemorySchema),
  total: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
});

// ============================================================================
// Memory Metrics Schema
// ============================================================================

export const MemoryMetricsSchema = z.object({
  jobs: z.object({
    enqueued: z.number().int().nonnegative(),
    processed: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    avgLatencyMs: z.number().nonnegative(),
    p95LatencyMs: z.number().nonnegative(),
  }),
  memories: z.object({
    total: z.number().int().nonnegative(),
    savedLastHour: z.number().int().nonnegative(),
    deleted: z.number().int().nonnegative(),
    avgPriority: z.number(),
  }),
  audits: z.object({
    total: z.number().int().nonnegative(),
    avgScore: z.number(),
    savesPerAudit: z.number(),
  }),
  rejections: z.object({
    belowThreshold: z.number().int().nonnegative(),
    redactedAll: z.number().int().nonnegative(),
    tooLong: z.number().int().nonnegative(),
    rateLimited: z.number().int().nonnegative(),
  }),
  health: z.object({
    dbSizeMb: z.number().nonnegative(),
    queueDepth: z.number().int().nonnegative(),
    lastAuditMsAgo: z.number().int().nonnegative(),
  }),
});

// ============================================================================
// User Profile Schemas
// ============================================================================

export const UserProfileSchema = z.object({
  userId: z.string(),
  lastUpdated: z.number().int().positive(),
  
  // Learning from memories
  techStack: z.array(z.string()).default([]),           // ["TypeScript", "React", "FastAPI"]
  domainsOfInterest: z.array(z.string()).default([]),   // ["web-dev", "ai-ml", "backend-systems"]
  expertiseLevel: z.enum(['beginner', 'intermediate', 'expert']).optional(),
  communicationStyle: z.enum(['concise', 'balanced', 'detailed']).optional(),
  
  // Behavioral patterns
  preferredComplexity: z.enum(['simple', 'moderate', 'complex']).optional(),
  avgQuestionsPerSession: z.number().default(0),
  topicsPerWeek: z.array(z.string()).default([]),
  
  // Search preferences (from web search history)
  trustedDomains: z.record(z.string(), z.number()).default({}), // domain -> confidence score
  dislikedFormats: z.array(z.string()).default([]), // e.g., ["video", "long-form"]
});

export const UserComplexityProfileSchema = z.object({
  userId: z.string(),
  lastUpdated: z.number().int().positive(),
  
  // Track what user actually engages with
  preferredLength: z.enum(['brief', 'moderate', 'detailed']).optional(),
  preferredFormat: z.enum(['list', 'paragraph', 'mixed']).optional(),
  
  // Topic-specific complexity preferences
  topicComplexity: z.record(z.string(), z.enum(['simple', 'moderate', 'complex'])).default({}),
  
  // Engagement signals
  followUpFrequency: z.number().default(0),  // How often does user ask follow-ups?
  deepDiveTopics: z.array(z.string()).default([]), // Topics where user always wants more detail
});

// ============================================================================
// Exported Types
// ============================================================================

export type Memory = z.infer<typeof MemorySchema>;
export type MemoryAudit = z.infer<typeof MemoryAuditSchema>;
export type MessageEvent = z.infer<typeof MessageEventSchema>;
export type ListMemoriesQuery = z.infer<typeof ListMemoriesQuerySchema>;
export type PatchMemory = z.infer<typeof PatchMemorySchema>;
export type ListMemoriesResponse = z.infer<typeof ListMemoriesResponseSchema>;
export type MemoryMetrics = z.infer<typeof MemoryMetricsSchema>;
export type UserProfile = z.infer<typeof UserProfileSchema>;
export type UserComplexityProfile = z.infer<typeof UserComplexityProfileSchema>;
