/**
 * Topic and entity extraction from messages
 * Simple keyword-based classification (can be upgraded to LLM later)
 */

import { pino } from 'pino';

const logger = pino({ name: 'topicExtractor' });

export type TTLClass = 'news/current' | 'pricing' | 'releases' | 'docs' | 'general';
export type RecencyHint = 'day' | 'week' | 'month';

export interface TopicExtraction {
  topic: string;
  ttlClass: TTLClass;
  recencyHint: RecencyHint;
  entities: string[];
}

// Keywords for topic classification
const NEWS_KEYWORDS = [
  'today', 'this week', 'breaking', 'latest', 'headline', 'announced', 
  'released', 'earnings', 'layoff', 'acquired', 'news', 'recent', 'update'
];

const PRICING_KEYWORDS = [
  'price', 'cost', 'buy', 'availability', 'stock', 'deal', 'discount',
  'free', 'premium', 'subscription', 'fee', 'dollar', 'euro', 'pound'
];

const RELEASES_KEYWORDS = [
  'release', 'version', 'v\\d+\\.\\d+', 'beta', 'alpha', 'rc\\d+',
  'changelog', 'what\'s new', 'update', 'upgrade'
];

const DOCS_KEYWORDS = [
  'documentation', 'docs', 'api', 'reference', 'guide', 'tutorial',
  'how to', 'example', 'getting started', 'manual'
];

// Pre-compile regex patterns for performance (avoid repeated RegExp creation)
const RELEASES_REGEXES = RELEASES_KEYWORDS.map(kw => new RegExp(kw, 'i'));

// Entity markers (reused from scorer.ts)
const ENTITY_MARKERS = ['@', '#', 'http://', 'https://', '.com', '.org', '.io', '.net', '.dev'];

/**
 * Extract topic from recent messages
 */
export function extractTopic(messages: Array<{ content: string; role: string }>): TopicExtraction {
  // Combine recent messages (last 8 turns worth of content)
  // Limit content to first 5000 chars to avoid performance issues with very long messages
  const recentContent = messages
    .slice(-16) // 8 turns = ~16 messages (user + assistant pairs)
    .map(m => m.content.substring(0, 5000))
    .join(' ')
    .toLowerCase();

  // Classify TTL class
  let ttlClass: TTLClass = 'general';
  let recencyHint: RecencyHint = 'month';

  if (NEWS_KEYWORDS.some(kw => recentContent.includes(kw.toLowerCase()))) {
    ttlClass = 'news/current';
    recencyHint = 'day';
  } else if (PRICING_KEYWORDS.some(kw => recentContent.includes(kw.toLowerCase()))) {
    ttlClass = 'pricing';
    recencyHint = 'week';
  } else if (RELEASES_REGEXES.some(pattern => pattern.test(recentContent))) {
    ttlClass = 'releases';
    recencyHint = 'week';
  } else if (DOCS_KEYWORDS.some(kw => recentContent.includes(kw.toLowerCase()))) {
    ttlClass = 'docs';
    recencyHint = 'month';
  }

  // Extract entities
  const entities = extractEntities(messages);

  // Generate topic summary (first 100 chars of most relevant message)
  const topic = generateTopicSummary(messages, ttlClass);

  logger.debug({ topic, ttlClass, recencyHint, entityCount: entities.length }, 'Topic extracted');

  return {
    topic,
    ttlClass,
    recencyHint,
    entities,
  };
}

/**
 * Extract entities from messages
 */
function extractEntities(messages: Array<{ content: string }>): string[] {
  const entities = new Set<string>();

  for (const msg of messages) {
    // Limit content to first 5000 chars to avoid performance issues with very long messages
    const content = msg.content.substring(0, 5000);

    // Extract URLs
    const urlRegex = /https?:\/\/[^\s]+/gi;
    const urls = content.match(urlRegex);
    if (urls) {
      urls.forEach(url => {
        try {
          const host = new URL(url).hostname;
          entities.add(host);
        } catch {
          // Invalid URL, skip
        }
      });
    }

    // Extract mentions (@username)
    const mentionRegex = /@(\w+)/gi;
    const mentions = content.match(mentionRegex);
    if (mentions) {
      mentions.forEach(m => entities.add(m));
    }

    // Extract hashtags (#tag)
    const hashtagRegex = /#(\w+)/gi;
    const hashtags = content.match(hashtagRegex);
    if (hashtags) {
      hashtags.forEach(h => entities.add(h));
    }

    // Extract domain names (simple heuristic)
    const domainRegex = /\b([a-z0-9]+(?:-[a-z0-9]+)*\.(?:com|org|io|net|dev|co|edu|gov))\b/gi;
    const domains = content.match(domainRegex);
    if (domains) {
      domains.forEach(d => entities.add(d));
    }

    // Extract version numbers (v1.2.3, 1.2.3)
    const versionRegex = /\b(v?\d+\.\d+(?:\.\d+)?)\b/gi;
    const versions = content.match(versionRegex);
    if (versions) {
      versions.forEach(v => entities.add(v));
    }

    // Extract product/company names (capitalized words, simple heuristic)
    const capitalizedWords = content.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g);
    if (capitalizedWords && capitalizedWords.length <= 5) {
      // Only add if reasonable number (avoid adding entire sentences)
      capitalizedWords.forEach(word => {
        if (word.length >= 2 && word.length <= 30) {
          entities.add(word);
        }
      });
    }
  }

  return Array.from(entities).slice(0, 20); // Limit to 20 entities
}

/**
 * Generate topic summary from messages
 */
function generateTopicSummary(
  messages: Array<{ content: string; role: string }>,
  ttlClass: TTLClass
): string {
  // Prefer user messages over assistant messages
  const userMessages = messages.filter(m => m.role === 'user');
  const relevantMessages = userMessages.length > 0 ? userMessages : messages;

  // Find most relevant message based on TTL class keywords
  let bestMessage = relevantMessages[relevantMessages.length - 1]; // Default to last message

  if (ttlClass !== 'general') {
    const keywords = 
      ttlClass === 'news/current' ? NEWS_KEYWORDS :
      ttlClass === 'pricing' ? PRICING_KEYWORDS :
      ttlClass === 'releases' ? RELEASES_KEYWORDS :
      DOCS_KEYWORDS;

    let bestScore = 0;
    for (const msg of relevantMessages) {
      const lower = msg.content.toLowerCase();
      const score = keywords.reduce((sum, kw) => {
        return sum + (lower.includes(kw.toLowerCase()) ? 1 : 0);
      }, 0);
      if (score > bestScore) {
        bestScore = score;
        bestMessage = msg;
      }
    }
  }

  // Extract first 100 characters as topic summary
  const summary = bestMessage.content.trim().substring(0, 100);
  return summary || 'general discussion';
}

