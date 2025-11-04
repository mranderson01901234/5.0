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

type AnimationPhase = 'fade-in' | 'showing' | 'fade-out';

const ThinkingIndicator: React.FC<Props> = ({ steps, streaming }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [phase, setPhase] = useState<AnimationPhase>('fade-in');
  const [dots, setDots] = useState('');

  // Animated dots during "showing" phase
  useEffect(() => {
    if (phase !== 'showing') {
      setDots('');
      return;
    }

    let dotCount = 0;
    const interval = setInterval(() => {
      dotCount = (dotCount + 1) % 4;
      setDots('.'.repeat(dotCount));
    }, 400);

    return () => clearInterval(interval);
  }, [phase]);

  // Manage step transitions: fade-in → showing → fade-out
  useEffect(() => {
    if (steps.length === 0) return;

    const currentStep = steps[currentIndex];
    if (!currentStep) return;

    // When new step arrives
    if (phase === 'fade-in') {
      // Fade in for 300ms
      const timer = setTimeout(() => {
        setPhase('showing');
      }, 300);
      return () => clearTimeout(timer);
    }

    if (phase === 'showing') {
      // Show with dots for 1500ms (or until next step arrives)
      const hasNextStep = currentIndex < steps.length - 1;

      if (hasNextStep) {
        const timer = setTimeout(() => {
          setPhase('fade-out');
        }, 1500);
        return () => clearTimeout(timer);
      }
      // If no next step, keep showing current step with dots
    }

    if (phase === 'fade-out') {
      // Fade out for 200ms
      const timer = setTimeout(() => {
        // Move to next step
        if (currentIndex < steps.length - 1) {
          setCurrentIndex(currentIndex + 1);
          setPhase('fade-in');
        }
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [steps, currentIndex, phase]);

  // Reset when new steps arrive during showing phase
  useEffect(() => {
    if (steps.length > currentIndex + 1) {
      // New step arrived while showing current
      if (phase === 'showing') {
        setPhase('fade-out');
      }
    }
  }, [steps.length, currentIndex, phase]);

  if (steps.length === 0) return null;

  const currentStep = steps[currentIndex];
  if (!currentStep) return null;

  // Determine opacity based on phase
  const getOpacityClass = () => {
    switch (phase) {
      case 'fade-in': return 'opacity-0';
      case 'showing': return 'opacity-100';
      case 'fade-out': return 'opacity-0';
    }
  };

  // Determine if we should show checkmark or dot (monochrome icons only)
  const isLastStep = currentIndex === steps.length - 1;
  const showCheckmark = !streaming && isLastStep && phase === 'showing';

  return (
    <div className="thinking-indicator my-3">
      <div
        className={`thinking-step flex items-start gap-2 text-[13px] leading-relaxed font-mono transition-opacity duration-300 ${getOpacityClass()}`}
      >
        {/* Monochrome indicator - simple dot or checkmark */}
        <span className="thinking-step-indicator flex-shrink-0 mt-0.5 text-white/50 text-[11px] font-normal">
          {showCheckmark ? '✓' : '·'}
        </span>

        {/* Content - clean monochrome text */}
        <span className="flex-1 text-white/60">
          {currentStep.content.trim()}
          {phase === 'showing' && (
            <span className="thinking-dots text-white/30 ml-0.5">{dots}</span>
          )}
        </span>
      </div>
    </div>
  );
};

export default React.memo(ThinkingIndicator);
