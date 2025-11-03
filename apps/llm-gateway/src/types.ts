export * from '@llm-gateway/shared';
import type { Provider } from '@llm-gateway/shared';

export interface ProviderStreamResult extends AsyncIterable<string> {
  meta?: {
    provider: Provider;
    model: string;
    usage?: {
      input_tokens: number;
      output_tokens: number;
    };
  };
}

export interface IProvider {
  prepare(): Promise<void>;
  stream(
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
    model: string,
    options?: { max_tokens?: number; temperature?: number }
  ): ProviderStreamResult;
  estimate(messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>, model: string): number;
}

export interface Message {
  id: number;
  thread_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: number;
  meta: Record<string, unknown> | null;
  important: number;
  provider: string | null;
  model: string | null;
  tokens_input: number | null;
  tokens_output: number | null;
}

export interface ThreadSummary {
  thread_id: string;
  summary: string;
  updated_at: number;
}

