/**
 * Query Analyzer - Detects query complexity and characteristics
 * Used for dynamic verbosity scaling and response guidance
 */

export type QueryComplexity = 'simple' | 'moderate' | 'complex';
export type QueryIntent = 'factual' | 'explanatory' | 'discussion' | 'action' | 'memory_list' | 'memory_save' | 'conversational_followup' | 'needs_web_search';

export interface QueryAnalysis {
  complexity: QueryComplexity;
  intent: QueryIntent;
  wordCount: number;
  requiresDetail: boolean;
  suggestsFollowUp: boolean;
}

/**
 * Analyze query to determine complexity and intent
 */
export function analyzeQuery(query: string): QueryAnalysis {
  const trimmed = query.trim();
  const wordCount = trimmed.split(/\s+/).filter(w => w.length > 0).length;
  
  // Detect question words that require explanation
  const explanationTriggers = /\b(how|why|explain|analyze|compare|contrast|what's the difference|difference between|break down|walk through)\b/i;
  
  // Detect technical or complex topics
  const technicalTerms = /\b(algorithm|architecture|pattern|framework|implementation|design|strategy|mechanism|process|workflow)\b/i;
  
  // Detect discussion prompts
  const discussionTriggers = /\b(opinion|think|believe|consider|discuss|debate|pros and cons|advantages|disadvantages)\b/i;
  
  // Detect action requests
  const actionTriggers = /\b(show|demonstrate|create|build|write|code|example|implement|do|make)\b/i;
  
  // Detect memory listing requests
  const memoryListTriggers = /(what do you remember|what memories do you have|list memories|show memories|what'?s saved|what is saved|what information do you have|recall what|what conversations do you remember)/i;
  
  // Detect explicit memory save requests
  // Matches patterns like:
  // - "remember that my favorite color is blue"
  // - "my favorite color is blue - remember that for me"
  // - "can you remember that idea"
  // - "remember this"
  // - "remember 'specific thing'"
  // Excludes questions like "do you remember" unless followed by request words
  const memorySaveTriggers = /\b(remember|save|store|memorize|keep|note)\s+(this|that|it|my|I|me|for me|in mind|['"]|\w+)|(can you|could you|please)\s+(remember|save|store|memorize|keep|note)|^\s*(remember|save|store|memorize|keep|note)/i;
  
  // Detect conversational follow-up patterns (contextual questions that shouldn't trigger web search)
  const followUpTriggers = /\b(which one|what one|the (first|second|third|last) one|what about|how about|which|assume|expect|probably|likely|what would|how would|why would|can you|could you|should I|would I)\s+/i;
  const contextualPhrases = /\b(that|this|it) (sounds|seems|appears|looks|is)\b|\b(interesting|good|nice|cool|great|makes sense)\s+(but|however|though)\b/i;
  
  // Detect web search needs (explicit requests for current/recent information)
  // STRENGTHENED: More aggressive detection for temporal queries
  const webSearchTriggers = /\b(search|find|look up|breaking|news|happening (right )?now|just (announced|released|happened))\b/i;
  
  // STRENGTHENED: Enhanced patterns for temporal/current information requests
  // Patterns that indicate need for recent/current information
  const temporalIndicators = /\b(latest|recent|current|new|updates?|developments?|announcements?|releases?|changes?|trends?)\b/i;
  
  // Year-based patterns (2024, 2025, etc.) - strongly indicate need for current info
  const yearPattern = /\b20[2-9]\d\b/; // Matches 2020-2099
  
  // Combined patterns: temporal word + topic OR year + temporal word
  const temporalTopicPattern = temporalIndicators.test(trimmed) && trimmed.length > 15;
  
  // Year + temporal indicators (e.g., "latest React features in 2025", "React 2025 updates")
  const yearTemporalPattern = yearPattern.test(trimmed) && temporalIndicators.test(trimmed);
  
  // Year alone in context of technology/topics (e.g., "React features 2025")
  const yearInTechContext = yearPattern.test(trimmed) && (
    /\b(features?|updates?|changes?|version|release|announcement|news|research|developments?|safety)\b/i.test(trimmed) ||
    /\b(in|for|during|this|current)\s+(year|20\d{2})\b/i.test(trimmed)
  );
  
  // Only trigger search if year is combined with temporal words that indicate recency
  const recentTimeIndicators = /\b(latest|recent|current|new|just announced|just released).*?\b20\d{2}\b|\b20\d{2}\b.*?(latest|recent|current|new|announcements?|developments?|updates?)\b/i;
  
  // Detect simple factual queries
  const simplePatterns = [
    /^(what|who|when|where|which)\s+(is|are|was|were)\s+\w+\s*[?]?$/i, // "What is X?"
    /^(what|who|when|where|which)\s+\w+\s*[?]?$/i, // "What X?"
    /^is\s+\w+\s*[?]?$/i, // "Is X?"
    /^(yes|no|maybe)\s*[?]?$/i,
  ];
  
  // Detect complexity indicators
  const hasQuestionWords = explanationTriggers.test(trimmed);
  const hasTechnicalTerms = technicalTerms.test(trimmed);
  const hasMultipleQuestions = (trimmed.match(/\?/g) || []).length > 1;
  const hasLongSentence = trimmed.split(/[.!?]/).some(s => s.trim().split(/\s+/).length > 20);
  
  // Determine intent
  let intent: QueryIntent = 'factual';
  if (memorySaveTriggers.test(trimmed)) {
    intent = 'memory_save';
  } else if (memoryListTriggers.test(trimmed)) {
    intent = 'memory_list';
  } else if (
    webSearchTriggers.test(trimmed) || 
    recentTimeIndicators.test(trimmed) ||
    temporalTopicPattern ||
    yearTemporalPattern ||
    yearInTechContext
  ) {
    // STRENGTHENED: More aggressive web search detection for temporal queries
    // Check if explicit search request (must come before conversational follow-up check)
    intent = 'needs_web_search';
  } else if (followUpTriggers.test(trimmed) || contextualPhrases.test(trimmed)) {
    // Contextual follow-up that references previous conversation
    intent = 'conversational_followup';
  } else if (discussionTriggers.test(trimmed)) {
    intent = 'discussion';
  } else if (actionTriggers.test(trimmed)) {
    intent = 'action';
  } else if (explanationTriggers.test(trimmed) || hasTechnicalTerms) {
    intent = 'explanatory';
  }
  
  // Determine complexity
  let complexity: QueryComplexity = 'moderate';
  
  if (simplePatterns.some(p => p.test(trimmed)) && wordCount < 8 && !hasQuestionWords && !hasTechnicalTerms) {
    complexity = 'simple';
  } else if (hasTechnicalTerms || hasMultipleQuestions || hasLongSentence || wordCount > 20 || explanationTriggers.test(trimmed)) {
    complexity = 'complex';
  }
  
  // Determine if detail is required
  const requiresDetail = hasTechnicalTerms || hasQuestionWords || complexity === 'complex' || intent === 'explanatory';
  
  // Determine if follow-up would be natural
  // Follow-ups make sense for comprehensive topics that have natural extensions
  const suggestsFollowUp = (
    complexity === 'complex' ||
    (requiresDetail && wordCount > 10) ||
    intent === 'discussion' ||
    hasTechnicalTerms
  );
  
  return {
    complexity,
    intent,
    wordCount,
    requiresDetail,
    suggestsFollowUp,
  };
}

/**
 * Get verbosity instruction based on query analysis
 */
export function getVerbosityInstruction(analysis: QueryAnalysis): string | null {
  switch (analysis.complexity) {
    case 'simple':
      return 'Provide a brief, direct answer (1-2 sentences).';
    case 'moderate':
      return 'Provide a balanced explanation (2-3 paragraphs).';
    case 'complex':
      return 'Provide a comprehensive explanation with examples and context as needed.';
    default:
      return null;
  }
}

/**
 * Get follow-up guidance based on query analysis
 */
export function getFollowUpGuidance(analysis: QueryAnalysis): string | null {
  if (!analysis.suggestsFollowUp) {
    return null;
  }
  
  // Only suggest follow-ups for comprehensive topics
  return 'After comprehensive answers (200+ words), you may optionally suggest a natural follow-up direction related to the topic (e.g., "Would you like to dive deeper into [specific aspect]?"). Only add this when it genuinely adds value and feels natural—not after every response.';
}

