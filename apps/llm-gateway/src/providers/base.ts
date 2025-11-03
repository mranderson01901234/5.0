import type { Pool } from 'undici';
import type { IProvider, ProviderStreamResult } from '../types.js';

export abstract class BaseProvider implements IProvider {
  protected pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  abstract prepare(): Promise<void>;
  abstract stream(
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
    model: string,
    options?: { max_tokens?: number; temperature?: number }
  ): ProviderStreamResult;
  abstract estimate(
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
    model: string
  ): number;

  protected estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
}

