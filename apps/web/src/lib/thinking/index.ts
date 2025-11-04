/**
 * Thinking Narrator System - Main export file
 * Production-ready client-side thinking generation
 */

// Core Engine
export { ThinkingEngine, getThinkingEngine } from './ThinkingEngine';
export type { ThinkingConfig, ThinkingStream } from './ThinkingEngine';

// Pattern Matching
export { PatternMatcher } from './PatternMatcher';
export type { QueryCategory, QueryContext } from './PatternMatcher';

// Contextual Variation
export { ContextualVariator } from './ContextualVariator';
export type { ThinkingStep } from './ContextualVariator';

// Storage
export { ThinkingStorage, getThinkingStorage, hashQuery } from './ThinkingStorage';

// React Hooks
export {
  useThinking,
  useInlineThinking,
  useThinkingStream
} from '../../hooks/useThinking';

// React Components
export {
  ThinkingDisplay,
  ThinkingInline
} from '../../components/thinking/ThinkingDisplay';

// Benchmarking (dev only)
export { ThinkingBenchmark, runBenchmarks } from './benchmark';
export type { BenchmarkResult } from './benchmark';

/**
 * Quick Start Example:
 *
 * ```tsx
 * import { useThinking, ThinkingDisplay } from '@/lib/thinking';
 * import '@/components/thinking/ThinkingDisplay.css';
 *
 * function MyComponent() {
 *   const thinking = useThinking();
 *
 *   const handleQuery = (query: string) => {
 *     thinking.startThinking(query);
 *     // ... make your API call ...
 *     thinking.stopThinking();
 *   };
 *
 *   return (
 *     <ThinkingDisplay
 *       steps={thinking.steps}
 *       isComplete={thinking.isComplete}
 *     />
 *   );
 * }
 * ```
 */
