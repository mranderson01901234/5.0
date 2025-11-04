/**
 * PatternMatcher - Efficient keyword-based query classification
 * Uses pre-defined patterns to categorize user queries
 */

export type QueryCategory =
  | 'code'
  | 'design'
  | 'explanation'
  | 'analysis'
  | 'creative'
  | 'technical'
  | 'debugging'
  | 'optimization'
  | 'research'
  | 'image'
  | 'general';

export interface QueryContext {
  category: QueryCategory;
  complexity: 'simple' | 'moderate' | 'complex';
  keywords: string[];
  entities: string[];
  intent: string;
}

interface PatternDefinition {
  keywords: string[];
  patterns: RegExp[];
  weight: number;
}

export class PatternMatcher {
  private patterns: Record<QueryCategory, PatternDefinition> = {
    code: {
      keywords: [
        'function', 'class', 'component', 'implement', 'code', 'write',
        'api', 'endpoint', 'database', 'query', 'algorithm', 'method',
        'variable', 'array', 'object', 'loop', 'conditional', 'return',
        'async', 'await', 'promise', 'callback', 'hook', 'state'
      ],
      patterns: [
        /\b(write|create|build|implement)\s+(a|an|the)?\s*(function|class|component|api|hook)/i,
        /\bhow\s+to\s+(code|program|write|implement)/i,
        /\b(refactor|optimize|fix)\s+.*(code|function|component)/i
      ],
      weight: 1.0
    },

    debugging: {
      keywords: [
        'error', 'bug', 'issue', 'problem', 'fix', 'broken', 'not working',
        'crash', 'fail', 'exception', 'undefined', 'null', 'debug',
        'trace', 'stack', 'console', 'warning', 'solve'
      ],
      patterns: [
        /\b(fix|solve|debug|resolve)\s+(the|this|my)?\s*(error|bug|issue|problem)/i,
        /\bwhy\s+(is|does|doesn't|isn't|won't)\b/i,
        /\b(not\s+working|broken|failing|crashing)/i
      ],
      weight: 1.0
    },

    design: {
      keywords: [
        'design', 'architecture', 'structure', 'pattern', 'organize',
        'layout', 'ui', 'ux', 'interface', 'component', 'system',
        'schema', 'model', 'diagram', 'plan', 'approach'
      ],
      patterns: [
        /\b(design|architect|structure|organize)\s+(a|an|the)?\s*system/i,
        /\bhow\s+should\s+i\s+(design|structure|organize)/i,
        /\b(best|good)\s+(design|architecture|approach|pattern)/i
      ],
      weight: 1.0
    },

    explanation: {
      keywords: [
        'explain', 'what', 'how', 'why', 'describe', 'understand',
        'clarify', 'meaning', 'definition', 'concept', 'tell me',
        'help me understand', 'difference between', 'work'
      ],
      patterns: [
        /\b(what|how|why)\s+(is|are|does|do)\b/i,
        /\bexplain\s+(the|this|that|how|why)/i,
        /\b(help\s+me\s+understand|tell\s+me\s+about)/i,
        /\bdifference\s+between\b/i
      ],
      weight: 0.9
    },

    analysis: {
      keywords: [
        'analyze', 'evaluate', 'compare', 'review', 'assess',
        'investigate', 'examine', 'study', 'research', 'pros and cons',
        'trade-offs', 'performance', 'security', 'scalability'
      ],
      patterns: [
        /\b(analyze|evaluate|compare|assess|review)\b/i,
        /\bpros\s+and\s+cons\b/i,
        /\b(trade-?offs|advantages|disadvantages)\b/i,
        /\b(which|what)\s+(is\s+)?(better|best|faster|more\s+efficient)/i
      ],
      weight: 1.0
    },

    creative: {
      keywords: [
        'creative', 'story', 'write', 'generate', 'brainstorm',
        'idea', 'content', 'article', 'blog', 'narrative',
        'imagine', 'invent', 'compose', 'draft', 'suggest'
      ],
      patterns: [
        /\b(write|create|generate)\s+(a|an|the)?\s*(story|article|blog|content)/i,
        /\b(brainstorm|suggest|come\s+up\s+with)\s+.*(ideas?|names?)/i,
        /\b(creative|imaginative|unique)\b/i
      ],
      weight: 0.8
    },

    technical: {
      keywords: [
        'configure', 'setup', 'install', 'deploy', 'build',
        'compile', 'run', 'execute', 'environment', 'server',
        'docker', 'kubernetes', 'aws', 'cloud', 'devops'
      ],
      patterns: [
        /\b(setup|configure|install|deploy)\s+(a|an|the)?\b/i,
        /\bhow\s+to\s+(run|execute|build|compile)/i,
        /\b(environment|configuration|deployment)\b/i
      ],
      weight: 1.0
    },

    optimization: {
      keywords: [
        'optimize', 'improve', 'performance', 'faster', 'efficient',
        'speed up', 'reduce', 'minimize', 'enhance', 'better',
        'refactor', 'streamline', 'cache', 'memory'
      ],
      patterns: [
        /\b(optimize|improve|enhance|speed\s+up)\b/i,
        /\bmake\s+.*(faster|better|more\s+efficient)/i,
        /\b(reduce|minimize|decrease)\s+.*(time|memory|size)/i
      ],
      weight: 1.0
    },

    research: {
      keywords: [
        'research', 'find', 'search', 'look up', 'information',
        'data', 'statistics', 'facts', 'source', 'reference',
        'learn', 'discover', 'explore', 'investigate'
      ],
      patterns: [
        /\b(find|search|look\s+up|research)\s+(information|data|facts)/i,
        /\bwhat\s+(are\s+)?the\s+(latest|recent|current)/i,
        /\b(tell\s+me\s+about|information\s+on)\b/i
      ],
      weight: 0.9
    },

    image: {
      keywords: [
        'image', 'picture', 'photo', 'generate', 'create', 'draw',
        'render', 'illustration', 'visual', 'graphic', 'logo',
        'mascot', 'icon', 'artwork', 'sketch', 'diagram'
      ],
      patterns: [
        /\b(generate|create|make|draw|render)\s+(a|an|the|me|an?)\s+(image|picture|photo|illustration|drawing|logo|graphic)/i,
        /\b(show|display|give|give me)\s+(a|an|the|me)?\s+(image|picture|photo|illustration|drawing|logo|graphic)/i,
        /\b(image|picture|photo|illustration|drawing|logo|graphic)\s+(of|for|with|showing)/i
      ],
      weight: 1.0
    },

    general: {
      keywords: [],
      patterns: [],
      weight: 0.5
    }
  };

  /**
   * Classify a user query into a category with context
   */
  classify(query: string): QueryContext {
    const normalizedQuery = query.toLowerCase().trim();
    const scores: Record<QueryCategory, number> = {} as Record<QueryCategory, number>;

    // Calculate scores for each category
    for (const [category, definition] of Object.entries(this.patterns)) {
      if (category === 'general') continue;

      let score = 0;

      // Keyword matching
      const keywordMatches = definition.keywords.filter(keyword =>
        normalizedQuery.includes(keyword.toLowerCase())
      );
      score += keywordMatches.length * definition.weight;

      // Pattern matching (higher weight)
      const patternMatches = definition.patterns.filter(pattern =>
        pattern.test(query)
      );
      score += patternMatches.length * definition.weight * 2;

      scores[category as QueryCategory] = score;
    }

    // Find best category
    const bestCategory = Object.entries(scores).reduce((best, [cat, score]) =>
      score > best.score ? { category: cat as QueryCategory, score } : best,
      { category: 'general' as QueryCategory, score: 0 }
    );

    const category = bestCategory.score > 0 ? bestCategory.category : 'general';

    return {
      category,
      complexity: this.estimateComplexity(query),
      keywords: this.extractKeywords(query, category),
      entities: this.extractEntities(query),
      intent: this.detectIntent(query)
    };
  }

  /**
   * Estimate query complexity based on length and structure
   */
  private estimateComplexity(query: string): 'simple' | 'moderate' | 'complex' {
    const wordCount = query.split(/\s+/).length;
    const hasMultipleSentences = query.split(/[.!?]+/).length > 2;
    const hasComplexStructure = /\b(and|but|however|moreover|additionally)\b/i.test(query);

    if (wordCount < 8 && !hasMultipleSentences) return 'simple';
    if (wordCount > 30 || hasComplexStructure) return 'complex';
    return 'moderate';
  }

  /**
   * Extract relevant keywords from query based on category
   */
  private extractKeywords(query: string, category: QueryCategory): string[] {
    const normalizedQuery = query.toLowerCase();
    const categoryPattern = this.patterns[category];

    if (!categoryPattern) return [];

    return categoryPattern.keywords
      .filter(keyword => normalizedQuery.includes(keyword.toLowerCase()))
      .slice(0, 5); // Limit to top 5 keywords
  }

  /**
   * Extract technical entities (languages, frameworks, tools)
   */
  private extractEntities(query: string): string[] {
    const entityPatterns = [
      // Programming languages
      /\b(javascript|typescript|python|java|rust|go|c\+\+|ruby|php|swift)\b/i,
      // Frameworks
      /\b(react|vue|angular|svelte|next\.?js|express|django|flask|spring)\b/i,
      // Tools
      /\b(git|docker|kubernetes|webpack|vite|npm|yarn|pnpm)\b/i,
      // Databases
      /\b(mongodb|postgresql|mysql|redis|elasticsearch)\b/i
    ];

    const entities: string[] = [];
    for (const pattern of entityPatterns) {
      const matches = query.match(pattern);
      if (matches) entities.push(...matches.map(m => m.toLowerCase()));
    }

    return [...new Set(entities)]; // Remove duplicates
  }

  /**
   * Detect primary intent of the query
   */
  private detectIntent(query: string): string {
    const intentPatterns: Record<string, RegExp[]> = {
      'create': [/\b(create|build|make|generate|write)\b/i],
      'fix': [/\b(fix|solve|debug|repair|resolve)\b/i],
      'explain': [/\b(explain|describe|what|how|why|tell)\b/i],
      'compare': [/\b(compare|difference|vs|versus|better)\b/i],
      'optimize': [/\b(optimize|improve|enhance|speed up|faster)\b/i],
      'learn': [/\b(learn|understand|teach|show me)\b/i]
    };

    for (const [intent, patterns] of Object.entries(intentPatterns)) {
      if (patterns.some(pattern => pattern.test(query))) {
        return intent;
      }
    }

    return 'general';
  }
}
