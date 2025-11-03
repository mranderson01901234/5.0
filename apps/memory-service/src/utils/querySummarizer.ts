/**
 * Query Summarizer - Extracts concise search queries from long prompts
 * Used to ensure queries fit within Brave API's 400 character limit
 */

// Ensure root .env is loaded
import '../../shared-env-loader.js';

import { pino } from 'pino';

const logger = pino({ name: 'querySummarizer' });

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY?.trim() || '';
const HAIKU_MODEL = 'claude-3-haiku-20240307'; // Haiku 3 (NOT 3.5) as specified
const LLM_TIMEOUT_MS = 5000; // 5 second timeout for summarization

const MAX_QUERY_LENGTH = 400; // Brave API limit
const SYSTEM_PROMPT = `You are a search query extractor. Extract a concise, effective web search query from the user's message.

RULES:
- Extract the core search intent in 1-10 words
- Focus on key terms, entities, and concepts that would help find relevant information
- Remove conversational filler, instructions, and meta-text
- Keep it natural and search-engine friendly
- Maximum ${MAX_QUERY_LENGTH} characters
- Return ONLY the search query, nothing else
- If the message is already a short query (< ${MAX_QUERY_LENGTH} chars), return it as-is`;

/**
 * Summarize/extract a concise search query from a long prompt
 * Returns the original query if it's already short enough, or a summarized version
 */
export async function summarizeQueryForSearch(originalQuery: string): Promise<string> {
  // If query is already short enough, return as-is
  if (originalQuery.length <= MAX_QUERY_LENGTH) {
    return originalQuery.trim();
  }

  if (!ANTHROPIC_API_KEY) {
    logger.warn('ANTHROPIC_API_KEY missing, truncating query instead of summarizing');
    // Fallback: truncate and add ellipsis
    return originalQuery.substring(0, MAX_QUERY_LENGTH - 3) + '...';
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);

    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: HAIKU_MODEL,
        system: SYSTEM_PROMPT,
        messages: [
          { role: 'user', content: originalQuery },
        ],
        temperature: 0.3, // Low temperature for consistent extraction
        max_tokens: 50, // Query should be very short
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      logger.warn({ status: response.status, error: errorText }, 'Query summarization API error, truncating instead');
      return originalQuery.substring(0, MAX_QUERY_LENGTH - 3) + '...';
    }

    const data = await response.json();
    // Anthropic returns content in content[0].text format
    const summarizedQuery = data?.content?.[0]?.text?.trim() || '';

    if (!summarizedQuery) {
      logger.warn('Empty summary returned, truncating instead');
      return originalQuery.substring(0, MAX_QUERY_LENGTH - 3) + '...';
    }

    // Ensure it doesn't exceed limit (safety check)
    const finalQuery = summarizedQuery.length > MAX_QUERY_LENGTH
      ? summarizedQuery.substring(0, MAX_QUERY_LENGTH - 3) + '...'
      : summarizedQuery;

    logger.debug({ 
      originalLength: originalQuery.length, 
      summarizedLength: finalQuery.length 
    }, 'Query summarized');

    return finalQuery;
  } catch (error: any) {
    if (error.name === 'AbortError') {
      logger.warn('Query summarization timed out, truncating instead');
    } else {
      logger.warn({ error: error.message }, 'Query summarization failed, truncating instead');
    }
    // Fallback: truncate
    return originalQuery.substring(0, MAX_QUERY_LENGTH - 3) + '...';
  }
}

