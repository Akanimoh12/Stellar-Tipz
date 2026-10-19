import { useCallback, useEffect, useState } from 'react';
import { analytics } from '../services/analytics';

/**
 * Onboarding funnel steps, in order. Registration is the critical funnel, so
 * every step transition is emitted as an analytics event and the furthest
 * reached step is persisted — an interrupted registration can be resumed and
 * the drop-off point is measurable (#1345).
 */
export const ONBOARDING_STEPS = [
  'landing',
  'register',
  'username',
  'profile_details',
  'wallet',
  'complete',
] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

const STEP_STORAGE_KEY = 'tipz_onboarding_step';
const VISITED_STORAGE_KEY = 'tipz_onboarding_steps_visited';

const stepIndex = (step: OnboardingStep) => ONBOARDING_STEPS.indexOf(step);

const isOnboardingStep = (value: unknown): value is OnboardingStep =>
  typeof value === 'string' &&
  (ONBOARDING_STEPS as readonly string[]).includes(value);

/** Highest step reached so far, so resumption never moves the user backwards. */
export function furthestStep(steps: readonly OnboardingStep[]): OnboardingStep {
  return steps.reduce<OnboardingStep>(
    (furthest, step) => (stepIndex(step) > stepIndex(furthest) ? step : furthest),
    'landing',
  );
}

function readVisited(): OnboardingStep[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(VISITED_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isOnboardingStep);
  } catch {
    return [];
  }
}

/**
 * Tracks onboarding progress: emits one analytics event per step, persists the
 * furthest step reached, and reports whether a previous session was resumed.
 */
export function useOnboardingProgress() {
  const [currentStep, setCurrentStep] = useState<OnboardingStep>('landing');
  const [visited, setVisited] = useState<OnboardingStep[]>([]);
  const [resumed, setResumed] = useState(false);

  // Restore on mount and emit a single resume event when prior progress exists.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const storedVisited = readVisited();
    const storedStep = (() => {
      try {
        const raw = window.localStorage.getItem(STEP_STORAGE_KEY);
        return isOnboardingStep(raw) ? raw : null;
      } catch {
        return null;
      }
    })();

    if (storedVisited.length === 0 && !storedStep) return;

    const merged = Array.from(
      new Set<OnboardingStep>([...(storedVisited ?? []), ...(storedStep ? [storedStep] : [])]),
    );
    const furthest = furthestStep(merged);
    setVisited(merged);
    setCurrentStep(furthest);
    setResumed(true);
    analytics.trackEvent('onboarding_resumed', {
      step: furthest,
      visited_steps: merged.join(','),
    });
  }, []);

  const trackStep = useCallback((step: OnboardingStep) => {
    if (typeof window !== 'undefined') {
      setCurrentStep((previous) => {
        analytics.trackEvent('onboarding_step', {
          step,
          previous_step: previous,
        });
        if (step === 'complete') {
          analytics.trackEvent('onboarding_completed', { step });
        }
        return stepIndex(step) > stepIndex(previous) ? step : previous;
      });

      const merged = Array.from(new Set<OnboardingStep>([...readVisited(), step]));
      try {
        window.localStorage.setItem(VISITED_STORAGE_KEY, JSON.stringify(merged));
        window.localStorage.setItem(
          STEP_STORAGE_KEY,
          furthestStep(merged),
        );
      } catch {
        // Storage unavailable — analytics still emitted, session-only progress.
      }
      setVisited(merged);
    }
  }, []);

  const resetProgress = useCallback(() => {
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.removeItem(STEP_STORAGE_KEY);
        window.localStorage.removeItem(VISITED_STORAGE_KEY);
      } catch {
        // Nothing to clear when storage is unavailable.
      }
    }
    setVisited([]);
    setCurrentStep('landing');
    setResumed(false);
  }, []);

  return {
    currentStep,
    visitedSteps: visited,
    resumed,
    trackStep,
    resetProgress,
  };
}
