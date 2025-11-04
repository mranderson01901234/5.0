import React, { useState, useEffect } from 'react';

export type ThinkingStep = {
  id: string;
  content: string;
  timestamp: number;
};

type Props = {
  steps: ThinkingStep[];
  streaming?: boolean;
};

const ThinkingIndicator: React.FC<Props> = ({ steps, streaming }) => {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [dots, setDots] = useState('');

  // Progress through steps one at a time
  useEffect(() => {
    if (steps.length === 0) {
      setCurrentStepIndex(0);
      return;
    }

    // Update to show the latest step
    if (steps.length > currentStepIndex + 1) {
      // Fade out current step
      setIsTransitioning(true);

      // After fade out, show next step
      const timer = setTimeout(() => {
        setCurrentStepIndex(steps.length - 1);
        setIsTransitioning(false);
      }, 200); // Fade out duration

      return () => clearTimeout(timer);
    } else {
      setCurrentStepIndex(steps.length - 1);
    }
  }, [steps.length, currentStepIndex]);

  // Animated dots for active step
  useEffect(() => {
    if (!streaming) {
      setDots('');
      return;
    }

    let dotCount = 0;
    const interval = setInterval(() => {
      dotCount = (dotCount + 1) % 4;
      setDots('.'.repeat(dotCount));
    }, 400);

    return () => clearInterval(interval);
  }, [streaming]);

  if (steps.length === 0) return null;

  const currentStep = steps[currentStepIndex];
  if (!currentStep) return null;

  const isLastStep = currentStepIndex === steps.length - 1;
  const showCheckmark = !streaming && isLastStep;

  return (
    <div className="thinking-indicator my-3">
      <div
        className={`thinking-step flex items-start gap-2 text-[13px] leading-relaxed font-mono text-white/70 transition-opacity duration-200 ${
          isTransitioning ? 'opacity-0' : 'opacity-100'
        }`}
        style={{
          animation: isTransitioning ? 'none' : 'fadeInStep 0.3s ease-in',
        }}
      >
        {/* Indicator */}
        <span className="thinking-step-indicator flex-shrink-0 mt-0.5">
          {showCheckmark ? (
            <span className="text-white/80 font-bold text-[12px]">✓</span>
          ) : (
            <span className="text-white/60 font-bold text-[12px]">•</span>
          )}
        </span>

        {/* Content */}
        <span className="flex-1 opacity-80">
          {currentStep.content.replace(/\.\.\.?$/, '')}
          {streaming && isLastStep && <span className="thinking-dots text-white/40">{dots}</span>}
        </span>
      </div>

      <style>{`
        @keyframes fadeInStep {
          from {
            opacity: 0;
            transform: translateY(-4px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
};

export default React.memo(ThinkingIndicator);
