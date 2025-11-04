/**
 * Unlimited Recall Label & Summary Generators
 * Uses LLM to generate conversational labels and summaries
 */

import { logger } from './log.js';
import type { ConversationMessage } from './unlimited-recall-db.js';

/**
 * Call LLM for generation (using simple fetch to any OpenAI-compatible API)
 */
async function callLLM(prompt: string, maxTokens: number = 100): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  const apiUrl = process.env.OPENAI_API_URL || 'https://api.openai.com/v1/chat/completions';
  const model = process.env.LABEL_GENERATION_MODEL || 'gpt-4o-mini';

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: maxTokens,
        temperature: 0.3 // Lower temperature for more consistent generation
      })
    });

    if (!response.ok) {
      throw new Error(`LLM API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as any;
    return data.choices[0]?.message?.content?.trim() || '';
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to call LLM for generation');
    throw error;
  }
}

/**
 * Generate a conversation label (short topic name)
 * Examples: "Implementing OAuth2 authentication", "Debugging React rendering"
 */
export async function generateConversationLabel(messages: ConversationMessage[]): Promise<string> {
  // Use first 5 messages to understand the topic
  const context = messages
    .slice(0, 5)
    .map(m => `${m.role}: ${m.content.substring(0, 200)}`)
    .join('\n\n');

  const prompt = `Generate a concise topic label (max 50 characters) for this conversation.
Focus on the main technical topic or goal being discussed.

Conversation:
${context}

Topic label (50 chars max):`;

  try {
    const label = await callLLM(prompt, 20);

    // Truncate if too long
    const cleanLabel = label
      .replace(/^["']|["']$/g, '') // Remove surrounding quotes
      .substring(0, 50)
      .trim();

    return cleanLabel || 'Technical discussion';
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to generate conversation label');
    return `Conversation - ${new Date().toISOString().split('T')[0]}`;
  }
}

/**
 * Generate a conversation summary (compressed version with key points)
 */
export async function generateConversationSummary(
  messages: ConversationMessage[],
  importance: 'high' | 'normal' = 'normal'
): Promise<{
  summary: string;
  keyDecisions: string[];
  technicalTerms: string[];
}> {
  // Prepare conversation transcript
  const fullTranscript = messages
    .map(m => `${m.role}: ${m.content}`)
    .join('\n\n');

  // Truncate if too long (keep first and last parts)
  let truncatedTranscript = fullTranscript;
  if (fullTranscript.length > 8000) {
    const firstPart = fullTranscript.substring(0, 3000);
    const lastPart = fullTranscript.substring(fullTranscript.length - 3000);
    truncatedTranscript = `${firstPart}\n\n[... middle section omitted ...]\n\n${lastPart}`;
  }

  const maxLength = importance === 'high' ? 800 : 500;
  const prompt = `Summarize this technical conversation in ${maxLength} characters or less. Focus on:
- Main topic and goal
- Key decisions or choices made
- Technical approaches discussed
- Final outcome or solution (if reached)

Format: Write 2-3 clear, concise sentences.

Conversation:
${truncatedTranscript}

Summary (${maxLength} chars):`;

  try {
    const summary = await callLLM(prompt, 200);

    // Extract key decisions from summary
    const keyDecisions = extractKeyDecisions(summary);

    // Extract technical terms
    const technicalTerms = extractTechnicalTerms(fullTranscript);

    return {
      summary: summary.substring(0, maxLength).trim(),
      keyDecisions,
      technicalTerms
    };
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to generate conversation summary');
    return {
      summary: `Technical discussion with ${messages.length} messages`,
      keyDecisions: [],
      technicalTerms: []
    };
  }
}

/**
 * Extract key decisions from text
 */
function extractKeyDecisions(text: string): string[] {
  const decisions: string[] = [];
  const lower = text.toLowerCase();

  // Look for decision indicators
  const decisionPatterns = [
    /decided to (.+?)[\.\,\n]/gi,
    /chose to (.+?)[\.\,\n]/gi,
    /selected (.+?)[\.\,\n]/gi,
    /will use (.+?)[\.\,\n]/gi,
    /going with (.+?)[\.\,\n]/gi
  ];

  for (const pattern of decisionPatterns) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      if (match[1]) {
        decisions.push(match[1].trim());
      }
    }
  }

  return decisions.slice(0, 3); // Return top 3
}

/**
 * Extract technical terms from conversation
 */
function extractTechnicalTerms(text: string): string[] {
  const terms = new Set<string>();

  // Common technical term patterns
  const patterns = [
    /\b[A-Z][a-z]+(?:[A-Z][a-z]+)+\b/g, // PascalCase: React, PostgreSQL
    /\b[a-z]+(?:-[a-z]+)+\b/g,           // kebab-case: docker-compose, api-key
    /\b[a-z]+(?:_[a-z]+)+\b/g,           // snake_case: user_id, api_key
    /\b(?:API|SDK|CLI|REST|GraphQL|SQL|NoSQL|HTTP|HTTPS|JWT|OAuth)\b/gi, // Common acronyms
  ];

  for (const pattern of patterns) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      if (match[0].length > 3) { // Filter out short matches
        terms.add(match[0]);
      }
    }
  }

  return Array.from(terms).slice(0, 10); // Return top 10
}

/**
 * Estimate token count for text
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Calculate importance score based on conversation characteristics
 */
export function calculateImportanceScore(messages: ConversationMessage[]): number {
  let score = 0.5; // Base score

  // More messages = more important
  if (messages.length > 50) score += 0.15;
  else if (messages.length > 20) score += 0.10;

  // Has code = more important
  const hasCode = messages.some(m => m.is_code_heavy);
  if (hasCode) score += 0.15;

  // Has decisions = more important
  const hasDecisions = messages.some(m => m.has_decision);
  if (hasDecisions) score += 0.10;

  // Many questions = engaged conversation
  const questionCount = messages.filter(m => m.is_question).length;
  if (questionCount > 5) score += 0.10;

  return Math.min(1.0, score);
}

/**
 * Determine primary topic from technical terms
 */
export function determinePrimaryTopic(technicalTerms: string[]): string | null {
  // Topic keywords
  const topicMap: Record<string, string[]> = {
    'authentication': ['OAuth', 'JWT', 'auth', 'login', 'token', 'session'],
    'database': ['SQL', 'PostgreSQL', 'MySQL', 'MongoDB', 'database', 'query'],
    'api-design': ['API', 'REST', 'GraphQL', 'endpoint', 'route'],
    'frontend': ['React', 'Vue', 'Angular', 'component', 'rendering'],
    'backend': ['server', 'Express', 'FastAPI', 'Django', 'Flask'],
    'deployment': ['Docker', 'Kubernetes', 'deploy', 'CI/CD', 'container'],
    'testing': ['test', 'unit-test', 'integration', 'Jest', 'pytest']
  };

  // Score each topic
  const scores: Record<string, number> = {};
  const lowerTerms = technicalTerms.map(t => t.toLowerCase());

  for (const [topic, keywords] of Object.entries(topicMap)) {
    scores[topic] = keywords.filter(k =>
      lowerTerms.some(term => term.includes(k.toLowerCase()))
    ).length;
  }

  // Find highest scoring topic
  const topTopic = Object.entries(scores)
    .sort(([, a], [, b]) => b - a)[0];

  return topTopic && topTopic[1] > 0 ? topTopic[0] : null;
}
