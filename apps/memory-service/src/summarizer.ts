/**
 * Conversation summarization using OpenAI
 * Background job that runs during audits
 */

import { pino } from 'pino';

const logger = pino({ name: 'summarizer' });

/**
 * Generate a conversation summary using OpenAI
 * Returns first 200 chars of first user message if API unavailable
 */
export async function generateSummary(messages: Array<{ content: string; role: string }>): Promise<string> {
  const openaiKey = process.env.OPENAI_API_KEY;
  
  if (!openaiKey) {
    logger.debug('No OPENAI_API_KEY, using fallback summary');
    return getFallbackSummary(messages);
  }

  try {
    // Use gpt-4o-mini for cheap, fast summaries
    const model = 'gpt-4o-mini';
    const maxTokens = 100; // Short summary
    
    // Prepare messages for OpenAI (limit context to avoid cost)
    const recentMessages = messages.slice(-20); // Last 20 messages max
    const formattedMessages = recentMessages.map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content.substring(0, 1000) // Limit each message to 1000 chars
    }));

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: 'Summarize this conversation in 1-2 sentences. Focus on the main topic and key points discussed. Be concise.'
          },
          ...formattedMessages
        ],
        max_tokens: maxTokens,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      logger.warn({ status: response.status, error }, 'OpenAI summarization failed');
      return getFallbackSummary(messages);
    }

    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const summary = data.choices?.[0]?.message?.content?.trim();
    
    if (!summary) {
      logger.warn('No summary in OpenAI response');
      return getFallbackSummary(messages);
    }

    // Cap at 200 chars for cache/storage
    return summary.substring(0, 200);

  } catch (error: any) {
    logger.warn({ error: error.message }, 'Summarization error, using fallback');
    return getFallbackSummary(messages);
  }
}

/**
 * Fallback: Use first user message as summary
 */
function getFallbackSummary(messages: Array<{ content: string; role: string }>): string {
  const firstUserMsg = messages.find(m => m.role === 'user');
  if (firstUserMsg) {
    return firstUserMsg.content.substring(0, 200);
  }
  return 'Conversation';
}

