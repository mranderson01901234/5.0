/**
 * Web Search Diagnostic Tool
 * Identifies why web search is triggering on inappropriate queries
 */

interface WebSearchDiagnostic {
  query: string;
  shouldTriggerSearch: boolean;
  actuallyTriggered: boolean;
  reasoning: string;
  issues: string[];
}

export class WebSearchDebugger {
  
  // Test queries that should NOT trigger web search
  private noSearchQueries = [
    "Hello",
    "How are you?", 
    "What's 2+2?",
    "Tell me more about that",
    "Can you explain that differently?",
    "Thanks for the help",
    "I'm learning React",
    "Help me debug this code",
    "What's your favorite color?",
    "Continue our conversation",
    "That makes sense"
  ];

  // Test queries that SHOULD trigger web search
  private shouldSearchQueries = [
    "What's the latest news about AI?",
    "Current stock price of Tesla",
    "What happened in the 2024 election?", 
    "Recent developments in quantum computing",
    "Today's weather forecast",
    "Latest iPhone release date",
    "Current events in Ukraine",
    "What's trending on social media?",
    "Recent NBA game results",
    "Today's cryptocurrency prices"
  ];

  /**
   * Analyze what triggers web search in your current implementation
   */
  analyzeWebSearchTriggers(): void {
    console.log('🔍 WEB SEARCH TRIGGER ANALYSIS\n');
    
    console.log('=== QUERIES THAT SHOULD NOT TRIGGER SEARCH ===');
    this.noSearchQueries.forEach(query => {
      const analysis = this.analyzeQuery(query, false);
      console.log(`"${query}"`);
      console.log(`  Should search: ${analysis.shouldTriggerSearch}`);
      console.log(`  Reasoning: ${analysis.reasoning}`);
      if (analysis.issues.length > 0) {
        console.log(`  ⚠️  Issues: ${analysis.issues.join(', ')}`);
      }
      console.log('');
    });

    console.log('=== QUERIES THAT SHOULD TRIGGER SEARCH ===');
    this.shouldSearchQueries.forEach(query => {
      const analysis = this.analyzeQuery(query, true);
      console.log(`"${query}"`);
      console.log(`  Should search: ${analysis.shouldTriggerSearch}`);
      console.log(`  Reasoning: ${analysis.reasoning}`);
      if (analysis.issues.length > 0) {
        console.log(`  ⚠️  Issues: ${analysis.issues.join(', ')}`);
      }
      console.log('');
    });
  }

  /**
   * Implement improved web search detection logic
   */
  private analyzeQuery(query: string, expectedToTrigger: boolean): WebSearchDiagnostic {
    const shouldTrigger = this.shouldTriggerWebSearch(query);
    const issues: string[] = [];

    if (shouldTrigger !== expectedToTrigger) {
      issues.push(`Detection mismatch: expected ${expectedToTrigger}, got ${shouldTrigger}`);
    }

    return {
      query,
      shouldTriggerSearch: shouldTrigger,
      actuallyTriggered: false, // We'll test this separately
      reasoning: this.getSearchReasoning(query),
      issues
    };
  }

  /**
   * Improved web search detection logic
   */
  private shouldTriggerWebSearch(query: string): boolean {
    const text = query.toLowerCase().trim();
    
    // Skip very short queries
    if (text.length < 5) {
      return false;
    }

    // Skip common conversational patterns
    if (this.isConversationalQuery(text)) {
      return false;
    }

    // Skip personal/subjective questions
    if (this.isPersonalQuery(text)) {
      return false;
    }

    // Skip follow-up questions without context
    if (this.isFollowUpQuery(text)) {
      return false;
    }

    // Skip coding/technical help that doesn't need current info
    if (this.isTechnicalHelpQuery(text)) {
      return false;
    }

    // Trigger for temporal queries
    if (this.hasTemporalIndicators(text)) {
      return true;
    }

    // Trigger for current events
    if (this.isCurrentEventsQuery(text)) {
      return true;
    }

    // Trigger for market/price queries
    if (this.isMarketDataQuery(text)) {
      return true;
    }

    // Trigger for news/trending topics
    if (this.isNewsQuery(text)) {
      return true;
    }

    // Default: no search for general knowledge
    return false;
  }

  private isConversationalQuery(text: string): boolean {
    const conversationalPatterns = [
      /^(hello|hi|hey|good morning|good afternoon)/,
      /^(how are you|what's up|how's it going)/,
      /^(thanks|thank you|that's helpful)/,
      /^(ok|okay|got it|i see|that makes sense)/,
      /^(tell me more|can you explain|help me understand)/,
      /^(continue|go on|what else)/,
      /what's your (opinion|thought|favorite)/,
      /how do you (feel|think)/
    ];

    return conversationalPatterns.some(pattern => pattern.test(text));
  }

  private isPersonalQuery(text: string): boolean {
    const personalPatterns = [
      /what's your/,
      /do you (like|prefer|think|believe)/,
      /are you/,
      /can you (help|assist|explain)/,
      /i (am|was|will|would|like|love|want|need)/,
      /my (problem|issue|question|code|project)/
    ];

    return personalPatterns.some(pattern => pattern.test(text));
  }

  private isFollowUpQuery(text: string): boolean {
    const followUpPatterns = [
      /^(that|this|it)/,
      /tell me more/,
      /what about/,
      /how about/,
      /can you (explain|elaborate)/,
      /^(and|but|however|also)/
    ];

    return followUpPatterns.some(pattern => pattern.test(text));
  }

  private isTechnicalHelpQuery(text: string): boolean {
    const technicalPatterns = [
      /how do i/,
      /how to/,
      /help me (with|debug|fix|create|build)/,
      /explain (how|why|what)/,
      /what is (the|a)/,
      /(error|bug|problem|issue) (with|in)/,
      /code (review|help|assistance)/
    ];

    return technicalPatterns.some(pattern => pattern.test(text));
  }

  private hasTemporalIndicators(text: string): boolean {
    // Only trigger if temporal words are combined with specific context indicators
    const temporalWords = [
      'today', 'tonight', 'yesterday', 'tomorrow',
      'this week', 'last week', 'next week',
      'this month', 'last month', 'next month',
      'this year', 'last year', 'next year',
      'recent', 'recently', 'lately', 'current', 'currently',
      'latest', 'newest', 'updated', 'now', 'right now'
    ];

    const hasTemporalWord = temporalWords.some(word => text.includes(word));
    
    // Only trigger if combined with information-seeking patterns
    const infoSeekingPatterns = [
      /what'?s (happening|trending|new)/,
      /what (is|are|was|were)/,
      /how (is|are|was|were)/,
      /latest (developments|updates|news)/,
      /current (events|situation|status)/
    ];
    
    return hasTemporalWord && infoSeekingPatterns.some(pattern => pattern.test(text));
  }

  private isCurrentEventsQuery(text: string): boolean {
    const currentEventsWords = [
      'news', 'breaking', 'headline', 'announced', 'happening',
      'event', 'events', 'update', 'development', 'situation',
      'crisis', 'election', 'politics', 'government', 'president',
      'war', 'conflict', 'protest', 'disaster', 'emergency'
    ];

    return currentEventsWords.some(word => text.includes(word));
  }

  private isMarketDataQuery(text: string): boolean {
    const marketWords = [
      'stock price', 'stock market', 'cryptocurrency', 'bitcoin',
      'trading', 'nasdaq', 'dow jones', 's&p 500',
      'market cap', 'earnings', 'ipo', 'investment',
      'currency', 'exchange rate', 'inflation'
    ];

    return marketWords.some(word => text.includes(word));
  }

  private isNewsQuery(text: string): boolean {
    const newsPatterns = [
      /what's (happening|trending|new)/,
      /latest (news|updates|information)/,
      /(breaking|recent) (news|story)/,
      /what happened (with|to|in)/,
      /news about/,
      /current (situation|status)/
    ];

    return newsPatterns.some(pattern => pattern.test(text));
  }

  private getSearchReasoning(query: string): string {
    const text = query.toLowerCase();
    
    if (this.isConversationalQuery(text)) {
      return "Conversational query - no search needed";
    }
    if (this.isPersonalQuery(text)) {
      return "Personal/subjective query - no search needed";
    }
    if (this.isFollowUpQuery(text)) {
      return "Follow-up query - relies on conversation context";
    }
    if (this.isTechnicalHelpQuery(text)) {
      return "Technical help - general knowledge sufficient";
    }
    if (this.hasTemporalIndicators(text)) {
      return "Contains temporal indicators - needs current info";
    }
    if (this.isCurrentEventsQuery(text)) {
      return "Current events query - needs latest information";
    }
    if (this.isMarketDataQuery(text)) {
      return "Market data query - needs real-time information";
    }
    if (this.isNewsQuery(text)) {
      return "News query - needs current information";
    }
    
    return "General knowledge query - no search needed";
  }

  /**
   * Generate configuration recommendations
   */
  generateRecommendations(): void {
    console.log('💡 WEB SEARCH CONFIGURATION RECOMMENDATIONS\n');
    
    console.log('=== IMMEDIATE FIXES ===');
    console.log('1. Add conversational query detection');
    console.log('2. Skip search for follow-up questions');
    console.log('3. Add temporal indicator requirements');
    console.log('4. Implement query length minimums');
    console.log('');

    console.log('=== SUGGESTED LOGIC ===');
    console.log('```javascript');
    console.log('function needsWebSearch(query, analysis) {');
    console.log('  // Skip short queries');
    console.log('  if (query.length < 10) return false;');
    console.log('  ');
    console.log('  // Skip conversational queries');
    console.log('  if (analysis.intent === "conversational_followup") return false;');
    console.log('  ');
    console.log('  // Only search for explicit current info needs');
    console.log('  if (analysis.intent === "needs_web_search") return true;');
    console.log('  ');
    console.log('  // Temporal indicators');
    console.log('  if (hasTemporalIndicators(query)) return true;');
    console.log('  ');
    console.log('  return false; // Default: no search');
    console.log('}');
    console.log('```');
  }

  /**
   * Get the improved detection logic for integration
   */
  getImprovedLogic(): string {
    return this.shouldTriggerWebSearch.toString();
  }
}

// Export for direct use
export function runWebSearchDebugger() {
  const wsDebugger = new WebSearchDebugger();
  wsDebugger.analyzeWebSearchTriggers();
  wsDebugger.generateRecommendations();
}

