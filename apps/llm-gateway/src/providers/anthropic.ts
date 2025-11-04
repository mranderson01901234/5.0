import { BaseProvider } from './base.js';
import type { ProviderStreamResult } from '../types.js';
import type { MessageWithAttachments } from '../types.js';
import type { Pool } from 'undici';

export class AnthropicProvider extends BaseProvider {
  async prepare(): Promise<void> {
    // DNS and connection warmup
    try {
      await this.pool.request({
        path: '/v1/messages',
        method: 'OPTIONS',
        headers: { 'User-Agent': 'llm-gateway' },
      });
    } catch {
      // Ignore errors during prepare
    }
  }

  stream(
    messages: Array<MessageWithAttachments>,
    model: string,
    options?: { max_tokens?: number; temperature?: number }
  ): ProviderStreamResult {
    const pool = this.pool;
    return {
      async *[Symbol.asyncIterator]() {
        // Convert messages to Anthropic format (strip attachments for now - Claude Haiku doesn't support vision)
        const systemMessage = messages.find((m) => m.role === 'system');
        const conversationMessages = messages.filter((m) => m.role !== 'system');

        const response = await pool.request({
          path: '/v1/messages',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': process.env.ANTHROPIC_API_KEY || '',
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model,
            messages: conversationMessages.map((m) => ({
              role: m.role === 'assistant' ? 'assistant' : 'user',
              content: m.content,
            })),
            system: systemMessage?.content,
            stream: true,
            max_tokens: options?.max_tokens,
            temperature: options?.temperature,
          }),
        });

        if (response.statusCode !== 200) {
          const error = await response.body.text();
          throw new Error(`Anthropic API error: ${error}`);
        }

        const reader = response.body;
        const decoder = new TextDecoder();
        let buffer = '';

        for await (const chunk of reader) {
          buffer += decoder.decode(chunk, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') {
                return;
              }
              try {
                const parsed = JSON.parse(data);
                if (parsed.type === 'content_block_delta') {
                  const content = parsed.delta?.text;
                  if (content) {
                    yield content;
                  }
                }
              } catch {
                // Ignore parse errors
              }
            }
          }
        }
      },
      meta: {
        provider: 'anthropic' as const,
        model,
      },
    };
  }

  estimate(
    messages: Array<MessageWithAttachments>,
    _model: string
  ): number {
    const systemPrompt = 4;
    const perMessage = 4;
    const contentTokens = messages.reduce((sum, m) => sum + this.estimateTokens(m.content), 0);
    return systemPrompt + messages.length * perMessage + contentTokens;
  }
}
