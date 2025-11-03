/**
 * Simple Query Handler
 * Prevents over-interpretation of straightforward questions
 */

export class SimpleQueryHandler {

  /**
   * Detect queries that should get simple, direct answers
   */
  static isSimpleQuery(query: string): boolean {
    const text = query.toLowerCase().trim();

    // Math calculations
    if (/^what'?s \d+[\+\-\*\/]\d+\??$/.test(text)) {
      return true;
    }

    // Simple definitions
    if (/^what is (a|an|the) \w+\??$/.test(text)) {
      return true;
    }

    // Time/date questions
    if (/^what (time|date) is it\??$/.test(text)) {
      return true;
    }

    // Single word questions
    if (/^\w+\??$/.test(text)) {
      return true;
    }

    // Basic facts
    if (/^(who|what|where|when) is \w+\??$/.test(text)) {
      return true;
    }

    return false;
  }

  /**
   * Generate instruction for simple queries
   */
  static getSimpleQueryInstruction(query: string): string {
    const text = query.toLowerCase();

    if (/\d+[\+\-\*\/]\d+/.test(text)) {
      return "SIMPLE MATH: Provide only the numerical answer, no explanation or interpretation.";
    }

    if (/^what is/.test(text)) {
      return "DEFINITION: Provide a clear, direct definition in 1-2 sentences.";
    }

    if (/^(who|where|when)/.test(text)) {
      return "FACTUAL: Provide the direct factual answer without elaboration.";
    }

    return "SIMPLE QUERY: Give a direct, brief answer without over-analysis.";
  }

  /**
   * Enhanced prompt section for simple query handling
   */
  static getSimpleQueryPromptSection(): string {
    return `
SIMPLE QUERY HANDLING:
When you receive straightforward questions, resist the urge to over-interpret:

MATH CALCULATIONS:
- "What's 2+2?" → "4" (not philosophical analysis)
- "10 + 5?" → "15" (direct calculation)

BASIC DEFINITIONS:
- "What is AI?" → Brief, clear definition
- "What is React?" → Concise explanation

FACTUAL QUESTIONS:
- "Who is the president?" → Direct answer
- "What time is it?" → Time (if available)

RECOGNITION PATTERNS:
- Simple math: Just calculate, don't interpret
- Single concepts: Define directly
- Basic facts: Answer factually
- One-word questions: Brief explanation

AVOID: Turning simple questions into complex discussions unless specifically asked for depth.
`;
  }

  /**
   * Updated PromptBuilder integration
   */
  static addSimpleQueryHandling(query: string, promptBuilder: any): void {
    if (this.isSimpleQuery(query)) {
      const instruction = this.getSimpleQueryInstruction(query);
      promptBuilder.addInstruction(instruction, 'critical');
    }
  }

  /**
   * Test cases for simple query detection
   */
  static getTestCases(): Array<{query: string, isSimple: boolean, expectedResponse: string}> {
    return [
      {
        query: "What's 2+2?",
        isSimple: true,
        expectedResponse: "4"
      },
      {
        query: "10 * 5",
        isSimple: true,
        expectedResponse: "50"
      },
      {
        query: "What is AI?",
        isSimple: true,
        expectedResponse: "Artificial Intelligence is..."
      },
      {
        query: "Hello",
        isSimple: true,
        expectedResponse: "Hello! How can I help you?"
      },
      {
        query: "Analyze the philosophical implications of consciousness",
        isSimple: false,
        expectedResponse: "[Complex analysis expected]"
      },
      {
        query: "How do I build a React app with multiple components and state management?",
        isSimple: false,
        expectedResponse: "[Detailed technical explanation expected]"
      }
    ];
  }

  /**
   * Implementation for your current system
   */
  static getImplementationCode(): string {
    return `
// Add to your routes.ts before prompt building:

import { SimpleQueryHandler } from './SimpleQueryHandler.js';

// In your chat route, before building prompts:
const isSimpleQuery = SimpleQueryHandler.isSimpleQuery(lastMessage.content);

if (isSimpleQuery) {
  const simpleInstruction = SimpleQueryHandler.getSimpleQueryInstruction(lastMessage.content);
  promptBuilder.addInstruction(simpleInstruction, 'critical');
}

// Alternative: Add to PromptBuilder.getDefaultBasePrompt():
${this.getSimpleQueryPromptSection()}
`;
  }

  /**
   * Test the detection logic
   */
  static testDetection(): void {
    console.log('🧪 SIMPLE QUERY DETECTION TEST\n');

    const testCases = this.getTestCases();

    testCases.forEach(test => {
      const detected = this.isSimpleQuery(test.query);
      const isCorrect = detected === test.isSimple;

      console.log(`${isCorrect ? '✅' : '❌'} "${test.query}"`);
      console.log(`   Expected: ${test.isSimple}, Detected: ${detected}`);

      if (test.isSimple && detected) {
        const instruction = this.getSimpleQueryInstruction(test.query);
        console.log(`   Instruction: ${instruction}`);
      }

      console.log('');
    });
  }
}

// Uncomment below to run tests
// SimpleQueryHandler.testDetection();
