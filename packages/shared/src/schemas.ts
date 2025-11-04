import { z } from 'zod';

const AttachmentSchema = z.object({
  id: z.string(),
  filename: z.string(),
  mimeType: z.string(),
  size: z.number(),
  url: z.string().optional(),
});

export const ChatStreamRequestSchema = z.object({
  thread_id: z.string().optional(),
  messages: z.array(
    z.object({
      role: z.enum(['user', 'assistant', 'system']),
      content: z.string(),
      attachments: z.array(AttachmentSchema).optional(),
    })
  ),
  model: z.string().optional(),
  provider: z.enum(['openai', 'anthropic', 'google']).optional(),
  max_tokens: z.number().optional(),
  temperature: z.number().optional(),
});

export const ChatStreamEventSchema = z.object({
  event: z.enum(['heartbeat', 'token', 'done', 'error', 'slow_start', 'preface']),
  data: z.string().optional(),
  meta: z
    .object({
      provider: z.string().optional(),
      model: z.string().optional(),
      ttfb_ms: z.number().optional(),
      tokens_per_sec: z.number().optional(),
      fr_latency_ms: z.number().optional(),
      trimmed_tokens: z.number().optional(),
    })
    .optional(),
});

export const TokenEstimateRequestSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(['user', 'assistant', 'system']),
      content: z.string(),
      attachments: z.array(AttachmentSchema).optional(),
    })
  ),
  provider: z.enum(['openai', 'anthropic', 'google']).optional(),
  model: z.string().optional(),
});

export const TokenEstimateResponseSchema = z.object({
  estimated_tokens: z.number(),
  provider: z.string().optional(),
  model: z.string().optional(),
});

export const GatekeeperRequestSchema = z.object({
  userText: z.string().min(1),
  conversationSummary: z.string().optional(),
  threadId: z.string(),
  userId: z.string(),
});

export const GatekeeperResponseSchema = z.object({
  shouldCreate: z.boolean(),
  type: z.enum(['table', 'doc', 'sheet', 'image']).nullable(),
  rationale: z.string(),
  confidence: z.number().min(0).max(1),
});

export const ArtifactCreateRequestSchema = z.object({
  threadId: z.string(),
  type: z.enum(['table', 'doc', 'sheet', 'image']),
  data: z.unknown(), // JSON data (can be string[][] for table, etc.)
  metadata: z.record(z.unknown()).optional(),
});

export const ArtifactResponseSchema = z.object({
  id: z.string(),
  threadId: z.string(),
  type: z.enum(['table', 'doc', 'sheet', 'image']),
  data: z.unknown(),
  metadata: z.record(z.unknown()).optional(),
  createdAt: z.number(),
});

export const ArtifactsListResponseSchema = z.object({
  artifacts: z.array(ArtifactResponseSchema),
});

export const ArtifactExportRequestSchema = z.object({
  artifactId: z.string().min(1),
  format: z.enum(['pdf', 'docx', 'xlsx']),
});

export const ArtifactExportResponseSchema = z.object({
  id: z.string(),
  artifactId: z.string(),
  format: z.enum(['pdf', 'docx', 'xlsx']),
  url: z.string(),
  status: z.enum(['queued', 'processing', 'completed', 'failed']),
  createdAt: z.number(),
});

export type Attachment = z.infer<typeof AttachmentSchema>;
export type ChatStreamRequest = z.infer<typeof ChatStreamRequestSchema>;
export type ChatStreamEvent = z.infer<typeof ChatStreamEventSchema>;
export type TokenEstimateRequest = z.infer<typeof TokenEstimateRequestSchema>;
export type TokenEstimateResponse = z.infer<typeof TokenEstimateResponseSchema>;
export type GatekeeperRequest = z.infer<typeof GatekeeperRequestSchema>;
export type GatekeeperResponse = z.infer<typeof GatekeeperResponseSchema>;
export type ArtifactCreateRequest = z.infer<typeof ArtifactCreateRequestSchema>;
export type ArtifactResponse = z.infer<typeof ArtifactResponseSchema>;
export type ArtifactsListResponse = z.infer<typeof ArtifactsListResponseSchema>;
export type ArtifactExportRequest = z.infer<typeof ArtifactExportRequestSchema>;
export type ArtifactExportResponse = z.infer<typeof ArtifactExportResponseSchema>;
// Aliases for internal use (matches TRIGGER_SPEC.md naming)
export type GatekeeperInput = GatekeeperRequest;
export type GatekeeperOutput = GatekeeperResponse;

