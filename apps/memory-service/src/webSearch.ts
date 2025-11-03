/**
 * Immediate web search endpoint - independent from capsule system
 * Returns natural language results for direct chat injection
 */

import type { FastifyInstance } from 'fastify';
import { fetchBrave } from './research/fetchers/brave.js';
import { getResearchConfig } from './config.js';
import { composeSearchResponse, composeSearchResponseStream } from './composeSearchResponse.js';
import { pino } from 'pino';

const logger = pino({ name: 'webSearch' });

/**
 * Determine freshness parameter based on query keywords
 * Returns 'pd' (past day), 'pw' (past week), or 'pm' (past month)
 */
function determineFreshness(query: string): 'pd' | 'pw' | 'pm' {
  const queryLower = query.toLowerCase();
  
  // Explicit search requests should always use fresh results
  // Users saying "search the web" want current information
  const explicitSearchPatterns = [
    /\bsearch\s+(the\s+)?web\b/i,
    /\bweb\s+search\b/i,
    /\bsearch\s+for\b/i,
    /\blook\s+up\b/i,
    /\bfind\s+(out|information)\b/i,
  ];
  
  if (explicitSearchPatterns.some(pattern => pattern.test(query))) {
    logger.debug({ query, freshness: 'pd' }, 'Using past day freshness for explicit search request');
    return 'pd';
  }
  
  // Strong indicators for very recent content (past day)
  const recentPatterns = [
    /\b(latest|newest|recent|today|just|now|breaking)\b/i,
    /\b(what'?s?\s+new|what'?s?\s+happening|what'?s?\s+going\s+on)\b/i,
    /\b(current|updates?|developments?|happening|going\s+on)\b/i,
    /\b(this\s+hour|this\s+minute|right\s+now|as\s+of\s+now)\b/i,
    /\b(just\s+announced|just\s+released|just\s+happened)\b/i,
  ];
  
  // Moderate indicators for recent content (past week)
  const weekPatterns = [
    /\b(this\s+week|past\s+week|recently|lately)\b/i,
    /\b(latest\s+developments|recent\s+updates?)\b/i,
    /\b(this\s+month|past\s+month)\b/i,
  ];
  
  // Check for very recent indicators first (using regex for better matching)
  if (recentPatterns.some(pattern => pattern.test(query))) {
    logger.debug({ query, freshness: 'pd' }, 'Using past day freshness for recent query');
    return 'pd';
  }
  
  // Check for week indicators
  if (weekPatterns.some(pattern => pattern.test(query))) {
    logger.debug({ query, freshness: 'pw' }, 'Using past week freshness for weekly query');
    return 'pw';
  }
  
  // Default to past week instead of month for better freshness
  // This ensures users get relatively fresh results even without explicit time keywords
  logger.debug({ query, freshness: 'pw' }, 'Using past week freshness as default (improved from month)');
  return 'pw';
}

export function registerWebSearchRoute(app: FastifyInstance): void {
  /**
   * POST /v1/web-search
   * Immediate web search - returns natural language results
   */
  app.post('/v1/web-search', async (req, reply) => {
    await app.requireAuth(req, reply);
    
    if (reply.sent) {
      return;
    }
    
    if (!req.user?.id) {
      return reply.code(401).send({ error: 'Authentication required' });
    }

    const { query, threadId, conversationContext, dateFilter } = req.body as {
      query: string;
      threadId?: string;
      conversationContext?: Array<{ role: string; content: string }>;
      dateFilter?: string;
    };

    if (!query || typeof query !== 'string' || query.trim().length < 3) {
      return reply.code(400).send({ error: 'Query required (min 3 characters)' });
    }

    const config = getResearchConfig();
    if (!config.enabled || !config.braveApiKey) {
      return reply.code(503).send({ error: 'Web search not available' });
    }

    try {
      // Use original query (Brave API has 400 char limit, so truncate if needed)
      const trimmedQuery = query.trim();
      const searchQuery = trimmedQuery.length > 400
        ? trimmedQuery.substring(0, 397) + '...'
        : trimmedQuery;

      // Determine initial freshness based on dateFilter or query intent
      let requestedFreshness: 'pd' | 'pw' | 'pm' = determineFreshness(query.trim());

      // Override with dateFilter if provided (format: "after:YYYY-MM-DD")
      if (dateFilter) {
        const now = new Date();
        const filterDate = new Date(dateFilter.replace('after:', ''));
        const daysDiff = Math.floor((now.getTime() - filterDate.getTime()) / (1000 * 60 * 60 * 24));

        if (daysDiff <= 1) {
          requestedFreshness = 'pd';
          logger.debug({ dateFilter, daysDiff, freshness: 'pd' }, 'Using past day freshness from dateFilter');
        } else if (daysDiff <= 7) {
          requestedFreshness = 'pw';
          logger.debug({ dateFilter, daysDiff, freshness: 'pw' }, 'Using past week freshness from dateFilter');
        } else if (daysDiff <= 30) {
          requestedFreshness = 'pm';
          logger.debug({ dateFilter, daysDiff, freshness: 'pm' }, 'Using past month freshness from dateFilter');
        } else {
          // For dates older than a month, still use past month as that's our limit
          requestedFreshness = 'pm';
          logger.debug({ dateFilter, daysDiff, freshness: 'pm' }, 'DateFilter exceeds past month, using pm');
        }
      }

      // Cascading freshness strategy: try fresh results first, then expand if needed
      let items: any[] = [];
      let usedFreshness = requestedFreshness;

      // Try requested freshness first
      items = await fetchBrave(searchQuery, {
        count: 6,
        freshness: requestedFreshness,
        timeout: 5000,
      });

      // If we got very few results and requested 'pd', try 'pw' (past week)
      if (items.length < 3 && requestedFreshness === 'pd') {
        logger.info({ query, pdResults: items.length }, 'Few results from past day, expanding to past week');
        const weekItems = await fetchBrave(searchQuery, {
          count: 6,
          freshness: 'pw',
          timeout: 5000,
        });
        if (weekItems.length > items.length) {
          items = weekItems;
          usedFreshness = 'pw';
        }
      }

      // If still very few results and we haven't tried past month, try it
      if (items.length < 3 && (requestedFreshness === 'pd' || requestedFreshness === 'pw')) {
        logger.info({ query, currentResults: items.length, currentFreshness: usedFreshness }, 'Few results, expanding to past month');
        const monthItems = await fetchBrave(searchQuery, {
          count: 6,
          freshness: 'pm',
          timeout: 5000,
        });
        if (monthItems.length > items.length) {
          items = monthItems;
          usedFreshness = 'pm';
        }
      }

      if (items.length === 0) {
        return reply.code(200).send({
          query,
          results: [],
          summary: "I couldn't find any recent information on that topic. It might be too new, or there may not be much coverage yet. Want to try a different search?",
        });
      }

      logger.debug({ query, resultCount: items.length, usedFreshness }, 'Search completed with freshness strategy');

      // Compose natural language response using LLM (use original query for context)
      const searchItems = items.map(item => ({
        title: item.title,
        snippet: item.snippet || item.title || '',
        host: item.host,
        date: item.date,
      }));

      const { summary, sources } = await composeSearchResponse(query.trim(), searchItems, conversationContext);

      logger.info({ 
        query, 
        queryLength: query.length,
        searchQueryLength: searchQuery.length,
        resultCount: items.length, 
        threadId 
      }, 'Web search completed');

      return reply.code(200).send({
        query,
        results: items.slice(0, 4).map(item => ({
          title: item.title,
          host: item.host,
          snippet: item.snippet?.substring(0, 200) || item.title,
          date: item.date,
        })),
        summary,
        sources,
      });
    } catch (error: any) {
      logger.error({ error: error.message, query }, 'Web search failed');
      return reply.code(500).send({ error: 'Search failed', message: error.message });
    }
  });

  /**
   * POST /v1/web-search/stream
   * STREAMING web search - returns Server-Sent Events (SSE) stream
   * Emits: search_status events, token events, sources event, done event
   */
  app.post('/v1/web-search/stream', async (req, reply) => {
    await app.requireAuth(req, reply);

    if (reply.sent) {
      return;
    }

    if (!req.user?.id) {
      return reply.code(401).send({ error: 'Authentication required' });
    }

    const { query, threadId, conversationContext, dateFilter } = req.body as {
      query: string;
      threadId?: string;
      conversationContext?: Array<{ role: string; content: string }>;
      dateFilter?: string;
    };

    if (!query || typeof query !== 'string' || query.trim().length < 3) {
      return reply.code(400).send({ error: 'Query required (min 3 characters)' });
    }

    const config = getResearchConfig();
    if (!config.enabled || !config.braveApiKey) {
      return reply.code(503).send({ error: 'Web search not available' });
    }

    // Set up SSE headers
    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');

    try {
      // Stage 1: Emit "searching" status
      reply.raw.write(`event: search_status\ndata: ${JSON.stringify({ status: 'Searching current sources...' })}\n\n`);

      const trimmedQuery = query.trim();
      const searchQuery = trimmedQuery.length > 400
        ? trimmedQuery.substring(0, 397) + '...'
        : trimmedQuery;

      // Determine initial freshness based on dateFilter or query intent
      let requestedFreshness: 'pd' | 'pw' | 'pm' = determineFreshness(query.trim());

      // Override with dateFilter if provided (format: "after:YYYY-MM-DD")
      if (dateFilter) {
        const now = new Date();
        const filterDate = new Date(dateFilter.replace('after:', ''));
        const daysDiff = Math.floor((now.getTime() - filterDate.getTime()) / (1000 * 60 * 60 * 24));

        if (daysDiff <= 1) {
          requestedFreshness = 'pd';
        } else if (daysDiff <= 7) {
          requestedFreshness = 'pw';
        } else if (daysDiff <= 30) {
          requestedFreshness = 'pm';
        } else {
          requestedFreshness = 'pm';
        }
      }

      // Cascading freshness strategy
      let items: any[] = [];
      let usedFreshness = requestedFreshness;

      items = await fetchBrave(searchQuery, {
        count: 6,
        freshness: requestedFreshness,
        timeout: 5000,
      });

      if (items.length < 3 && requestedFreshness === 'pd') {
        const weekItems = await fetchBrave(searchQuery, {
          count: 6,
          freshness: 'pw',
          timeout: 5000,
        });
        if (weekItems.length > items.length) {
          items = weekItems;
          usedFreshness = 'pw';
        }
      }

      if (items.length < 3 && (requestedFreshness === 'pd' || requestedFreshness === 'pw')) {
        const monthItems = await fetchBrave(searchQuery, {
          count: 6,
          freshness: 'pm',
          timeout: 5000,
        });
        if (monthItems.length > items.length) {
          items = monthItems;
          usedFreshness = 'pm';
        }
      }

      if (items.length === 0) {
        reply.raw.write(`event: token\ndata: ${JSON.stringify({ text: "I couldn't find any recent information on that topic. It might be too new, or there may not be much coverage yet. Want to try a different search?" })}\n\n`);
        reply.raw.write(`event: done\ndata: {}\n\n`);
        reply.raw.end();
        return;
      }

      // Stage 2: Parse dates (Brave uses relative format like "14 hours ago")
      const now = Date.now();
      const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000);

      /**
       * Parse relative date strings from Brave ("14 hours ago", "2 days ago", etc.)
       */
      function parseRelativeDate(dateStr: string): number | null {
        if (!dateStr) return null;

        // Try standard date parsing first
        const standardParse = Date.parse(dateStr);
        if (!isNaN(standardParse)) return standardParse;

        // Parse relative formats: "X hours/days/weeks ago"
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
            return now - (amount * multiplier);
          }
        }

        return null;
      }

      // Parse and filter items by actual date (prefer recent, but don't be too strict)
      const recentItems = items.filter(item => {
        if (!item.date) {
          // No date info - keep it (might be very recent)
          logger.debug({ title: item.title, host: item.host }, 'Item has no date - keeping it');
          return true;
        }

        // Try to parse the date
        const timestamp = parseRelativeDate(item.date);
        if (timestamp === null) {
          logger.debug({ date: item.date, title: item.title }, 'Could not parse date - keeping item anyway');
          return true; // If we can't parse, keep it (might be recent)
        }

        // Prefer items from the last 30 days (more lenient than 7 days)
        const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);
        const isRecent = timestamp > thirtyDaysAgo;
        if (!isRecent) {
          logger.debug({
            date: item.date,
            ageInDays: Math.floor((now - timestamp) / (24 * 60 * 60 * 1000)),
            title: item.title
          }, 'Filtering out old item (>30 days)');
        }
        return isRecent;
      });

      // If date filtering removed all items, use all items instead (better than no results)
      const itemsToUse = recentItems.length > 0 ? recentItems : items;
      
      logger.info({
        totalItems: items.length,
        recentItems: recentItems.length,
        itemsToUse: itemsToUse.length,
        query
      }, 'Filtered search results by date');

      // Stage 2: Emit "analyzing" status
      reply.raw.write(`event: search_status\ndata: ${JSON.stringify({ status: `Found ${itemsToUse.length} articles, analyzing...` })}\n\n`);

      const searchItems = itemsToUse.map(item => ({
        title: item.title,
        snippet: item.snippet || item.title || '',
        host: item.host,
        date: item.date,
      }));

      // Stage 3: Emit "composing" status
      reply.raw.write(`event: search_status\ndata: ${JSON.stringify({ status: 'Composing response...' })}\n\n`);

      // Stream tokens from Haiku with error handling
      try {
        for await (const chunk of composeSearchResponseStream(query.trim(), searchItems, conversationContext)) {
          try {
            if (chunk.token) {
              // Stream each token as it arrives
              reply.raw.write(`event: token\ndata: ${JSON.stringify({ text: chunk.token })}\n\n`);
            }

            if (chunk.sources) {
              // Emit sources when ready
              reply.raw.write(`event: sources\ndata: ${JSON.stringify({ sources: chunk.sources })}\n\n`);
            }

            if (chunk.done) {
              // Emit done event
              reply.raw.write(`event: done\ndata: {}\n\n`);
              break;
            }
          } catch (chunkError: any) {
            logger.error({ error: chunkError.message, query }, 'Error processing chunk in streaming web search');
            // Continue streaming - don't break on chunk errors
          }
        }
      } catch (streamError: any) {
        logger.error({ error: streamError.message, query }, 'Error in composeSearchResponseStream');
        reply.raw.write(`event: error\ndata: ${JSON.stringify({ error: 'Stream error', message: streamError.message })}\n\n`);
      }

      logger.info({
        query,
        queryLength: query.length,
        resultCount: items.length,
        threadId,
        usedFreshness
      }, 'Streaming web search completed');

      reply.raw.end();
    } catch (error: any) {
      logger.error({ error: error.message, query }, 'Streaming web search failed');
      reply.raw.write(`event: error\ndata: ${JSON.stringify({ error: 'Search failed', message: error.message })}\n\n`);
      reply.raw.end();
    }
  });
}


