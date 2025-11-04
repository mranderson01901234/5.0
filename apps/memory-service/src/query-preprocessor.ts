/**
 * Query Preprocessing for Memory Recall
 * Normalizes queries, extracts phrases, and improves keyword matching
 * 
 * Phase 1: Query Preprocessing
 * - Question normalization
 * - Phrase detection
 * - Token normalization
 */

import { filterStopWords, type FilterContext } from './stopwords.js';

export interface ProcessedQuery {
  normalized: string;           // Normalized query string
  keywords: string[];          // Individual keywords
  phrases: string[];           // Detected phrases
  allTerms: string[];         // All searchable terms (keywords + phrases)
}

// Import stop word categories from centralized module
import { getStopWords } from './stopwords.js';

const QUESTION_WORDS = getStopWords('question_words');
const POSSESSIVE_DETERMINERS = getStopWords('possessive_determiners');
const COPULA_VERBS = getStopWords('copula_verbs');

/**
 * Common phrases that should be detected as single units
 * These are common patterns in memory queries
 */
const COMMON_PHRASES = [
  'favorite color', 'favorite language', 'favorite food', 'favorite music',
  'working on', 'working with', 'working at',
  'dark mode', 'light mode',
  'prefer over', 'prefer to', 'prefer that',
  'currently working', 'currently using',
  'project name', 'project status',
  'goal is', 'goal to', 'goal of',
  'deadline for', 'deadline is',
  'need to', 'want to', 'have to', 'going to',
  'design preference', 'color preference',
  'programming language', 'coding language',
  'ui design', 'ui redesign', 'user interface',
  'minimalist design', 'modern design',
];

/**
 * Normalize a query string by:
 * 1. Handling contractions
 * 2. Normalizing hyphenation
 * 3. Removing extra whitespace
 */
function normalizeText(text: string): string {
  let normalized = text.trim().toLowerCase();
  
  // Handle contractions
  const contractions: Record<string, string> = {
    "don't": "do not",
    "doesn't": "does not",
    "didn't": "did not",
    "won't": "will not",
    "wouldn't": "would not",
    "shouldn't": "should not",
    "couldn't": "could not",
    "can't": "cannot",
    "isn't": "is not",
    "aren't": "are not",
    "wasn't": "was not",
    "weren't": "were not",
    "hasn't": "has not",
    "haven't": "have not",
    "hadn't": "had not",
    "i'm": "i am",
    "you're": "you are",
    "he's": "he is",
    "she's": "she is",
    "it's": "it is",
    "we're": "we are",
    "they're": "they are",
    "i've": "i have",
    "you've": "you have",
    "we've": "we have",
    "they've": "they have",
    "i'll": "i will",
    "you'll": "you will",
    "he'll": "he will",
    "she'll": "she will",
    "we'll": "we will",
    "they'll": "they will",
  };
  
  for (const [contraction, expansion] of Object.entries(contractions)) {
    normalized = normalized.replace(new RegExp(`\\b${contraction}\\b`, 'gi'), expansion);
  }
  
  // Normalize hyphenation (dark-mode -> dark mode)
  normalized = normalized.replace(/-/g, ' ');
  
  // Handle possessives (user's -> user)
  normalized = normalized.replace(/'s\b/g, '');
  
  // Remove extra whitespace
  normalized = normalized.replace(/\s+/g, ' ').trim();
  
  return normalized;
}

/**
 * Detect if a query is a question
 */
function isQuestion(query: string): boolean {
  const trimmed = query.trim();
  return (
    trimmed.endsWith('?') ||
    QUESTION_WORDS.has(trimmed.split(/\s+/)[0]?.toLowerCase()) ||
    /^(what|who|where|when|why|how|which|whose|whom)\s+/i.test(trimmed)
  );
}

/**
 * Normalize a question by removing question words, possessives, and copulas
 * Example: "what is my favorite color" -> "favorite color"
 */
function normalizeQuestion(query: string): string {
  const words = query.toLowerCase().split(/\s+/);
  const filtered: string[] = [];
  
  for (const word of words) {
    // Skip question words
    if (QUESTION_WORDS.has(word)) continue;
    
    // Skip possessive determiners
    if (POSSESSIVE_DETERMINERS.has(word)) continue;
    
    // Skip copula verbs
    if (COPULA_VERBS.has(word)) continue;
    
    // Skip common question patterns
    if (word === 'do' || word === 'does' || word === 'did') continue;
    if (word === 'tell' || word === 'show' || word === 'give') continue;
    
    filtered.push(word);
  }
  
  return filtered.join(' ').trim();
}

/**
 * Extract phrases from a query
 * Returns detected phrases in order of appearance
 */
function extractPhrases(query: string): string[] {
  const normalized = normalizeText(query);
  const phrases: string[] = [];
  const foundPhrases = new Set<string>();
  
  // Check for common phrases (longest first to avoid partial matches)
  const sortedPhrases = [...COMMON_PHRASES].sort((a, b) => b.length - a.length);
  
  for (const phrase of sortedPhrases) {
    const phraseLower = phrase.toLowerCase();
    if (normalized.includes(phraseLower) && !foundPhrases.has(phraseLower)) {
      phrases.push(phrase);
      foundPhrases.add(phraseLower);
    }
  }
  
  // Also detect noun phrases (2-3 word sequences that look like entities)
  // Pattern: adjective? + noun + (adjective? + noun)?
  const nounPhrasePattern = /\b(?:[a-z]+ ){1,2}[a-z]+\b/g;
  const matches = normalized.match(nounPhrasePattern) || [];
  
  for (const match of matches) {
    const trimmed = match.trim();
    // Only include if it's 2+ words and not already found
    if (trimmed.split(/\s+/).length >= 2 && !foundPhrases.has(trimmed)) {
      // Check if it's not a common phrase (avoid duplicates)
      const isCommonPhrase = COMMON_PHRASES.some(p => 
        trimmed.toLowerCase().includes(p.toLowerCase()) || p.toLowerCase().includes(trimmed.toLowerCase())
      );
      
      if (!isCommonPhrase && trimmed.length > 3) {
        phrases.push(trimmed);
        foundPhrases.add(trimmed);
      }
    }
  }
  
  return phrases;
}

/**
 * Extract keywords from a query (excluding phrases and stop words)
 */
function extractKeywords(query: string, phrases: string[]): string[] {
  // Remove detected phrases from query
  let queryWithoutPhrases = query.toLowerCase();
  for (const phrase of phrases) {
    queryWithoutPhrases = queryWithoutPhrases.replace(
      new RegExp(phrase.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
      ' '
    );
  }
  
  // Extract words (length >= 2)
  const words = queryWithoutPhrases.match(/\b\w{2,}\b/g) || [];
  
  // Filter stop words with context
  const context: FilterContext = {
    isQuestion: isQuestion(query),
    preservePhrases: true,
    preserveImportantPrepositions: true,
  };
  
  const keywords = filterStopWords(words, context);
  
  return keywords;
}

/**
 * Main preprocessing function
 * Normalizes query, extracts phrases and keywords
 */
export function preprocessQuery(query: string): ProcessedQuery {
  if (!query || !query.trim()) {
    return {
      normalized: '',
      keywords: [],
      phrases: [],
      allTerms: [],
    };
  }
  
  // Step 1: Normalize text (contractions, hyphenation, etc.)
  const normalized = normalizeText(query);
  
  // Step 2: Detect if it's a question and normalize
  const isQuestionQuery = isQuestion(normalized);
  const questionNormalized = isQuestionQuery ? normalizeQuestion(normalized) : normalized;
  
  // Step 3: Extract phrases
  const phrases = extractPhrases(questionNormalized);
  
  // Step 4: Extract keywords (excluding phrases)
  const keywords = extractKeywords(questionNormalized, phrases);
  
  // Step 5: Combine all terms
  const allTerms = [...phrases, ...keywords];
  
  return {
    normalized: questionNormalized,
    keywords,
    phrases,
    allTerms,
  };
}

/**
 * Get the best searchable terms from a processed query
 * Returns phrases first (higher priority), then keywords
 */
export function getSearchTerms(processed: ProcessedQuery, maxTerms: number = 10): string[] {
  // Prioritize phrases, then keywords
  const terms: string[] = [];
  
  // Add phrases first (they're more specific)
  for (const phrase of processed.phrases) {
    if (terms.length >= maxTerms) break;
    terms.push(phrase);
  }
  
  // Add keywords
  for (const keyword of processed.keywords) {
    if (terms.length >= maxTerms) break;
    // Skip if already included in a phrase
    const inPhrase = processed.phrases.some(p => 
      p.toLowerCase().includes(keyword.toLowerCase())
    );
    if (!inPhrase) {
      terms.push(keyword);
    }
  }
  
  return terms;
}

