import { BaseProvider } from './base.js';
import type { ProviderStreamResult } from '../types.js';
import type { MessageWithAttachments } from '../types.js';
import type { Pool } from 'undici';

export class OpenAIProvider extends BaseProvider {
  async prepare(): Promise<void> {
    // DNS and connection warmup
    try {
      await this.pool.request({
        path: '/v1/models',
        method: 'GET',
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
        // Convert messages to OpenAI format (strip attachments for now - OpenAI GPT-4o-mini doesn't support vision)
        const openaiMessages = messages.map((m) => ({
          role: m.role,
          content: m.content,
        }));
        
        const response = await pool.request({
          path: '/v1/chat/completions',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.OPENAI_API_KEY || ''}`,
          },
          body: JSON.stringify({
            model,
            messages: openaiMessages,
            stream: true,
            max_tokens: options?.max_tokens,
            temperature: options?.temperature,
          }),
        });

        if (response.statusCode !== 200) {
          const error = await response.body.text();
          throw new Error(`OpenAI API error: ${error}`);
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
                const content = parsed.choices?.[0]?.delta?.content;
                if (content) {
                  yield content;
                }
              } catch {
                // Ignore parse errors
              }
            }
          }
        }
      },
      meta: {
        provider: 'openai' as const,
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
