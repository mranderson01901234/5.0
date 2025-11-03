export type Provider = 'openai' | 'anthropic' | 'google';

export interface ProviderRequest {
  messages: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
  }>;
  model: string;
  max_tokens?: number;
  temperature?: number;
}

export interface ProviderStreamEvent {
  type: 'token' | 'done' | 'error';
  content?: string;
  error?: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
}

export interface Metrics {
  ttfb_ms: number;
  tokens_per_sec: number;
  fr_latency_ms?: number;
  trimmed_tokens?: number;
  provider: string;
  model: string;
}

