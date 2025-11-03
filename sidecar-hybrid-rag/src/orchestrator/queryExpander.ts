/**
 * Query Expander - Intelligently expands vague queries
 */

import OpenAI from 'openai';
import { loadConfig } from '../config.js';
import { logger } from '../utils/logger.js';

const config = loadConfig();

export class QueryExpander {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: config.openaiApiKey,
    });
  }

  /**
   * Expand vague or underspecified queries
   */
  async expand(
    query: string,
    context?: {
      recentMessages?: Array<{ role: string; content: string }>;
      userPreferences?: Record<string, any>;
    }
  ): Promise<string[]> {
    try {
      logger.debug({ query }, 'Expanding query');

      // Check if expansion is needed
      if (!this.needsExpansion(query)) {
        return [query];
      }

      // Build expansion prompt
      const expansionPrompt = this.buildExpansionPrompt(query, context);

      // Generate expansion
      const response = await this.openai.chat.completions.create({
        model: config.queryExpansionModel,
        messages: [
          {
            role: 'system',
            content: 'Generate 3-5 expanded query variations that are more specific versions of the given query. Return as JSON array of strings.',
          },
          {
            role: 'user',
            content: expansionPrompt,
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.5,
      });

      const expansion = JSON.parse(response.choices[0].message.content || '{}');
      const expansions = expansion.queries || [query];

      logger.debug({ original: query, expansions }, 'Query expanded');

      return [query, ...expansions]; // Include original
    } catch (error) {
      logger.error({ error }, 'Query expansion failed, using original');
      return [query];
    }
  }

  /**
   * Check if query needs expansion
   */
  private needsExpansion(query: string): boolean {
    const vagueTerms = ['that', 'thing', 'stuff', 'it', 'them'];
    const vagueCount = vagueTerms.reduce((count, term) => {
      return count + (query.toLowerCase().includes(` ${term} `) ? 1 : 0);
    }, 0);

    // Expand if: short query OR contains vague terms OR lacks question words
    const isShort = query.length < 20;
    const hasVagueTerms = vagueCount >= 1;
    const lacksQuestionWords = !/what|when|where|why|how|which|who/.test(query.toLowerCase());

    return isShort || hasVagueTerms || lacksQuestionWords;
  }

  /**
   * Build expansion prompt with context
   */
  private buildExpansionPrompt(
    query: string,
    context?: {
      recentMessages?: Array<{ role: string; content: string }>;
      userPreferences?: Record<string, any>;
    }
  ): string {
    let prompt = `Original query: "${query}"\n\nGenerate 3-5 more specific variations.\n`;

    // Add context if available
    if (context?.recentMessages && context.recentMessages.length > 0) {
      const recentContext = context.recentMessages
        .slice(-3)
        .map(m => `${m.role}: ${m.content}`)
        .join('\n');
      prompt += `\nRecent conversation:\n${recentContext}\n`;
    }

    // Add user preferences if available
    if (context?.userPreferences) {
      prompt += `\nUser context: ${JSON.stringify(context.userPreferences)}\n`;
    }

    prompt += '\nReturn JSON: {"queries": ["variation1", "variation2", ...]}';

    return prompt;
  }

  /**
   * Extract concepts from query
   */
  extractConcepts(query: string): string[] {
    // Basic concept extraction
    const words = query.toLowerCase().split(/\s+/);
    const stopWords = new Set(['what', 'when', 'where', 'why', 'how', 'the', 'a', 'an', 'is', 'are', 'was', 'were', 'do', 'does', 'did']);
    
    return words
      .filter(word => word.length > 2 && !stopWords.has(word))
      .filter(word => /^[a-z]+$/.test(word)); // Only alphanumeric
  }
}

