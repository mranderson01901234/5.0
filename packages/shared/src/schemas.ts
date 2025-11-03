import { z } from 'zod';

export const ChatStreamRequestSchema = z.object({
  thread_id: z.string().optional(),
  messages: z.array(
    z.object({
      role: z.enum(['user', 'assistant', 'system']),
      content: z.string(),
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

export type ChatStreamRequest = z.infer<typeof ChatStreamRequestSchema>;
export type ChatStreamEvent = z.infer<typeof ChatStreamEventSchema>;
export type TokenEstimateRequest = z.infer<typeof TokenEstimateRequestSchema>;
export type TokenEstimateResponse = z.infer<typeof TokenEstimateResponseSchema>;

