/**
 * Unlimited Recall Trigger Detection
 * Detects when users want to recall past conversations
 */

import { logger } from './log.js';

/**
 * Trigger types
 */
export type TriggerType = 'resume' | 'historical' | 'semantic' | 'none';

export interface TriggerDetectionResult {
  type: TriggerType;
  confidence: number;
  query?: string;
  timeframe?: {
    value: number;
    unit: 'minute' | 'hour' | 'day' | 'week' | 'month';
    startTimestamp?: number;
    endTimestamp?: number;
  };
}

/**
 * Patterns for detecting "pick up where we left off" intent
 */
const RESUME_PATTERNS = [
  /pick\s+up\s+where\s+(we|i)\s+left\s+off/i,
  /continue\s+(our|the)\s+(last|previous)\s+(conversation|discussion|chat)/i,
  /what\s+were\s+we\s+(talking|discussing)\s+about/i,
  /back\s+to\s+(our|the)\s+previous\s+(chat|discussion|conversation)/i,
  /resume\s+(our|the)\s+(conversation|discussion)/i,
  /where\s+did\s+we\s+leave\s+off/i,
  /last\s+time\s+we\s+(talked|chatted|discussed)/i,
  /earlier\s+(conversation|discussion)/i
];

/**
 * Patterns for detecting historical queries
 */
const HISTORICAL_PATTERNS = [
  /what\s+(was|were|did)\s+(we|i|you)\s+.*\s+(last|ago|before|previous|earlier)/i,
  /how\s+did\s+(we|i)\s+(fix|solve|resolve|handle|deal\s+with)/i,
  /remember\s+(when|that\s+time|how|what)/i,
  /can\s+you\s+(find|recall|remind\s+me|tell\s+me)\s+.*\s+(ago|before|earlier|last)/i,
  /(do\s+you\s+)?recall\s+(the|that|when)/i,
  /didn't\s+we\s+(discuss|talk\s+about|work\s+on)/i,
  /we\s+(discussed|talked\s+about|worked\s+on)\s+.*\s+(ago|before|earlier)/i
];

/**
 * Timeframe extraction patterns
 */
const TIMEFRAME_PATTERNS = [
  /(\d+)\s+(minute|min)s?\s+ago/i,
  /(\d+)\s+(hour|hr)s?\s+ago/i,
  /(\d+)\s+(day)s?\s+ago/i,
  /(\d+)\s+(week)s?\s+ago/i,
  /(\d+)\s+(month)s?\s+ago/i,
  /(last|yesterday)/i,
  /(this\s+morning|earlier\s+today)/i
];

/**
 * Detect trigger type in user message
 */
export function detectTrigger(userMessage: string): TriggerDetectionResult {
  const lower = userMessage.toLowerCase().trim();

  // Check for resume patterns
  const resumeMatch = RESUME_PATTERNS.some(pattern => pattern.test(lower));
  if (resumeMatch) {
    return {
      type: 'resume',
      confidence: 0.9,
      query: userMessage
    };
  }

  // Check for historical patterns
  const historicalMatch = HISTORICAL_PATTERNS.some(pattern => pattern.test(lower));
  if (historicalMatch) {
    const timeframe = extractTimeframe(userMessage);

    return {
      type: 'historical',
      confidence: 0.85,
      query: userMessage,
      timeframe
    };
  }

  // Check for semantic search patterns (less specific)
  if (looksLikeSemanticQuery(userMessage)) {
    return {
      type: 'semantic',
      confidence: 0.6,
      query: userMessage
    };
  }

  return {
    type: 'none',
    confidence: 0
  };
}

/**
 * Extract timeframe from message
 */
function extractTimeframe(message: string): TriggerDetectionResult['timeframe'] | undefined {
  const now = Date.now();

  // Try numeric patterns first
  for (const pattern of TIMEFRAME_PATTERNS) {
    const match = message.match(pattern);
    if (match) {
      const value = parseInt(match[1] || '1', 10);
      let unit: 'minute' | 'hour' | 'day' | 'week' | 'month';

      if (match[2]) {
        const unitStr = match[2].toLowerCase();
        if (unitStr.startsWith('min')) unit = 'minute';
        else if (unitStr.startsWith('hour') || unitStr.startsWith('hr')) unit = 'hour';
        else if (unitStr.startsWith('day')) unit = 'day';
        else if (unitStr.startsWith('week')) unit = 'week';
        else if (unitStr.startsWith('month')) unit = 'month';
        else continue;
      } else {
        // Handle special cases like "yesterday"
        if (/yesterday/i.test(match[0])) {
          unit = 'day';
        } else if (/(this\s+morning|earlier\s+today)/i.test(match[0])) {
          unit = 'hour';
        } else {
          continue;
        }
      }

      // Calculate timestamp range
      const multipliers = {
        minute: 60 * 1000,
        hour: 60 * 60 * 1000,
        day: 24 * 60 * 60 * 1000,
        week: 7 * 24 * 60 * 60 * 1000,
        month: 30 * 24 * 60 * 60 * 1000
      };

      const duration = value * multipliers[unit];

      // Use fuzzy window (±50% to account for imprecise memory)
      const centerPoint = now - duration;
      const windowSize = duration * 0.5;

      return {
        value,
        unit,
        startTimestamp: Math.floor((centerPoint - windowSize) / 1000),
        endTimestamp: Math.floor((centerPoint + windowSize) / 1000)
      };
    }
  }

  return undefined;
}

/**
 * Check if message looks like a semantic query
 * (Asking about past topics but not explicitly)
 */
function looksLikeSemanticQuery(message: string): boolean {
  const lower = message.toLowerCase();

  // Contains question words and technical terms
  const hasQuestionWord = /\b(how|what|why|when|where|which)\b/i.test(lower);
  const hasTechnicalTerm = /\b([A-Z][a-z]+(?:[A-Z][a-z]+)+|[a-z]+(?:-[a-z]+)+|API|SDK|CLI)\b/.test(message);
  const mentionsPast = /\b(we|discussed|talked|used|tried|did)\b/i.test(lower);

  return hasQuestionWord && hasTechnicalTerm && mentionsPast;
}

/**
 * Extract key terms from query for search
 */
export function extractSearchTerms(query: string): string[] {
  const terms: string[] = [];

  // Technical terms (PascalCase, kebab-case, acronyms)
  const technicalPattern = /\b([A-Z][a-z]+(?:[A-Z][a-z]+)+|[a-z]+(?:-[a-z]+){2,}|[A-Z]{2,})\b/g;
  const technicalMatches = query.matchAll(technicalPattern);
  for (const match of technicalMatches) {
    terms.push(match[0]);
  }

  // Important keywords
  const keywords = [
    'authentication', 'database', 'api', 'server', 'client', 'bug', 'error',
    'fix', 'issue', 'problem', 'feature', 'implement', 'deploy', 'test'
  ];

  const lower = query.toLowerCase();
  for (const keyword of keywords) {
    if (lower.includes(keyword)) {
      terms.push(keyword);
    }
  }

  // Remove duplicates
  return Array.from(new Set(terms));
}

/**
 * Calculate confidence score for trigger detection
 */
export function calculateTriggerConfidence(
  userMessage: string,
  messageHistory: Array<{ role: string; content: string }>
): number {
  let confidence = 0;

  const trigger = detectTrigger(userMessage);
  confidence += trigger.confidence * 0.6; // Base confidence from pattern matching

  // Increase confidence if message is short (likely a follow-up)
  if (userMessage.length < 50) {
    confidence += 0.1;
  }

  // Increase confidence if previous message was assistant response
  if (messageHistory.length > 0 && messageHistory[messageHistory.length - 1].role === 'assistant') {
    confidence += 0.1;
  }

  // Increase confidence if user mentions specific topic from history
  const searchTerms = extractSearchTerms(userMessage);
  if (searchTerms.length > 2) {
    confidence += 0.1;
  }

  return Math.min(1.0, confidence);
}

/**
 * Should we trigger recall for this message?
 */
export function shouldTriggerRecall(
  userMessage: string,
  messageHistory: Array<{ role: string; content: string }> = [],
  minConfidence: number = 0.7
): boolean {
  const trigger = detectTrigger(userMessage);

  if (trigger.type === 'none') {
    return false;
  }

  const confidence = calculateTriggerConfidence(userMessage, messageHistory);

  logger.debug({
    trigger: trigger.type,
    confidence,
    minConfidence,
    shouldTrigger: confidence >= minConfidence
  }, 'Trigger detection result');

  return confidence >= minConfidence;
}
