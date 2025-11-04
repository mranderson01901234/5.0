import { BaseProvider } from './base.js';
import type { ProviderStreamResult } from '../types.js';
import type { Pool } from 'undici';
import { logger } from '../log.js';

interface MessageWithAttachments {
  role: 'user' | 'assistant' | 'system';
  content: string;
  attachments?: Array<{
    id: string;
    filename: string;
    mimeType: string;
    size: number;
    url?: string;
  }>;
}

/**
 * Fetch an image from a URL and convert it to base64
 */
async function fetchImageAsBase64(url: string): Promise<{ data: string; mimeType: string }> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64 = buffer.toString('base64');
    
    // Get content type from response headers or default to image/jpeg
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    
    return { data: base64, mimeType: contentType };
  } catch (error) {
    logger.error({ error, url }, 'Failed to fetch image for vision');
    throw error;
  }
}

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

  async stream(
    messages: Array<MessageWithAttachments>,
    model: string,
    options?: {
      max_tokens?: number;
      temperature?: number;
      enableThinking?: boolean;
      thinkingBudget?: number;
    }
  ): Promise<ProviderStreamResult> {
    const pool = this.pool;
    const apiKey = process.env.GOOGLE_API_KEY || '';
    
    // CRITICAL: Google Gemini API requires system messages to be in systemInstruction field,
    // not in the contents array. Separate system messages from conversation messages.
    const systemMessages = messages.filter(m => m.role === 'system');
    const conversationMessages = messages.filter(m => m.role !== 'system');
    
    // Combine all system messages into a single systemInstruction
    const systemInstruction = systemMessages.length > 0
      ? systemMessages.map(m => m.content).join('\n\n')
      : undefined;
    
    return {
      async *[Symbol.asyncIterator]() {
        // Process conversation messages, including images
        const processedContents = await Promise.all(
          conversationMessages.map(async (m) => {
            const parts: Array<{ text?: string; inline_data?: { mime_type: string; data: string } }> = [];
            
            // Add text content if present
            if (m.content && m.content.trim()) {
              parts.push({ text: m.content });
            }
            
            // Process image attachments
            if (m.attachments && m.attachments.length > 0) {
              for (const attachment of m.attachments) {
                // Only process image attachments
                if (attachment.mimeType.startsWith('image/') && attachment.url) {
                  try {
                    const imageData = await fetchImageAsBase64(attachment.url);
                    parts.push({
                      inline_data: {
                        mime_type: imageData.mimeType,
                        data: imageData.data,
                      },
                    });
                    logger.debug({ 
                      attachmentId: attachment.id, 
                      mimeType: imageData.mimeType,
                      url: attachment.url 
                    }, 'Added image to Gemini request');
                  } catch (error) {
                    logger.error({ 
                      error, 
                      attachmentId: attachment.id,
                      url: attachment.url 
                    }, 'Failed to process image attachment, skipping');
                    // Continue without this image
                  }
                }
              }
            }
            
            // If no parts were added (no text and no images), add empty text
            if (parts.length === 0) {
              parts.push({ text: '' });
            }
            
            return {
              role: m.role === 'assistant' ? 'model' : 'user',
              parts,
            };
          })
        );
        
        // Build request body with proper systemInstruction handling
        const requestBody: any = {
          contents: processedContents,
          generationConfig: {
            maxOutputTokens: options?.max_tokens,
            temperature: options?.temperature,
          },
        };

        // Only include systemInstruction if we have system messages
        if (systemInstruction) {
          requestBody.systemInstruction = {
            parts: [{ text: systemInstruction }],
          };
        }

        // Enable thinking mode for Gemini (experimental feature)
        if (options?.enableThinking) {
          requestBody.thinkingConfig = {
            thinkingMode: 'THINKING_MODE_ENABLED',
            maxThinkingTokens: options.thinkingBudget || 10000
          };
        }
        
        const response = await pool.request({
          path: `/v1beta/models/${model}:streamGenerateContent?key=${apiKey}`,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
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
                  // Check for thinking content (if thinking mode enabled)
                  if (candidate.thinking?.parts) {
                    for (const part of candidate.thinking.parts) {
                      if (part.text) {
                        yieldedAny = true;
                        yield {
                          type: 'thinking_delta',
                          content: part.text
                        };
                      }
                    }
                  }
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
    messages: Array<MessageWithAttachments>,
    _model: string
  ): number {
    const systemPrompt = 4;
    const perMessage = 4;
    const contentTokens = messages.reduce((sum, m) => sum + this.estimateTokens(m.content), 0);
    
    // Add token estimate for images (rough estimate: ~170 tokens per image)
    const imageTokens = messages.reduce((sum, m) => {
      if (m.attachments) {
        const imageCount = m.attachments.filter(a => a.mimeType.startsWith('image/')).length;
        return sum + (imageCount * 170);
      }
      return sum;
    }, 0);
    
    return systemPrompt + messages.length * perMessage + contentTokens + imageTokens;
  }
}
