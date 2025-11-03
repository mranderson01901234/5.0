/**
 * Follow-up Detection
 * Identifies follow-up questions to enforce brevity
 */

export class FollowUpDetector {

  /**
   * Detect if a query is a follow-up question
   */
  static isFollowUp(query: string, conversationHistory?: Array<{ role: string; content: string }>): boolean {
    const text = query.toLowerCase().trim();

    // Pronouns that reference previous context
    const pronounPatterns = [
      /^(that|this|it|they|those|these)\b/,
      /\b(that|this|it|they|those|these) (one|thing|topic|idea|concept)\b/,
    ];

    // Follow-up question phrases
    const followUpPatterns = [
      /^tell me more/i,
      /^can you (explain|elaborate|expand|clarify)/i,
      /^what about/i,
      /^how about/i,
      /^and\b/i,  // Starting with "and"
      /^also\b/i,  // Starting with "also"
      /^but\b/i,   // Starting with "but"
      /^(why|how|when|where|who) (is|was|does|did|can|should) (that|this|it)/i,
      /^go on/i,
      /^continue/i,
      /^keep going/i,
      /^more details?/i,
      /^example/i,
      /^like what/i,
    ];

    // Short questions that likely reference previous context
    if (text.split(' ').length <= 3 && conversationHistory && conversationHistory.length > 2) {
      return true;
    }

    // Check patterns
    const hasPronouns = pronounPatterns.some(pattern => pattern.test(text));
    const hasFollowUpPhrase = followUpPatterns.some(pattern => pattern.test(text));

    return hasPronouns || hasFollowUpPhrase;
  }

  /**
   * Get instruction for follow-up questions
   */
  static getFollowUpInstruction(): string {
    return `FOLLOW-UP DETECTED: This is a continuation of the previous topic. Build on the context naturally and keep your response brief and focused. Do not repeat information already provided. Add new relevant details in 2-3 sentences max.`;
  }

  /**
   * Enhanced prompt section for follow-up handling
   */
  static getFollowUpPromptSection(): string {
    return `
FOLLOW-UP HANDLING:
When the user asks a follow-up question (referencing "that", "this", "it", or asking for elaboration):
- Build naturally on the previous response
- Do NOT repeat information already stated
- Add only NEW relevant details
- Keep it concise (2-3 sentences)
- Match their energy: short question = short answer

Examples:
User: "What is React?"
Assistant: "React is a JavaScript library for building user interfaces..."

User: "Tell me more"
Assistant: [2-3 sentences with new details, not repeating the definition]

User: "What about hooks?"
Assistant: [Brief explanation of hooks in 2-3 sentences]
`;
  }

  /**
   * Test cases for follow-up detection
   */
  static getTestCases(): Array<{query: string, isFollowUp: boolean, context?: any[]}> {
    return [
      { query: "Tell me more", isFollowUp: true },
      { query: "What about that?", isFollowUp: true },
      { query: "Can you elaborate?", isFollowUp: true },
      { query: "Why is that?", isFollowUp: true },
      { query: "And then?", isFollowUp: true },
      { query: "Also interesting", isFollowUp: true },
      { query: "Go on", isFollowUp: true },
      { query: "Example?", isFollowUp: true },

      // Not follow-ups
      { query: "What is artificial intelligence?", isFollowUp: false },
      { query: "How do I build a React app?", isFollowUp: false },
      { query: "Explain quantum computing", isFollowUp: false },
    ];
  }

  /**
   * Test the detection logic
   */
  static testDetection(): void {
    console.log('🔍 FOLLOW-UP DETECTION TEST\n');

    const testCases = this.getTestCases();

    testCases.forEach(test => {
      const detected = this.isFollowUp(test.query, test.context);
      const isCorrect = detected === test.isFollowUp;

      console.log(`${isCorrect ? '✅' : '❌'} "${test.query}"`);
      console.log(`   Expected: ${test.isFollowUp}, Detected: ${detected}`);

      if (test.isFollowUp && detected) {
        const instruction = this.getFollowUpInstruction();
        console.log(`   Instruction: ${instruction.substring(0, 80)}...`);
      }

      console.log('');
    });
  }
}

// Uncomment below to run tests
// FollowUpDetector.testDetection();
