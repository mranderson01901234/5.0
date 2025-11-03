import { BaseProvider } from './base.js';
import type { ProviderStreamResult } from '../types.js';
import type { Pool } from 'undici';

export class GoogleProvider extends BaseProvider {
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
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
    model: string,
    options?: { max_tokens?: number; temperature?: number }
  ): ProviderStreamResult {
    const pool = this.pool;
    const apiKey = process.env.GOOGLE_API_KEY || '';
    return {
      async *[Symbol.asyncIterator]() {
        const response = await pool.request({
          path: `/v1beta/models/${model}:streamGenerateContent?key=${apiKey}`,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: messages.map((m) => ({
              role: m.role === 'assistant' ? 'model' : 'user',
              parts: [{ text: m.content }],
            })),
            generationConfig: {
              maxOutputTokens: options?.max_tokens,
              temperature: options?.temperature,
            },
          }),
        });

        if (response.statusCode !== 200) {
          const error = await response.body.text();
          throw new Error(`Google API error: ${error}`);
        }

        const reader = response.body;
        const decoder = new TextDecoder();
        let buffer = '';
        let yieldedAny = false;
        let rawResponses: string[] = [];

        for await (const chunk of reader) {
          buffer += decoder.decode(chunk, { stream: true });
          
          // Google's streaming format: each JSON object is separated by newlines
          // Process all complete lines in the buffer
          while (buffer.includes('\n')) {
            const newlineIdx = buffer.indexOf('\n');
            const line = buffer.slice(0, newlineIdx).trim();
            buffer = buffer.slice(newlineIdx + 1);
            
            if (!line || line === '[DONE]') continue;
            
            // Google sends lines starting with "data: " in some formats, or raw JSON
            const jsonLine = line.startsWith('data: ') ? line.slice(6).trim() : line;
            
            try {
              const parsed = JSON.parse(jsonLine);
              rawResponses.push(JSON.stringify(parsed).substring(0, 100));
              
              // Handle different Google API response formats
              // Format 1: candidates array with content.parts
              if (parsed.candidates && Array.isArray(parsed.candidates)) {
                for (const candidate of parsed.candidates) {
                  // Check content.parts (complete response)
                  if (candidate.content?.parts) {
                    for (const part of candidate.content.parts) {
                      if (part.text) {
                        yieldedAny = true;
                        yield part.text;
                      }
                    }
                  }
                  // Check delta (streaming updates)
                  if (candidate.delta?.content?.parts) {
                    for (const part of candidate.delta.content.parts) {
                      if (part.text) {
                        yieldedAny = true;
                        yield part.text;
                      }
                    }
                  }
                }
              }
              
              // Format 2: Direct candidate at root level
              if (parsed.candidate?.content?.parts) {
                for (const part of parsed.candidate.content.parts) {
                  if (part.text) {
                    yieldedAny = true;
                    yield part.text;
                  }
                }
              }
            } catch (parseErr) {
              // Log for debugging if it looks like JSON but failed to parse
              if (jsonLine.startsWith('{') || jsonLine.startsWith('[')) {
                console.debug('Google API parse error for line:', jsonLine.substring(0, 200));
              }
            }
          }
        }
        
        // If we have remaining buffer, try to parse it (final chunk)
        if (buffer.trim()) {
          try {
            const jsonLine = buffer.trim().startsWith('data: ') ? buffer.trim().slice(6).trim() : buffer.trim();
            const parsed = JSON.parse(jsonLine);
            if (parsed.candidates) {
              for (const candidate of parsed.candidates) {
                if (candidate.content?.parts) {
                  for (const part of candidate.content.parts) {
                    if (part.text) {
                      yieldedAny = true;
                      yield part.text;
                    }
                  }
                }
              }
            }
          } catch {
            // Ignore final parse errors
          }
        }
        
        if (!yieldedAny) {
          console.error('Google API response samples:', rawResponses.slice(0, 3));
          throw new Error(`Google API returned no tokens. Response format may have changed. Samples: ${rawResponses.slice(0, 2).join(', ')}`);
        }
      },
      meta: {
        provider: 'google' as const,
        model,
      },
    };
  }

  estimate(
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
    _model: string
  ): number {
    const systemPrompt = 4;
    const perMessage = 4;
    const contentTokens = messages.reduce((sum, m) => sum + this.estimateTokens(m.content), 0);
    return systemPrompt + messages.length * perMessage + contentTokens;
  }
}
