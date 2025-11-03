/**
 * LLM Composer - Transforms search results into natural, conversational responses
 *
 * Features:
 * - Smart scoring (recency, authority, content quality)
 * - Deduplication
 * - Timeout protection
 * - Word count enforcement
 * - Formatted output (paragraphs, lists) with minimal sources line
 */

// Ensure root .env is loaded
import '../../shared-env-loader.js';

import { pino } from 'pino';
import { cleanHtml } from './utils/htmlCleaner.js';

const logger = pino({ name: 'searchComposer' });

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY?.trim() || '';
const HAIKU_MODEL = 'claude-3-haiku-20240307'; // Haiku 3 (NOT 3.5) as specified
const HAIKU_MAX_TOKENS = 3500; // Haiku 3 max is 4096, use 3500 for safety margin (~2500 words)
const LLM_TIMEOUT_MS = 8000; // 8 second timeout

const SYSTEM_PROMPT = `You are a knowledgeable conversational partner providing current information from web search results.

TONE & STYLE:
- Write in natural, flowing prose as if explaining to a friend
- Be clear and engaging—no robotic formatting or rigid structures
- Integrate dates naturally within sentences (e.g., "Researchers found in November 2024..." not "MAIN TOPIC\n[content] (Nov 2024)")
- Present information confidently without meta-commentary
- Use paragraphs with natural flow, not headers or structured sections
- NO "MAIN TOPIC" or "SECONDARY POINT" headers
- NO numbered lists unless the query explicitly asks for a list
- Write as one cohesive response that reads like a thoughtful explanation

CRITICAL REQUIREMENTS - FAILURE TO FOLLOW THESE WILL PROVIDE INCORRECT INFORMATION:
- ONLY use information explicitly stated in the search results provided
- DO NOT add details from your training data or general knowledge
- DO NOT make assumptions or infer information not in the results
- If search results don't fully answer the question, acknowledge that naturally
- Include actual dates from search results as part of natural prose, not as appended metadata
- Synthesize multiple sources into a cohesive explanation, not a bullet list
- Write as comprehensively as needed to fully answer the question (can be several paragraphs for complex topics)
- Be thorough but concise - avoid unnecessary repetition
- NO meta-commentary ("Here's the recap", "I found this")
- NO apologetic language about knowledge cutoffs
- NO markers like [web], [news], [article] - clean text only
- Write ONLY ONE cohesive response that flows naturally`;

export interface SearchItem {
  title: string;
  snippet: string;
  host: string;
  date?: string;
}

// ----------------------- Utilities -----------------------

/**
 * Parse date string to timestamp (supports various formats including relative like "14 hours ago")
 */
function parseDate(dateStr?: string): number | null {
  if (!dateStr) return null;

  // Try standard date parsing first
  const parsed = Date.parse(dateStr);
  if (!Number.isNaN(parsed)) return parsed;

  // Parse relative formats from Brave: "X hours/days/weeks ago"
  const relativeMatch = dateStr.match(/(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago/i);
  if (relativeMatch) {
    const amount = parseInt(relativeMatch[1]);
    const unit = relativeMatch[2].toLowerCase();

    const multipliers: Record<string, number> = {
      second: 1000,
      minute: 60 * 1000,
      hour: 60 * 60 * 1000,
      day: 24 * 60 * 60 * 1000,
      week: 7 * 24 * 60 * 60 * 1000,
      month: 30 * 24 * 60 * 60 * 1000,
      year: 365 * 24 * 60 * 60 * 1000,
    };

    const multiplier = multipliers[unit];
    if (multiplier) {
      return Date.now() - (amount * multiplier);
    }
  }

  return null;
}

/**
 * Calculate recency score (0-1) based on date
 * Linear decay over specified hours, with penalties for very old content
 */
function recencyScore(dateStr?: string, hours = 168): number {
  const timestamp = parseDate(dateStr);
  if (!timestamp) return 0.2; // low score if unknown date

  const ageHours = (Date.now() - timestamp) / 3_600_000;
  const ageDays = ageHours / 24;

  // Heavily penalize content older than 1 year
  if (ageDays > 365) return 0.05;

  // Penalize content older than 3 months
  if (ageDays > 90) return 0.15;

  // Normal decay for recent content (within specified hours)
  const score = Math.max(0, 1 - ageHours / hours);
  return score;
}

/**
 * Calculate authority score based on host domain
 * Tier-based scoring: Tier 1 = 1.0, Tier 2 = 0.7, Others = 0.4
 */
function authorityScore(host: string): number {
  // Tier 1: Highly authoritative sources
  const tier1 = /(^|\.)((reuters|apnews|bbc|ft|wsj|bloomberg|nytimes|theguardian|nature|science|arxiv|nasa|who|nih|ecdc|ec\.europa|docs\.google|openai|google|meta|microsoft|nvidia|github|aws|azure)\.com)$/i;
  if (tier1.test(host)) return 1.0;
  // Tier 2: Reputable tech/news sources
  const tier2 = /(^|\.)((theverge|techcrunch|wired|engadget|zdnet|infoq|anandtech|semianalysis|financialpost|investors|seekingalpha)\.com)$/i;
  if (tier2.test(host)) return 0.7;
  return 0.4; // Default for other sources
}

/**
 * Calculate content quality score based on snippet/title presence
 */
function contentScore(item: SearchItem): number {
  const hasSnippet = item.snippet && item.snippet.length > 20;
  const hasTitle = item.title && item.title.length > 5;
  if (hasSnippet && hasTitle) return 1.0;
  if (hasSnippet || hasTitle) return 0.8;
  return 0.5;
}

/**
 * Score an item using weighted formula: recency (45%) + authority (35%) + content (20%)
 */
function scoreItem(item: SearchItem): number {
  const rec = recencyScore(item.date, 48);
  const auth = authorityScore(item.host);
  const content = contentScore(item);
  return 0.45 * rec + 0.35 * auth + 0.20 * content;
}

/**
 * Deduplicate items by host + normalized title/snippet
 */
function dedupeItems(items: SearchItem[]): SearchItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    // Create key from host + normalized first 96 chars of title or snippet
    const text = cleanHtml(item.title ?? item.snippet ?? '').toLowerCase().slice(0, 96);
    const key = `${item.host}|${text}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Select top k items using scoring and deduplication
 */
function selectTopItems(items: SearchItem[], k = 3): SearchItem[] {
  return dedupeItems(items)
    .sort((a, b) => scoreItem(b) - scoreItem(a))
    .slice(0, k);
}

/**
 * Build sources line from selected items
 */
function buildSourcesLine(items: SearchItem[]): string {
  const unique = new Map<string, string | undefined>();
  for (const item of items) {
    if (!unique.has(item.host)) {
      unique.set(item.host, item.date);
    }
  }
  const parts = Array.from(unique.entries()).map(([host, date]) => (date ? `${host} • ${date}` : host));
  return `Sources ▸ ${parts.join(', ')}`;
}

/**
 * Build structured sources data for frontend dropdown
 * Returns all items with their full article URLs (no deduplication by host)
 */
/**
 * Normalize URL to ensure it has protocol and is valid
 */
function normalizeUrl(url: string | undefined, host: string): string | undefined {
  if (!url) return undefined;
  
  // If URL already has protocol, return as-is
  if (/^https?:\/\//i.test(url)) {
    return url;
  }
  
  // If URL starts with //, add https:
  if (url.startsWith('//')) {
    return `https:${url}`;
  }
  
  // If URL is relative (starts with /), prepend https:// + host
  if (url.startsWith('/')) {
    return `https://${host}${url}`;
  }
  
  // If URL looks like a domain, add https://
  if (/^[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]*\.[a-zA-Z]{2,}/.test(url)) {
    return `https://${url}`;
  }
  
  // Otherwise, assume it's a full URL missing protocol
  return `https://${url}`;
}

function buildSourcesData(items: SearchItem[]): Array<{ title: string; host: string; url?: string; date?: string }> {
  // Don't deduplicate - keep all articles with their specific URLs
  return items.map(item => {
    // Normalize URL to ensure it's complete and valid
    // item.url is required in SearchItem interface, but may be empty string
    const url = item.url && item.url.trim() ? item.url.trim() : undefined;
    const normalizedUrl = normalizeUrl(url, item.host);
    
    return {
      title: item.title || item.host,
      host: item.host,
      url: normalizedUrl, // Preserve full URL including path and fragments (#anchors, query params, etc.)
      date: item.date,
    };
  });
}

// ----------------------- LLM Call -----------------------

/**
 * Call Haiku 3 (Anthropic) API with streaming support
 */
async function* streamLLM(system: string, user: string): AsyncGenerator<string, void, unknown> {
  if (!ANTHROPIC_API_KEY) {
    logger.warn('ANTHROPIC_API_KEY missing in streamLLM');
    throw new Error('ANTHROPIC_API_KEY missing');
  }

  const body = {
    model: HAIKU_MODEL,
    temperature: 0.5,
    max_tokens: HAIKU_MAX_TOKENS,
    system,
    messages: [
      {
        role: 'user',
        content: user,
      },
    ],
    stream: true, // Enable streaming
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`Haiku 3 API ${response.status} ${errorText.slice(0, 200)}`);
    }

    if (!response.body) {
      throw new Error('No response body from Haiku 3');
    }

    // Parse Server-Sent Events (SSE) stream
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();

          // Skip [DONE] message
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);

            // Anthropic SSE format: {"type":"content_block_delta","delta":{"type":"text_delta","text":"token"}}
            if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
              yield parsed.delta.text;
            }
          } catch (e) {
            // Skip invalid JSON
            continue;
          }
        }
      }
    }
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Non-streaming fallback - collects all tokens into a single string
 */
async function callLLM(system: string, user: string): Promise<string> {
  let fullText = '';
  for await (const token of streamLLM(system, user)) {
    fullText += token;
  }
  return fullText;
}

// ----------------------- Public API -----------------------

/**
 * Compose natural language response from search results using LLM
 *
 * Features:
 * - Smart item selection via scoring
 * - Deduplication
 * - Timeout protection
 * - Word count enforcement (≤120 words)
 * - Plain text output with minimal sources line
 */
export async function composeSearchResponse(
  userQuery: string,
  items: SearchItem[],
  conversationContext?: Array<{ role: string; content: string }>
): Promise<{ summary: string; sources: Array<{ title: string; host: string; url?: string; date?: string }> }> {
  // Empty items handling
  if (items.length === 0) {
    return { summary: "Hmm, I couldn't find much on that. Want to try rephrasing?", sources: [] };
  }

  // Check if query is asking for "latest" or recent info
  const queryLower = userQuery.toLowerCase();
  const isLookingForRecent = /\b(latest|recent|newest|current|today|this week|just|breaking|now)\b/i.test(queryLower);

  // Select top items using scoring
  const topItems = selectTopItems(items, 3);

  // If user wants recent info, check if results are actually recent
  if (isLookingForRecent && topItems.length > 0) {
    const now = Date.now();
    const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);

    // Check if any result is from the last 30 days
    const hasRecentResults = topItems.some(item => {
      if (!item.date) return false;
      const timestamp = parseDate(item.date);
      return timestamp && timestamp > thirtyDaysAgo;
    });

    // If no recent results, inform the user
    if (!hasRecentResults) {
      const oldestDate = topItems
        .map(item => item.date)
        .filter(Boolean)
        .sort()
        .reverse()[0];

      return {
        summary: `I couldn't find any recent news on this topic. The most recent information I found is from ${oldestDate || 'over a month ago'}. This might mean there haven't been new developments, or they're not widely covered yet. Would you like me to share what I found, or try a different search?`,
        sources: buildSourcesData(topItems)
      };
    }
  }

  // Build sources data (needed for both LLM and fallback paths)
  const sources = buildSourcesData(topItems);

  // Deterministic fallback builder (no LLM)
  const fallback = (): { summary: string; sources: Array<{ title: string; host: string; url?: string; date?: string }> } => {
    if (topItems.length === 0) {
      return { summary: `I didn't find anything significant in the last 48 hours. Want me to keep watch?`, sources };
    }

    const summaries: string[] = [];
    topItems.forEach((item) => {
      let summary = cleanHtml(item.snippet || item.title || '');
      summary = summary
        .replace(/\[.*?\]/g, '')
        .replace(/\(.*?\)/g, '')
        .replace(/\*\*/g, '')
        .replace(/\s+/g, ' ')
        .trim();

      if (summary.length > 20 && summary.length < 300) {
        const datePart = item.date ? ` (${item.date})` : '';
        summaries.push(`${summary}${datePart}`);
      }
    });

    if (summaries.length === 0) {
      return { summary: `I couldn't extract useful summaries from the results.`, sources };
    }

    let result = summaries.join(' ');
    return { summary: result, sources };
  };

  // If no API key, use deterministic fallback
  if (!ANTHROPIC_API_KEY) {
    logger.warn('ANTHROPIC_API_KEY not set, using simple formatting');
    return fallback();
  }

  // Clean and format items for LLM
  const cleanedData = topItems.map(item => ({
    title: cleanHtml(item.title),
    snippet: cleanHtml(item.snippet || item.title),
    host: item.host,
    date: item.date || undefined,
  }));

  // Build capsule text for the composer
  const capsuleText = cleanedData
    .map((item) => {
      const d = item.date ? ` (${item.date})` : '';
      const text = item.snippet || item.title;
      const content = text ? `${text}${d}` : `${item.host}${d}`;
      return content;
    })
    .join('\n') || 'None';

  const sourcesLine = buildSourcesLine(topItems);

  // Build context-aware prompt
  let contextBlock = '';
  if (conversationContext && conversationContext.length > 0) {
    const contextText = conversationContext
      .map(msg => `${msg.role}: ${msg.content}`)
      .join('\n');
    contextBlock = `\n\nPREVIOUS CONVERSATION (to understand what the user is referring to):\n${contextText}\n`;
  }

  const userPrompt = `User's question: "${cleanHtml(userQuery)}"${contextBlock}

SEARCH RESULTS (these are the ONLY facts you can use - do NOT add anything else):
${capsuleText}

Create a natural, conversational response that answers their question using ONLY the information above.

CRITICAL REQUIREMENTS:
- If the user's question references something from the previous conversation (like "which one", "the first one", "that article"), use the conversation to understand what they're referring to
- When referencing items from the previous conversation, speak naturally (e.g., "React Fundamentals" or "the first article" not "the article YOU found")
- Write in flowing prose, as if explaining to a friend
- Synthesize the information naturally—don't list or format rigidly
- Include specific dates naturally within sentences (e.g., "In November 2024, researchers found..." not "[date]" or "(Nov 2024)")
- Write as comprehensively as needed to fully answer the question - don't artificially limit length
- Be thorough but concise - cover all relevant points from the search results
- Do NOT use headers, section markers, or structured formatting
- Do NOT list sources at the end - they'll be provided separately
- Present information confidently and conversationally`;

  let summary: string;
  try {
    summary = await callLLM(SYSTEM_PROMPT, userPrompt);
  } catch (err: any) {
    // Non-fatal: fallback to deterministic builder
    logger.warn({ error: err.message }, 'LLM composition failed, falling back to simple format');
    return fallback();
  }

  // POST-PROCESS: Enforce constraints
  summary = cleanHtml(summary);

  // Remove [web], [news], or other LLM-added markers
  summary = summary
    .replace(/\[web\]\s*/gi, '') // Remove [web] markers
    .replace(/\[news\]\s*/gi, '') // Remove [news] markers
    .replace(/\[article\]\s*/gi, '') // Remove [article] markers
    .replace(/\[source\]\s*/gi, ''); // Remove [source] markers

  // Remove any "quick recap" or similar introductory phrases
  summary = summary
    .replace(/^(here'?s\s+)?(the\s+)?quick\s+recap:?\s*/i, '') // Remove "Here's the quick recap:" or variants
    .replace(/^(here'?s\s+)?(what\s+i\s+found|what\s+i\s+found\s+today):?\s*/i, '') // Remove "Here's what I found:" variants
    .replace(/^(alright|ok|okay),?\s+(here'?s|here'?s\s+what)\s+/i, '') // Remove "Alright, here's..." or "Ok, here's..."
    .replace(/^here'?s\s+(the\s+)?latest:?\s*/i, '') // Remove "Here's the latest:"
    .trim();

  // CRITICAL: Detect and remove second summary sections
  // Look for patterns like "Here is a detailed summary" or "Here is a summary"
  const secondSummaryPattern = /(?:^|\n\n)(?:Here\s+is\s+(?:a\s+)?(?:detailed\s+)?summary|Here'?s\s+(?:a\s+)?(?:detailed\s+)?summary|Below\s+is\s+(?:a\s+)?(?:detailed\s+)?summary|Following\s+is\s+(?:a\s+)?summary)[:\s]*/i;
  const secondSummaryMatch = summary.match(secondSummaryPattern);
  if (secondSummaryMatch && secondSummaryMatch.index !== undefined) {
    // Split at the second summary and keep only the first part
    summary = summary.substring(0, secondSummaryMatch.index).trim();
  }

  // Remove markdown bold and normalize spacing
  summary = summary
    .replace(/\*\*/g, '') // Remove markdown bold
    .replace(/[ \t]{2,}/g, ' ') // Normalize multiple spaces (but not newlines)
    .replace(/\n{3,}/g, '\n\n') // Max 2 newlines
    .trim();

  // Enforce reasonable length limit (~2500 words max, roughly 3500 tokens)
  // Only truncate if significantly over limit to allow natural flow
  const words = summary.split(/\s+/);
  if (words.length > 2800) {
    // Truncate while preserving line breaks and natural sentence boundaries
    let truncatedWords: string[] = [];
    let wordCount = 0;
    for (const line of summary.split('\n')) {
      if (wordCount >= 2500) break;
      const lineWords = line.trim().split(/\s+/).filter(Boolean);
      const availableSlots = 2500 - wordCount;
      if (lineWords.length <= availableSlots) {
        truncatedWords.push(line);
        wordCount += lineWords.length;
      } else {
        // Try to end at a sentence boundary if possible
        const partialLine = lineWords.slice(0, availableSlots).join(' ');
        const lastPeriod = partialLine.lastIndexOf('.');
        if (lastPeriod > partialLine.length * 0.7) {
          truncatedWords.push(partialLine.substring(0, lastPeriod + 1));
        } else {
          truncatedWords.push(partialLine);
        }
        break;
      }
    }
    summary = truncatedWords.join('\n').trim();
    logger.debug({ originalWords: words.length }, 'Truncated summary to 2500 words');
  }

  logger.debug({ query: userQuery, length: summary.length, words: words.length }, 'Composed search response');

  // Remove any sources line that the LLM might have included
  if (summary.includes('Sources ▸')) {
    summary = summary.split('\n\nSources ▸')[0].trim();
  }

  return { summary, sources };
}

/**
 * STREAMING version - Compose and stream search response token by token
 * Yields tokens as they arrive from Haiku, with post-processing applied at the end
 */
export async function* composeSearchResponseStream(
  userQuery: string,
  items: SearchItem[],
  conversationContext?: Array<{ role: string; content: string }>
): AsyncGenerator<{ token?: string; sources?: Array<{ title: string; host: string; url?: string; date?: string }>; done?: boolean }, void, unknown> {
  // Empty items handling
  if (items.length === 0) {
    yield { token: "Hmm, I couldn't find much on that. Want to try rephrasing?", done: true };
    return;
  }

  // Check if query is asking for "latest" or recent info
  const queryLower = userQuery.toLowerCase();
  const isLookingForRecent = /\b(latest|recent|newest|current|today|this week|just|breaking|now)\b/i.test(queryLower);

  // Select top items using scoring
  const topItems = selectTopItems(items, 3);

  // Build sources data (returned at the end)
  const sources = buildSourcesData(topItems);

  // If user wants recent info, check if results are actually recent
  if (isLookingForRecent && topItems.length > 0) {
    const now = Date.now();
    const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);

    const hasRecentResults = topItems.some(item => {
      if (!item.date) return false;
      const timestamp = parseDate(item.date);
      return timestamp && timestamp > thirtyDaysAgo;
    });

    if (!hasRecentResults) {
      const oldestDate = topItems
        .map(item => item.date)
        .filter(Boolean)
        .sort()
        .reverse()[0];

      yield {
        token: `I couldn't find any recent news on this topic. The most recent information I found is from ${oldestDate || 'over a month ago'}. This might mean there haven't been new developments, or they're not widely covered yet. Would you like me to share what I found, or try a different search?`,
        sources,
        done: true
      };
      return;
    }
  }

  // If no API key, use deterministic fallback
  if (!ANTHROPIC_API_KEY) {
    logger.warn('ANTHROPIC_API_KEY not set, using simple formatting');
    const fallbackResult = fallbackBuilder(topItems, sources);
    yield { token: fallbackResult.summary, sources: fallbackResult.sources, done: true };
    return;
  }

  // Clean and format items for LLM
  const cleanedData = topItems.map(item => ({
    title: cleanHtml(item.title),
    snippet: cleanHtml(item.snippet || item.title),
    host: item.host,
    date: item.date || undefined,
  }));

  const capsuleText = cleanedData
    .map((item) => {
      const d = item.date ? ` (${item.date})` : '';
      const text = item.snippet || item.title;
      const content = text ? `${text}${d}` : `${item.host}${d}`;
      return content;
    })
    .join('\n') || 'None';

  // Build context-aware prompt
  let contextBlock = '';
  if (conversationContext && conversationContext.length > 0) {
    const contextText = conversationContext
      .map(msg => `${msg.role}: ${msg.content}`)
      .join('\n');
    contextBlock = `\n\nPREVIOUS CONVERSATION (to understand what the user is referring to):\n${contextText}\n`;
  }

  const userPrompt = `User's question: "${cleanHtml(userQuery)}"${contextBlock}

SEARCH RESULTS (these are the ONLY facts you can use - do NOT add anything else):
${capsuleText}

Create a natural, conversational response that answers their question using ONLY the information above.

CRITICAL REQUIREMENTS:
- If the user's question references something from the previous conversation (like "which one", "the first one", "that article"), use the conversation to understand what they're referring to
- When referencing items from the previous conversation, speak naturally (e.g., "React Fundamentals" or "the first article" not "the article YOU found")
- Write in flowing prose, as if explaining to a friend
- Synthesize the information naturally—don't list or format rigidly
- Include specific dates naturally within sentences (e.g., "In November 2024, researchers found..." not "[date]" or "(Nov 2024)")
- Aim for 200-400 words unless brevity is explicitly needed
- Do NOT use headers, section markers, numbered lists, or structured formatting
- Do NOT list sources at the end - they'll be provided separately
- If search results don't fully answer the question, acknowledge that naturally
- Write as one cohesive, conversational explanation`;

  // Stream tokens from Haiku and accumulate them
  let rawSummary = '';

  try {
    for await (const token of streamLLM(SYSTEM_PROMPT, userPrompt)) {
      try {
        rawSummary += token;
        // Stream tokens as they arrive for real-time UX
        yield { token };
      } catch (tokenError: any) {
        logger.warn({ error: tokenError.message }, 'Error yielding token, continuing stream');
        // Continue streaming even if one token fails
      }
    }
  } catch (err: any) {
    logger.warn({ error: err.message, stack: err.stack }, 'LLM streaming failed, falling back to simple format');
    const fallbackResult = fallbackBuilder(topItems, sources);
    yield { token: fallbackResult.summary, sources: fallbackResult.sources, done: true };
    return;
  }

  // POST-PROCESS the complete summary (same as non-streaming version)
  let fullSummary = cleanHtml(rawSummary);

  // Remove [web], [news], or other LLM-added markers
  fullSummary = fullSummary
    .replace(/\[web\]\s*/gi, '')
    .replace(/\[news\]\s*/gi, '')
    .replace(/\[article\]\s*/gi, '')
    .replace(/\[source\]\s*/gi, '');

  // Remove introductory phrases
  fullSummary = fullSummary
    .replace(/^(here'?s\s+)?(the\s+)?quick\s+recap:?\s*/i, '')
    .replace(/^(here'?s\s+)?(what\s+i\s+found|what\s+i\s+found\s+today):?\s*/i, '')
    .replace(/^(alright|ok|okay),?\s+(here'?s|here'?s\s+what)\s+/i, '')
    .replace(/^here'?s\s+(the\s+)?latest:?\s*/i, '')
    .trim();

  // Remove second summary sections
  const secondSummaryPattern = /(?:^|\n\n)(?:Here\s+is\s+(?:a\s+)?(?:detailed\s+)?summary|Here'?s\s+(?:a\s+)?(?:detailed\s+)?summary|Below\s+is\s+(?:a\s+)?(?:detailed\s+)?summary|Following\s+is\s+(?:a\s+)?summary)[:\s]*/i;
  const secondSummaryMatch = fullSummary.match(secondSummaryPattern);
  if (secondSummaryMatch && secondSummaryMatch.index !== undefined) {
    fullSummary = fullSummary.substring(0, secondSummaryMatch.index).trim();
  }

  // Remove all markdown formatting and normalize spacing
  fullSummary = fullSummary
    .replace(/\*\*/g, '') // Remove markdown bold (** **)
    .replace(/\*/g, '') // Remove any remaining asterisks
    .replace(/#{1,6}\s+/g, '') // Remove markdown headers (# ## ###)
    .replace(/[ \t]{2,}/g, ' ') // Normalize multiple spaces (but not newlines)
    .replace(/\n{3,}/g, '\n\n') // Max 2 newlines
    .trim();

  // Remove sources line if LLM added it
  if (fullSummary.includes('Sources ▸')) {
    fullSummary = fullSummary.split('\n\nSources ▸')[0].trim();
  }

  // Enforce reasonable length limit (~2500 words max, roughly 3500 tokens)
  // Only truncate if significantly over limit to allow natural flow
  const words = fullSummary.split(/\s+/);
  if (words.length > 2800) {
    // Truncate while preserving line breaks and natural sentence boundaries
    let truncatedWords: string[] = [];
    let wordCount = 0;
    for (const line of fullSummary.split('\n')) {
      if (wordCount >= 2500) break;
      const lineWords = line.trim().split(/\s+/).filter(Boolean);
      const availableSlots = 2500 - wordCount;
      if (lineWords.length <= availableSlots) {
        truncatedWords.push(line);
        wordCount += lineWords.length;
      } else {
        // Try to end at a sentence boundary if possible
        const partialLine = lineWords.slice(0, availableSlots).join(' ');
        const lastPeriod = partialLine.lastIndexOf('.');
        if (lastPeriod > partialLine.length * 0.7) {
          truncatedWords.push(partialLine.substring(0, lastPeriod + 1));
        } else {
          truncatedWords.push(partialLine);
        }
        break;
      }
    }
    fullSummary = truncatedWords.join('\n').trim();
    logger.debug({ originalWords: words.length }, 'Truncated summary to 2500 words');
  }

  // Send final summary update if post-processing changed the text
  // This ensures the frontend receives the cleaned, properly formatted version
  const rawCleaned = cleanHtml(rawSummary).trim();
  if (fullSummary !== rawCleaned && fullSummary.length > 0) {
    // Post-processing changed the text - send final corrected version
    // Send as final token so frontend can use it for replacement if needed
    yield { token: `\n\n[FINAL:${fullSummary}]`, sources, done: true };
  } else {
    // No significant changes, just send sources with completion
    yield { sources, done: true };
  }
}

/**
 * Helper function for fallback builder (extracted for reuse)
 */
function fallbackBuilder(topItems: SearchItem[], sources: Array<{ title: string; host: string; url?: string; date?: string }>): { summary: string; sources: Array<{ title: string; host: string; url?: string; date?: string }> } {
  if (topItems.length === 0) {
    return { summary: `I didn't find anything significant in the last 48 hours. Want me to keep watch?`, sources };
  }

  const summaries: string[] = [];
  topItems.forEach((item) => {
    let summary = cleanHtml(item.snippet || item.title || '');
    summary = summary
      .replace(/\[.*?\]/g, '')
      .replace(/\(.*?\)/g, '')
      .replace(/\*\*/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (summary.length > 20 && summary.length < 300) {
      const datePart = item.date ? ` (${item.date})` : '';
      summaries.push(`${summary}${datePart}`);
    }
  });

  if (summaries.length === 0) {
    return { summary: `I couldn't extract useful summaries from the results.`, sources };
  }

  let result = summaries.join(' ');
  return { summary: result, sources };
}
