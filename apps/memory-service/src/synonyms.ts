/**
 * Synonym Expansion Control for Memory Search
 * Provides controlled synonym expansion to reduce false positives
 * 
 * Phase 5: Query Expansion Control
 */

export type ExpansionMode = 'strict' | 'normal' | 'aggressive';

/**
 * High-confidence synonym mappings
 * Only expand synonyms that are semantically very close
 */
const SYNONYM_MAP: Record<string, string[]> = {
  // Preference synonyms
  'favorite': ['preferred', 'liked', 'favored'],
  'prefer': ['like', 'favor', 'choose'],
  'like': ['prefer', 'enjoy', 'appreciate'],
  
  // Work/project synonyms
  'working': ['developing', 'building', 'creating'],
  'project': ['task', 'work', 'assignment'],
  'current': ['ongoing', 'active', 'present'],
  
  // Language synonyms
  'programming': ['coding', 'development'],
  'coding': ['programming', 'development'],
  'language': ['programming language', 'tech stack'],
  
  // Design synonyms
  'design': ['layout', 'style', 'interface'],
  'ui': ['user interface', 'interface', 'design'],
  'dark mode': ['dark theme', 'dark interface'],
  
  // Goal/deadline synonyms
  'goal': ['objective', 'target', 'aim'],
  'deadline': ['due date', 'target date', 'completion date'],
  'finish': ['complete', 'finalize', 'wrap up'],
  'complete': ['finish', 'finalize', 'accomplish'],
  
  // Color synonyms
  'color': ['colour', 'shade', 'hue'],
  'blue': ['azure', 'navy'],
};

/**
 * Get synonyms for a term based on expansion mode
 */
export function getSynonyms(term: string, mode: ExpansionMode): string[] {
  const lowerTerm = term.toLowerCase();
  
  if (mode === 'strict') {
    // No expansion in strict mode
    return [];
  }
  
  const synonyms = SYNONYM_MAP[lowerTerm] || [];
  
  if (mode === 'normal') {
    // Only return high-confidence synonyms (first 2)
    return synonyms.slice(0, 2);
  }
  
  // Aggressive mode: return all synonyms
  return synonyms;
}

/**
 * Expand query terms with synonyms
 */
export function expandQueryTerms(
  terms: string[],
  mode: ExpansionMode
): string[] {
  if (mode === 'strict') {
    return terms; // No expansion
  }
  
  const expanded = new Set<string>(terms);
  
  for (const term of terms) {
    const synonyms = getSynonyms(term, mode);
    for (const synonym of synonyms) {
      expanded.add(synonym);
    }
  }
  
  return Array.from(expanded);
}

/**
 * Get semantic similarity threshold based on expansion mode
 * Stricter modes require higher similarity
 */
export function getSemanticThreshold(mode: ExpansionMode): number {
  switch (mode) {
    case 'strict':
      return 0.85; // Very strict - only very similar matches
    case 'normal':
      return 0.75; // Moderate - allow some variation
    case 'aggressive':
      return 0.65; // More lenient - allow more variation
    default:
      return 0.7; // Default
  }
}

/**
 * Get hybrid search weights based on expansion mode
 * Stricter modes favor keyword matching over semantic
 */
export function getHybridWeights(mode: ExpansionMode): {
  semanticWeight: number;
  keywordWeight: number;
} {
  switch (mode) {
    case 'strict':
      return {
        semanticWeight: 0.4, // Lower semantic weight
        keywordWeight: 0.6,   // Higher keyword weight
      };
    case 'normal':
      return {
        semanticWeight: 0.6, // Balanced
        keywordWeight: 0.4,
      };
    case 'aggressive':
      return {
        semanticWeight: 0.8, // Higher semantic weight
        keywordWeight: 0.2,  // Lower keyword weight
      };
    default:
      return {
        semanticWeight: 0.7,
        keywordWeight: 0.3,
      };
  }
}

/**
 * Check if a memory should be filtered based on expansion mode
 * In strict mode, require minimum keyword match
 */
export function shouldFilterMemory(
  memory: { content: string },
  queryTerms: string[],
  mode: ExpansionMode
): boolean {
  if (mode === 'strict') {
    // In strict mode, require at least one keyword match (exact word, not substring)
    const lowerContent = memory.content.toLowerCase();
    const contentWords = new Set(lowerContent.split(/\b\w+\b/g));
    
    // Check if any query term appears as a complete word
    const hasKeywordMatch = queryTerms.some(term => {
      const lowerTerm = term.toLowerCase();
      // Check for exact word match (word boundary)
      return contentWords.has(lowerTerm) || lowerContent.includes(lowerTerm);
    });
    
    // Also check for phrase matches (exact phrases are allowed)
    const hasPhraseMatch = queryTerms.some(term => {
      if (term.split(/\s+/).length > 1) {
        // It's a phrase, check for exact phrase match
        return lowerContent.includes(term.toLowerCase());
      }
      return false;
    });
    
    return !hasKeywordMatch && !hasPhraseMatch; // Filter if no keyword or phrase match
  }
  
  // Normal and aggressive modes allow semantic-only matches
  return false;
}

