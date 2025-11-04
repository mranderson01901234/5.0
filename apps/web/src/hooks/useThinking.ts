/**
 * useThinking - React hook for integrating thinking narrator
 * Provides easy-to-use interface for generating and streaming thinking steps
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { getThinkingEngine } from '../lib/thinking/ThinkingEngine';
import type { ThinkingStep } from '../lib/thinking/ContextualVariator';
import type { QueryContext } from '../lib/thinking/PatternMatcher';

interface UseThinkingOptions {
  autoStart?: boolean;
  estimatedResponseTime?: number;
  enableStorage?: boolean;
  onComplete?: () => void;
}

interface UseThinkingReturn {
  // State
  steps: ThinkingStep[];
  currentStepIndex: number;
  isThinking: boolean;
  isComplete: boolean;
  context: QueryContext | null;

  // Actions
  startThinking: (query: string, responseTime?: number) => void;
  stopThinking: () => void;
  reset: () => void;

  // Utilities
  estimateTime: (query: string) => number;
}

export function useThinking(
  query?: string,
  options: UseThinkingOptions = {}
): UseThinkingReturn {
  const {
    autoStart = false,
    estimatedResponseTime,
    onComplete
  } = options;

  const [steps, setSteps] = useState<ThinkingStep[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isThinking, setIsThinking] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [context, setContext] = useState<QueryContext | null>(null);

  const engineRef = useRef(getThinkingEngine());
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const abortRef = useRef(false);

  /**
   * Start thinking process
   */
  const startThinking = useCallback((userQuery: string, responseTime?: number) => {
    // Reset state
    setSteps([]);
    setCurrentStepIndex(0);
    setIsThinking(true);
    setIsComplete(false);
    abortRef.current = false;

    // Generate thinking steps
    const engine = engineRef.current;
    const stream = engine.generateThinking(
      userQuery,
      responseTime ?? estimatedResponseTime
    );

    setSteps(stream.steps);
    setContext(stream.context);

    // Start step-by-step reveal
    let stepIndex = 0;
    const revealNextStep = () => {
      if (abortRef.current) return;

      if (stepIndex >= stream.steps.length) {
        setIsThinking(false);
        setIsComplete(true);
        if (onComplete) onComplete();
        return;
      }

      setCurrentStepIndex(stepIndex);
      const currentStep = stream.steps[stepIndex];

      timerRef.current = setTimeout(() => {
        stepIndex++;
        revealNextStep();
      }, currentStep.duration);
    };

    revealNextStep();
  }, [estimatedResponseTime, onComplete]);

  /**
   * Stop thinking process
   */
  const stopThinking = useCallback(() => {
    abortRef.current = true;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setIsThinking(false);
    setIsComplete(true);
  }, []);

  /**
   * Reset to initial state
   */
  const reset = useCallback(() => {
    stopThinking();
    setSteps([]);
    setCurrentStepIndex(0);
    setIsComplete(false);
    setContext(null);
  }, [stopThinking]);

  /**
   * Estimate thinking time for a query
   */
  const estimateTime = useCallback((userQuery: string) => {
    return engineRef.current.estimateThinkingTime(userQuery);
  }, []);

  // Auto-start if enabled and query provided
  useEffect(() => {
    if (autoStart && query) {
      startThinking(query, estimatedResponseTime);
    }
  }, [autoStart, query, estimatedResponseTime, startThinking]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  return {
    steps,
    currentStepIndex,
    isThinking,
    isComplete,
    context,
    startThinking,
    stopThinking,
    reset,
    estimateTime
  };
}

/**
 * Simplified hook for inline thinking display
 */
export function useInlineThinking(query?: string) {
  const [currentStep, setCurrentStep] = useState<ThinkingStep | null>(null);
  const [isActive, setIsActive] = useState(false);

  const engineRef = useRef(getThinkingEngine());
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const start = useCallback((userQuery: string, responseTime?: number) => {
    setIsActive(true);

    const engine = engineRef.current;
    const stream = engine.generateThinking(userQuery, responseTime);

    let stepIndex = 0;
    const showNextStep = () => {
      if (stepIndex >= stream.steps.length) {
        setIsActive(false);
        setCurrentStep(null);
        return;
      }

      // Only show depth 0 steps for inline
      const step = stream.steps[stepIndex];
      if (step.depth === 0) {
        setCurrentStep(step);
      }

      timerRef.current = setTimeout(() => {
        stepIndex++;
        showNextStep();
      }, step.duration);
    };

    showNextStep();
  }, []);

  const stop = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    setIsActive(false);
    setCurrentStep(null);
  }, []);

  useEffect(() => {
    if (query) {
      start(query);
    }
  }, [query, start]);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  return {
    currentStep,
    isActive,
    start,
    stop
  };
}

/**
 * Hook for async generator-based streaming
 */
export function useThinkingStream() {
  const [currentStep, setCurrentStep] = useState<ThinkingStep | null>(null);
  const [allSteps, setAllSteps] = useState<ThinkingStep[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);

  const engineRef = useRef(getThinkingEngine());
  const abortRef = useRef(false);

  const startStream = useCallback(async (query: string, responseTime?: number) => {
    setIsStreaming(true);
    setAllSteps([]);
    setCurrentStep(null);
    abortRef.current = false;

    const engine = engineRef.current;

    try {
      for await (const step of engine.streamThinking(query, responseTime)) {
        if (abortRef.current) break;

        setCurrentStep(step);
        setAllSteps(prev => [...prev, step]);
      }
    } finally {
      setIsStreaming(false);
      setCurrentStep(null);
    }
  }, []);

  const stopStream = useCallback(() => {
    abortRef.current = true;
    setIsStreaming(false);
  }, []);

  return {
    currentStep,
    allSteps,
    isStreaming,
    startStream,
    stopStream
  };
}
