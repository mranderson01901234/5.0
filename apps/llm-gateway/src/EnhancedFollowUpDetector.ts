/**
 * Enhanced Follow-Up Detector
 * Fixes the limitation where "How do I handle state?" (5 words) isn't detected as follow-up
 */

export class EnhancedFollowUpDetector {

  /**
   * Improved follow-up detection that catches more patterns
   */
  static isFollowUpQuery(
    query: string, 
    conversationHistory?: Array<{ role: string; content: string }>
  ): boolean {
    
    if (!conversationHistory || conversationHistory.length < 2) {
      return false;
    }

    const text = query.toLowerCase().trim();
    const words = text.split(' ');

    // 1. Short queries (≤3 words) - existing logic
    if (words.length <= 3) {
      return true;
    }

    // 2. NEW: Question words + conversation context (≤6 words)
    if (words.length <= 6 && this.hasQuestionWordPattern(text)) {
      return this.hasRelevantContext(text, conversationHistory);
    }

    // 3. NEW: "How do/can/should I" patterns
    if (this.hasHowToPattern(text)) {
      return this.hasRelevantContext(text, conversationHistory);
    }

    // 4. Explicit follow-up indicators
    if (this.hasFollowUpIndicators(text)) {
      return true;
    }

    // 5. Reference pronouns
    if (this.hasReferencePronouns(text)) {
      return true;
    }

    return false;
  }

  /**
   * Detect question word patterns that could be follow-ups
   */
  private static hasQuestionWordPattern(text: string): boolean {
    const questionPatterns = [
      /^(what|where|when|why|who|which)\s+(is|are|do|does|can|should|would)/,
      /^how\s+(do|can|should|would|is|are)/,
      /^(is|are|can|should|would|will)\s+(it|this|that|there)/
    ];

    return questionPatterns.some(pattern => pattern.test(text));
  }

  /**
   * Detect "how to" patterns that are likely follow-ups in conversation
   */
  private static hasHowToPattern(text: string): boolean {
    const howPatterns = [
      /^how\s+(do|can|should)\s+i\s+/,
      /^what\s+(should|can|do)\s+i\s+/,
      /^where\s+(do|can|should)\s+i\s+/,
      /^when\s+(should|do)\s+i\s+/
    ];

    return howPatterns.some(pattern => pattern.test(text));
  }

  /**
   * Check if query has relevant context in conversation history
   */
  private static hasRelevantContext(query: string, history: Array<{ role: string; content: string }>): boolean {
    const queryWords = this.extractKeywords(query);
    const lastFewMessages = history.slice(-4); // Check last 4 messages
    
    // Look for shared keywords or topics
    for (const message of lastFewMessages) {
      const messageWords = this.extractKeywords(message.content);
      const sharedWords = queryWords.filter(word => messageWords.includes(word));
      
      // If we share significant keywords, it's likely a follow-up
      if (sharedWords.length >= 1) {
        return true;
      }
    }

    return false;
  }

  /**
   * Detect explicit follow-up indicators
   */
  private static hasFollowUpIndicators(text: string): boolean {
    const followUpPatterns = [
      /^(and|but|also|additionally|furthermore)/,
      /^(tell me more|explain|clarify|elaborate)/,
      /^(what about|how about|what if)/,
      /^(can you|could you|would you)\s+(explain|tell|show)/,
      /^(continue|keep going|go on)/
    ];

    return followUpPatterns.some(pattern => pattern.test(text));
  }

  /**
   * Detect reference pronouns that indicate follow-up
   */
  private static hasReferencePronouns(text: string): boolean {
    const pronounPatterns = [
      /^(that|this|it|they|them|those|these)\s/,
      /\b(that|this|it)\s+(is|was|seems|looks|sounds)/,
      /\b(them|those|these)\s+(are|were|seem|look)/
    ];

    return pronounPatterns.some(pattern => pattern.test(text));
  }

  /**
   * Extract meaningful keywords from text
   */
  private static extractKeywords(text: string): string[] {
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
      'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
      'will', 'would', 'could', 'should', 'may', 'might', 'can', 'i', 'you', 'he', 'she', 'it', 'we', 'they'
    ]);

    return text.toLowerCase()
      .replace(/[^\w\s]/g, '') // Remove punctuation
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word));
  }

  /**
   * Get instruction for follow-up questions (for compatibility with existing FollowUpDetector)
   */
  static getFollowUpInstruction(): string {
    return `FOLLOW-UP DETECTED: This is a continuation of the previous topic. Build on the context naturally and keep your response brief and focused. Do not repeat information already provided. Add new relevant details in 2-3 sentences max.`;
  }
}

