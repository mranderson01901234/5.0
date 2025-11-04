/**
 * Centralized Stop Words Management
 * Provides categorized stop word lists and context-aware filtering
 * 
 * Phase 2: Enhanced Stop Words
 */

export type StopWordCategory = 
  | 'articles'
  | 'question_words'
  | 'possessive_determiners'
  | 'copula_verbs'
  | 'prepositions'
  | 'pronouns'
  | 'auxiliary_verbs'
  | 'conjunctions'
  | 'demonstratives'
  | 'basic';

/**
 * Categorized stop word lists
 */
export const STOP_WORDS: Record<StopWordCategory, Set<string>> = {
  // Articles - always remove
  articles: new Set(['the', 'a', 'an']),

  // Question words - remove in questions, keep in statements
  question_words: new Set([
    'what', 'who', 'where', 'when', 'why', 'how', 'which', 'whose', 'whom'
  ]),

  // Possessive determiners - remove in questions, context-dependent in statements
  possessive_determiners: new Set([
    'my', 'your', 'his', 'her', 'its', 'our', 'their',
    'mine', 'yours', 'hers', 'ours', 'theirs'
  ]),

  // Copula verbs - remove in questions, context-dependent in statements
  copula_verbs: new Set([
    'is', 'are', 'was', 'were', 'am', 'be', 'been', 'being'
  ]),

  // Prepositions - context-dependent (keep in phrases like "working on")
  prepositions: new Set([
    'in', 'on', 'at', 'to', 'for', 'of', 'with', 'from', 'by', 'about',
    'into', 'onto', 'over', 'under', 'above', 'below', 'between', 'among',
    'through', 'during', 'before', 'after', 'since', 'until', 'within',
    'without', 'beside', 'besides', 'near', 'around', 'across'
  ]),

  // Pronouns - context-dependent
  pronouns: new Set([
    'i', 'you', 'he', 'she', 'it', 'we', 'they',
    'me', 'him', 'her', 'us', 'them'
  ]),

  // Auxiliary verbs - context-dependent
  auxiliary_verbs: new Set([
    'have', 'has', 'had', 'do', 'does', 'did',
    'will', 'would', 'should', 'could', 'may', 'might', 'can', 'must'
  ]),

  // Conjunctions - usually remove
  conjunctions: new Set([
    'and', 'or', 'but', 'nor', 'so', 'yet', 'for', 'because', 'since', 'as'
  ]),

  // Demonstratives - context-dependent
  demonstratives: new Set([
    'this', 'that', 'these', 'those'
  ]),

  // Basic stop words (always remove)
  basic: new Set([
    'the', 'a', 'an', 'and', 'or', 'but'
  ]),
};

/**
 * All stop words combined (for backward compatibility)
 */
export const ALL_STOP_WORDS = new Set<string>();
Object.values(STOP_WORDS).forEach(category => {
  category.forEach(word => ALL_STOP_WORDS.add(word));
});

/**
 * Context for filtering stop words
 */
export interface FilterContext {
  isQuestion?: boolean;      // Is this a question?
  preservePhrases?: boolean;  // Should we preserve phrases?
  preserveImportantPrepositions?: boolean; // Keep prepositions in phrases
}

/**
 * Important prepositions that should be preserved in phrases
 */
const IMPORTANT_PREPOSITIONS_IN_PHRASES = new Set([
  'on', 'over', 'with', 'for', 'to', 'from', 'by', 'at'
]);

/**
 * Check if a word is a stop word
 */
export function isStopWord(word: string, context?: FilterContext): boolean {
  const lower = word.toLowerCase();
  
  // Always remove articles
  if (STOP_WORDS.articles.has(lower)) return true;
  
  // Always remove basic stop words
  if (STOP_WORDS.basic.has(lower)) return true;
  
  // Context-aware filtering
  if (context) {
    // In questions, remove question words, possessives, and copulas
    if (context.isQuestion) {
      if (STOP_WORDS.question_words.has(lower)) return true;
      if (STOP_WORDS.possessive_determiners.has(lower)) return true;
      if (STOP_WORDS.copula_verbs.has(lower)) return true;
    }
    
    // Preserve important prepositions in phrases
    if (context.preserveImportantPrepositions && 
        context.preservePhrases &&
        IMPORTANT_PREPOSITIONS_IN_PHRASES.has(lower)) {
      return false;
    }
  }
  
  // Default: remove common stop words
  return ALL_STOP_WORDS.has(lower);
}

/**
 * Filter stop words from an array of words with context
 */
export function filterStopWords(
  words: string[],
  context?: FilterContext
): string[] {
  return words.filter(word => {
    const lower = word.toLowerCase();
    return !isStopWord(lower, context);
  });
}

/**
 * Get stop words for a specific category
 */
export function getStopWords(category: StopWordCategory): Set<string> {
  return STOP_WORDS[category];
}

/**
 * Get all stop words (for backward compatibility)
 */
export function getAllStopWords(): Set<string> {
  return ALL_STOP_WORDS;
}

/**
 * Check if a word is in a specific category
 */
export function isInCategory(word: string, category: StopWordCategory): boolean {
  return STOP_WORDS[category].has(word.toLowerCase());
}

/**
 * Get categories for a word (useful for debugging)
 */
export function getCategoriesForWord(word: string): StopWordCategory[] {
  const lower = word.toLowerCase();
  const categories: StopWordCategory[] = [];
  
  for (const [category, words] of Object.entries(STOP_WORDS)) {
    if (words.has(lower)) {
      categories.push(category as StopWordCategory);
    }
  }
  
  return categories;
}

