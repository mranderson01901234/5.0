/**
 * ThinkingDisplay - React component for displaying LLM thinking steps
 * Shows animated thinking process with progressive disclosure
 */

import { useState, useEffect, useRef } from 'react';
import type { ThinkingStep } from '../../lib/thinking/ContextualVariator';

interface ThinkingDisplayProps {
  steps: ThinkingStep[];
  isComplete?: boolean;
  showDetailLevel?: 'minimal' | 'normal' | 'detailed';
  className?: string;
  onComplete?: () => void;
}

export function ThinkingDisplay({
  steps,
  isComplete = false,
  showDetailLevel = 'normal',
  className = '',
  onComplete
}: ThinkingDisplayProps) {
  const [visibleSteps, setVisibleSteps] = useState<ThinkingStep[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isExpanded, setIsExpanded] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Progressive step reveal
  useEffect(() => {
    if (currentStepIndex >= steps.length) {
      if (onComplete && !isComplete) {
        onComplete();
      }
      return;
    }

    const currentStep = steps[currentStepIndex];

    // Filter by detail level
    const shouldShow = shouldShowStep(currentStep, showDetailLevel);

    if (shouldShow) {
      setVisibleSteps(prev => [...prev, currentStep]);
    }

    // Schedule next step
    timerRef.current = setTimeout(() => {
      setCurrentStepIndex(prev => prev + 1);
    }, currentStep.duration);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [currentStepIndex, steps, showDetailLevel, isComplete, onComplete]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const shouldShowStep = (step: ThinkingStep, level: string): boolean => {
    switch (level) {
      case 'minimal':
        return step.depth === 0;
      case 'normal':
        return step.depth <= 1;
      case 'detailed':
        return true;
      default:
        return step.depth <= 1;
    }
  };

  const hasHiddenSteps = steps.some(step => !shouldShowStep(step, showDetailLevel));

  if (visibleSteps.length === 0 && !isComplete) {
    return null;
  }

  return (
    <div className={`thinking-display ${className}`}>
      <div className="thinking-header">
        <span className="thinking-label">Thinking</span>
        {hasHiddenSteps && (
          <button
            className="thinking-expand-btn"
            onClick={() => setIsExpanded(!isExpanded)}
            aria-label={isExpanded ? 'Show less' : 'Show more'}
          >
            {isExpanded ? 'Show less' : 'Show more'}
          </button>
        )}
      </div>

      <div className="thinking-steps">
        {visibleSteps.map((step, index) => (
          <ThinkingStepItem
            key={index}
            step={step}
            isLatest={index === visibleSteps.length - 1 && !isComplete}
            isExpanded={isExpanded}
          />
        ))}

        {isComplete && (
          <div className="thinking-complete">
            <span className="thinking-complete-text">Analysis complete</span>
          </div>
        )}
      </div>
    </div>
  );
}

interface ThinkingStepItemProps {
  step: ThinkingStep;
  isLatest: boolean;
  isExpanded: boolean;
}

function ThinkingStepItem({ step, isLatest, isExpanded }: ThinkingStepItemProps) {
  const [dots, setDots] = useState('');
  const shouldShow = isExpanded || step.depth === 0;

  // Animated dots for current step
  useEffect(() => {
    if (!isLatest) return;

    let dotCount = 0;
    const interval = setInterval(() => {
      dotCount = (dotCount + 1) % 4;
      setDots('.'.repeat(dotCount));
    }, 400);

    return () => clearInterval(interval);
  }, [isLatest]);

  if (!shouldShow && !isExpanded) {
    return null;
  }

  // Remove trailing ... if we're animating dots
  const displayText = isLatest
    ? step.text.replace(/\.\.\.?$/, '')
    : step.text;

  return (
    <div
      className={`thinking-step ${isLatest ? 'thinking-step-active' : 'thinking-step-complete'} ${step.depth > 0 ? 'thinking-step-detail' : ''}`}
    >
      <span className="thinking-step-indicator">
        {isLatest ? '•' : '✓'}
      </span>
      <span className="thinking-step-text">
        {displayText}
        {isLatest && <span className="thinking-dots">{dots}</span>}
      </span>
    </div>
  );
}

// Compact inline variant for minimal UI
export function ThinkingInline({
  steps,
  currentStepIndex = 0,
  className = ''
}: {
  steps: ThinkingStep[];
  currentStepIndex?: number;
  className?: string;
}) {
  const [dots, setDots] = useState('');

  useEffect(() => {
    let dotCount = 0;
    const interval = setInterval(() => {
      dotCount = (dotCount + 1) % 4;
      setDots('.'.repeat(dotCount));
    }, 400);

    return () => clearInterval(interval);
  }, []);

  if (!steps[currentStepIndex]) return null;

  const currentStep = steps[currentStepIndex];
  const displayText = currentStep.text.replace(/\.\.\.?$/, '');

  return (
    <div className={`thinking-inline ${className}`}>
      <span className="thinking-inline-indicator">•</span>
      <span className="thinking-inline-text">
        {displayText}
        <span className="thinking-dots">{dots}</span>
      </span>
    </div>
  );
}
