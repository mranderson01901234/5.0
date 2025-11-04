/**
 * ThinkingEngine - Main orchestrator for generating contextual thinking steps
 * Combines pattern matching with contextual variation for realistic thinking narratives
 */

import { PatternMatcher, type QueryCategory, type QueryContext } from './PatternMatcher';
import { ContextualVariator, type ThinkingStep } from './ContextualVariator';

export interface ThinkingConfig {
  minSteps?: number;
  maxSteps?: number;
  baseStepDuration?: number; // milliseconds
  enableVariation?: boolean;
}

export interface ThinkingStream {
  steps: ThinkingStep[];
  totalDuration: number;
  context: QueryContext;
}

export class ThinkingEngine {
  private patternMatcher: PatternMatcher;
  private contextualVariator: ContextualVariator;
  private config: Required<ThinkingConfig>;

  // Pre-defined thinking step patterns for each category
  private thinkingPatterns: Record<QueryCategory, string[][]> = {
    code: [
      ['Analyzing code requirements...', 'Evaluating implementation approaches...', 'Planning code structure...', 'Considering edge cases...', 'Formulating solution...'],
      ['Parsing technical requirements...', 'Identifying optimal patterns...', 'Structuring component architecture...', 'Preparing implementation...'],
      ['Examining request details...', 'Selecting appropriate methods...', 'Organizing code logic...', 'Validating approach...', 'Finalizing structure...']
    ],

    debugging: [
      ['Analyzing error context...', 'Identifying potential causes...', 'Tracing execution flow...', 'Evaluating solutions...', 'Formulating fix...'],
      ['Examining error details...', 'Parsing stack trace...', 'Locating issue source...', 'Determining root cause...', 'Planning resolution...'],
      ['Processing error information...', 'Investigating code path...', 'Diagnosing problem...', 'Preparing solution...']
    ],

    design: [
      ['Analyzing design requirements...', 'Exploring architectural patterns...', 'Evaluating structural approaches...', 'Planning system organization...', 'Finalizing design...'],
      ['Examining system needs...', 'Considering design principles...', 'Structuring component relationships...', 'Optimizing architecture...'],
      ['Processing design goals...', 'Identifying key components...', 'Organizing system layers...', 'Validating approach...', 'Refining structure...']
    ],

    explanation: [
      ['Analyzing query focus...', 'Organizing key concepts...', 'Structuring explanation...', 'Preparing clear examples...'],
      ['Examining request...', 'Identifying core topics...', 'Planning explanation flow...', 'Formulating response...'],
      ['Processing question...', 'Breaking down concepts...', 'Arranging information...', 'Finalizing explanation...']
    ],

    analysis: [
      ['Analyzing request scope...', 'Identifying key factors...', 'Evaluating options...', 'Comparing approaches...', 'Synthesizing findings...'],
      ['Examining analysis criteria...', 'Gathering relevant data...', 'Assessing trade-offs...', 'Formulating conclusions...'],
      ['Processing analysis parameters...', 'Investigating alternatives...', 'Weighing considerations...', 'Organizing insights...', 'Finalizing assessment...']
    ],

    creative: [
      ['Exploring creative possibilities...', 'Generating ideas...', 'Structuring narrative...', 'Refining concepts...', 'Finalizing content...'],
      ['Analyzing creative direction...', 'Brainstorming approaches...', 'Organizing themes...', 'Crafting structure...'],
      ['Processing creative requirements...', 'Developing concepts...', 'Arranging elements...', 'Polishing output...']
    ],

    technical: [
      ['Analyzing technical requirements...', 'Identifying configuration needs...', 'Planning implementation steps...', 'Preparing setup instructions...'],
      ['Examining technical specifications...', 'Evaluating setup approach...', 'Structuring configuration...', 'Formulating process...'],
      ['Processing technical details...', 'Organizing setup sequence...', 'Validating approach...', 'Finalizing instructions...']
    ],

    optimization: [
      ['Analyzing performance requirements...', 'Identifying bottlenecks...', 'Evaluating optimization strategies...', 'Planning improvements...', 'Finalizing approach...'],
      ['Examining current performance...', 'Detecting inefficiencies...', 'Formulating optimizations...', 'Validating enhancements...'],
      ['Processing optimization goals...', 'Investigating performance factors...', 'Structuring improvements...', 'Refining solution...']
    ],

    research: [
      ['Analyzing research scope...', 'Identifying information sources...', 'Gathering relevant data...', 'Organizing findings...', 'Synthesizing information...'],
      ['Examining research query...', 'Locating key information...', 'Evaluating sources...', 'Compiling results...'],
      ['Processing research request...', 'Investigating topic...', 'Structuring information...', 'Finalizing response...']
    ],

    general: [
      ['Analyzing request...', 'Processing information...', 'Structuring response...', 'Finalizing output...'],
      ['Examining query...', 'Organizing thoughts...', 'Preparing response...'],
      ['Processing request...', 'Formulating answer...', 'Finalizing details...']
    ],

    image: [
      ['Analyzing image requirements...', 'Processing visual details...', 'Preparing image generation...', 'Rendering image...'],
      ['Understanding image prompt...', 'Configuring generation parameters...', 'Creating image...'],
      ['Reviewing image request...', 'Setting up generation...', 'Generating visual content...', 'Finalizing image...']
    ]
  };

  constructor(config: ThinkingConfig = {}) {
    this.patternMatcher = new PatternMatcher();
    this.contextualVariator = new ContextualVariator();

    this.config = {
      minSteps: config.minSteps ?? 3,
      maxSteps: config.maxSteps ?? 6,
      baseStepDuration: config.baseStepDuration ?? 400,
      enableVariation: config.enableVariation ?? true
    };
  }

  /**
   * Generate thinking steps for a user query
   */
  generateThinking(query: string, estimatedResponseTime?: number): ThinkingStream {
    // Classify the query
    const context = this.patternMatcher.classify(query);

    // Generate base steps
    const baseSteps = this.generateBaseSteps(context);

    // Add contextual variation if enabled
    const finalSteps = this.config.enableVariation
      ? this.contextualVariator.addVariation(baseSteps, query, context.keywords)
      : baseSteps;

    // Calculate timing
    const totalDuration = estimatedResponseTime ?? this.calculateDefaultDuration(context.complexity);
    const timedSteps = this.distributeTimings(finalSteps, totalDuration);

    return {
      steps: timedSteps,
      totalDuration,
      context
    };
  }

  /**
   * Generate base thinking steps based on query context
   */
  private generateBaseSteps(context: QueryContext): ThinkingStep[] {
    const patterns = this.thinkingPatterns[context.category] || this.thinkingPatterns.general;

    // Select pattern variation based on complexity
    let selectedPattern: string[];

    if (context.complexity === 'simple') {
      // Use shortest pattern
      selectedPattern = patterns.reduce((shortest, current) =>
        current.length < shortest.length ? current : shortest
      );
    } else if (context.complexity === 'complex') {
      // Use longest pattern
      selectedPattern = patterns.reduce((longest, current) =>
        current.length > longest.length ? current : longest
      );
    } else {
      // Use medium-length pattern
      selectedPattern = patterns.sort((a, b) => a.length - b.length)[Math.floor(patterns.length / 2)];
    }

    // Convert to ThinkingStep objects with depth for progressive disclosure
    return selectedPattern.map((text, index) => ({
      text,
      duration: 0, // Will be set in distributeTimings
      depth: this.assignDepth(index, selectedPattern.length)
    }));
  }

  /**
   * Assign depth level for progressive disclosure
   * Depth 0: Always shown
   * Depth 1: Shown for moderate/complex queries
   * Depth 2: Only shown for complex queries
   */
  private assignDepth(index: number, totalSteps: number): number {
    if (index === 0 || index === totalSteps - 1) return 0; // First and last always visible

    const middlePosition = index / totalSteps;

    if (middlePosition < 0.4 || middlePosition > 0.6) return 0;
    if (middlePosition < 0.45 || middlePosition > 0.55) return 1;
    return 2;
  }

  /**
   * Calculate default duration based on complexity
   */
  private calculateDefaultDuration(complexity: 'simple' | 'moderate' | 'complex'): number {
    switch (complexity) {
      case 'simple':
        return 1500; // 1.5 seconds
      case 'moderate':
        return 3000; // 3 seconds
      case 'complex':
        return 5000; // 5 seconds
    }
  }

  /**
   * Distribute timing across steps with natural variation
   */
  private distributeTimings(steps: ThinkingStep[], totalDuration: number): ThinkingStep[] {
    if (steps.length === 0) return steps;

    // Create natural timing distribution (not uniform)
    // First step is quick, middle steps vary, last step is slightly longer
    const weights = steps.map((_, index) => {
      if (index === 0) return 0.8; // Quick start
      if (index === steps.length - 1) return 1.2; // Slightly longer end
      return 1.0 + (Math.random() - 0.5) * 0.3; // Natural variation
    });

    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    const baseDuration = totalDuration / totalWeight;

    return steps.map((step, index) => ({
      ...step,
      duration: Math.round(baseDuration * weights[index])
    }));
  }

  /**
   * Stream thinking steps with realistic timing
   * Returns an async generator for step-by-step streaming
   */
  async *streamThinking(query: string, estimatedResponseTime?: number): AsyncGenerator<ThinkingStep> {
    const stream = this.generateThinking(query, estimatedResponseTime);

    for (const step of stream.steps) {
      yield step;

      // Wait for the step duration
      if (step.duration > 0) {
        await new Promise(resolve => setTimeout(resolve, step.duration));
      }
    }
  }

  /**
   * Get estimated total thinking time
   */
  estimateThinkingTime(query: string): number {
    const context = this.patternMatcher.classify(query);
    return this.calculateDefaultDuration(context.complexity);
  }

  /**
   * Classify query (useful for external consumers)
   */
  classifyQuery(query: string): QueryContext {
    return this.patternMatcher.classify(query);
  }
}

// Singleton instance for application-wide use
let engineInstance: ThinkingEngine | null = null;

export function getThinkingEngine(config?: ThinkingConfig): ThinkingEngine {
  if (!engineInstance) {
    engineInstance = new ThinkingEngine(config);
  }
  return engineInstance;
}
