/**
 * Web Search Query Optimizer
 * Improves search query construction for fresher, more relevant results
 */

export class WebSearchQueryOptimizer {

  /**
   * Optimize search query to get fresher results
   */
  static optimizeSearchQuery(originalQuery: string): string {
    const text = originalQuery.toLowerCase();
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().toLocaleString('default', { month: 'long' });

    let optimizedQuery = originalQuery;

    // Add current year for temporal queries
    if (this.needsCurrentYear(text)) {
      optimizedQuery += ` ${currentYear}`;
    }

    // Add "latest" for current info requests
    if (this.needsLatestModifier(text)) {
      optimizedQuery = `latest ${optimizedQuery}`;
    }

    // Add current month for very recent queries
    if (this.needsCurrentMonth(text)) {
      optimizedQuery += ` ${currentMonth} ${currentYear}`;
    }

    // Add "recent" for development/update queries
    if (this.needsRecentModifier(text)) {
      optimizedQuery = `recent ${optimizedQuery}`;
    }

    // Remove redundant words that might confuse search
    optimizedQuery = this.cleanupQuery(optimizedQuery);

    return optimizedQuery;
  }

  /**
   * Detect queries that need current year
   */
  private static needsCurrentYear(text: string): boolean {
    const yearIndicators = [
      'developments', 'updates', 'news', 'changes', 'trends',
      'research', 'breakthrough', 'innovation', 'release'
    ];

    const hasYearIndicator = yearIndicators.some(indicator => text.includes(indicator));
    const hasCurrentYear = text.includes(new Date().getFullYear().toString());

    return hasYearIndicator && !hasCurrentYear;
  }

  /**
   * Detect queries that need "latest" modifier
   */
  private static needsLatestModifier(text: string): boolean {
    const latestPatterns = [
      /\b(news|information|updates|data)\b/,
      /\b(price|rate|value|cost)\b/,
      /\b(status|situation|condition)\b/
    ];

    const alreadyHasLatest = /\b(latest|recent|current|new)\b/.test(text);

    return latestPatterns.some(pattern => pattern.test(text)) && !alreadyHasLatest;
  }

  /**
   * Detect queries that need current month
   */
  private static needsCurrentMonth(text: string): boolean {
    const recentIndicators = [
      'today', 'this week', 'recently', 'just announced',
      'breaking', 'just released', 'current'
    ];

    return recentIndicators.some(indicator => text.includes(indicator));
  }

  /**
   * Detect queries that need "recent" modifier
   */
  private static needsRecentModifier(text: string): boolean {
    const recentPatterns = [
      /\b(developments?|advances?|progress)\b/,
      /\b(research|studies?|findings?)\b/,
      /\b(changes?|updates?|improvements?)\b/
    ];

    return recentPatterns.some(pattern => pattern.test(text));
  }

  /**
   * Clean up redundant or confusing terms
   */
  private static cleanupQuery(query: string): string {
    return query
      // Remove question words that might confuse search engines
      .replace(/^(what|how|when|where|why|who)\s+(is|are|was|were|do|does|did)\s+/i, '')
      .replace(/^(tell me about|explain|describe)\s+/i, '')

      // Remove conversational elements
      .replace(/\b(please|thanks?|thank you)\b/gi, '')
      .replace(/\?+$/, '') // Remove question marks

      // Clean up spacing
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Add date filters for search APIs that support them
   */
  static addDateFilters(query: string): { query: string, dateFilter?: string } {
    const text = query.toLowerCase();
    const currentYear = new Date().getFullYear();

    // For very recent info, filter to last month
    if (/\b(today|this week|recently|breaking|just)\b/.test(text)) {
      const lastMonth = new Date();
      lastMonth.setMonth(lastMonth.getMonth() - 1);

      return {
        query,
        dateFilter: `after:${lastMonth.toISOString().split('T')[0]}`
      };
    }

    // For current year info, filter to current year
    if (text.includes(currentYear.toString()) || /\b(latest|current|recent)\b/.test(text)) {
      return {
        query,
        dateFilter: `after:${currentYear}-01-01`
      };
    }

    return { query };
  }

  /**
   * Test cases for optimization
   */
  static getTestCases(): Array<{original: string, expected: string}> {
    const currentYear = new Date().getFullYear();

    return [
      {
        original: "AI developments",
        expected: `recent AI developments ${currentYear}`
      },
      {
        original: "What's the latest news about quantum computing?",
        expected: `latest news about quantum computing ${currentYear}`
      },
      {
        original: "Tesla stock price",
        expected: `latest Tesla stock price`
      },
      {
        original: "Recent breakthrough in medicine",
        expected: `Recent breakthrough in medicine ${currentYear}`
      },
      {
        original: "What happened today in politics?",
        expected: `happened today in politics ${new Date().toLocaleString('default', { month: 'long' })} ${currentYear}`
      }
    ];
  }

  /**
   * Implementation for your search system
   */
  static getImplementationCode(): string {
    return `
// In your web search trigger code:

import { WebSearchQueryOptimizer } from './WebSearchQueryOptimizer.js';

// Before sending to search API:
const originalQuery = userMessage;
const optimizedQuery = WebSearchQueryOptimizer.optimizeSearchQuery(originalQuery);
const { query: finalQuery, dateFilter } = WebSearchQueryOptimizer.addDateFilters(optimizedQuery);

console.log(\`Original: "\${originalQuery}"\`);
console.log(\`Optimized: "\${finalQuery}"\`);
if (dateFilter) {
  console.log(\`Date filter: \${dateFilter}\`);
}

// Use finalQuery for your search API call
const searchResults = await searchAPI(finalQuery, { dateFilter });
`;
  }

  /**
   * Test the optimization
   */
  static testOptimization(): void {
    console.log('🔍 WEB SEARCH QUERY OPTIMIZATION TEST\n');

    const testCases = this.getTestCases();

    testCases.forEach(test => {
      const optimized = this.optimizeSearchQuery(test.original);
      const { query: final, dateFilter } = this.addDateFilters(optimized);

      console.log(`Original: "${test.original}"`);
      console.log(`Optimized: "${optimized}"`);
      console.log(`Final: "${final}"`);
      if (dateFilter) {
        console.log(`Date Filter: ${dateFilter}`);
      }
      console.log(`Expected: "${test.expected}"`);
      console.log(`Match: ${optimized.includes(test.expected.split(' ').slice(-1)[0]) ? '✅' : '❌'}`);
      console.log('');
    });
  }

  /**
   * Quick fixes for your immediate issues
   */
  static getQuickFixes(): Record<string, string> {
    return {
      "Add current year to searches": `
// In your search function:
if (query.includes('latest') || query.includes('recent')) {
  query += ' 2025';
}
      `,

      "Filter old results": `
// If using Google search API:
const searchParams = {
  q: query,
  dateRestrict: 'm6' // Last 6 months
};
      `,

      "Improve temporal detection": `
// Better detection of current info needs:
const needsCurrentInfo = /\\b(latest|recent|current|today|2025|this year)\\b/.test(query.toLowerCase());
      `
    };
  }
}

// Uncomment below to run tests
// WebSearchQueryOptimizer.testOptimization();
// console.log('\n💡 QUICK FIXES:');
// Object.entries(WebSearchQueryOptimizer.getQuickFixes()).forEach(([fix, code]) => {
//   console.log(`\n${fix}:`);
//   console.log(code);
// });
