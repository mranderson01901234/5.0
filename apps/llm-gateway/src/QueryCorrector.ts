/**
 * Query Corrector - Auto-corrects typos in user queries
 * Uses fast LLM-based correction for better search results
 */

import { logger } from './log.js';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY?.trim() || '';
const HAIKU_MODEL = 'claude-3-haiku-20240307';
const CORRECTION_TIMEOUT_MS = 2000; // 2 second timeout

interface CorrectionResult {
  corrected: string | null;
  confidence: number;
}

/**
 * Correct typos in query using LLM
 * Returns null if no correction needed or if correction fails
 */
export async function correctQuery(query: string): Promise<string | null> {
  if (!ANTHROPIC_API_KEY) {
    logger.debug('ANTHROPIC_API_KEY not set, skipping query correction');
    return null;
  }

  // Skip correction for very short queries
  if (query.trim().length < 10) {
    return null;
  }

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      signal: AbortSignal.timeout(CORRECTION_TIMEOUT_MS),
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: HAIKU_MODEL,
        max_tokens: 100,
        temperature: 0.3, // Low temperature for consistent correction
        system: 'You are a spelling and grammar correction system. Given a user query, correct any typos or misspellings while preserving the intended meaning. CRITICAL: Do NOT change numbers, dates, or years - these are intentional. For example, "2025", "2024", etc. should remain unchanged. Return ONLY the corrected query, nothing else. If the query is already correct, return it unchanged.',
        messages: [
          {
            role: 'user',
            content: query,
          },
        ],
      }),
    });

    if (!response.ok) {
      logger.debug({ status: response.status }, 'Query correction API error');
      return null;
    }

    const json = await response.json() as any;
    const corrected = json?.content?.[0]?.text?.trim();

    if (!corrected || corrected === query) {
      return null; // No correction or same as original
    }

    logger.debug({ original: query, corrected }, 'Query corrected');
    return corrected;

  } catch (error: any) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      logger.debug('Query correction timed out');
    } else {
      logger.debug({ error: error.message }, 'Query correction failed');
    }
    return null; // Fail gracefully
  }
}

/**
 * Determine if a query likely has typos
 * Heuristic-based pre-filter to avoid unnecessary LLM calls
 */
export function likelyHasTypos(query: string): boolean {
  const trimmed = query.trim();
  
  // Skip very short queries
  if (trimmed.length < 10) {
    return false;
  }

  // Common technical terms that are often misspelled
  const commonMisspellings = [
    /nexjs/i, // Next.js
    /nex\.js/i,
    /react\.js/i, // React
    /angluar/i, // Angular
    /vue\.js/i,
    /nod\.js/i, // Node.js
    /nod\.js/i,
    /python/i,
    /javascript/i,
    /typscript/i, // TypeScript
    /typescirpt/i,
    /docker/i,
    /kubernets/i, // Kubernetes
    /kubernates/i,
    /postgres/i,
    /postgress/i, // PostgreSQL
    /mongodb/i,
    /redis/i,
  ];

  // Check if query matches common misspelling patterns
  if (commonMisspellings.some(pattern => pattern.test(trimmed))) {
    return true;
  }

  // Check for non-dictionary technical terms that might be typos
  // (simple heuristic: words that don't match common tech naming patterns)
  const words = trimmed.split(/\s+/).filter(w => w.length > 2);
  const likelyTypoCount = words.filter(word => {
    // If word doesn't look like a valid tech term, might be a typo
    const looksLikeTypo = 
      word.length > 10 && // Long words
      !/[A-Z]/.test(word) && // No capitals (tech terms often have capitals)
      !word.includes('-') && // No hyphens
      !word.includes('.'); // No dots
    return looksLikeTypo;
  }).length;

  // If 30%+ of words look like typos, likely has typos
  return likelyTypoCount > 0 && (likelyTypoCount / words.length) > 0.3;
}



