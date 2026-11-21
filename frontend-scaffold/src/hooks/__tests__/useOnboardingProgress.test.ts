import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const trackEvent = vi.fn();
vi.mock('@/services/analytics', () => ({
  analytics: { trackEvent: (...args: unknown[]) => trackEvent(...args) },
}));

import {
  useOnboardingProgress,
  furthestStep,
  ONBOARDING_STEPS,
} from '../useOnboardingProgress';

describe('useOnboardingProgress (#1345)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    trackEvent.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('starts a fresh session on the landing step', () => {
    const { result } = renderHook(() => useOnboardingProgress());
    expect(result.current.currentStep).toBe('landing');
    expect(result.current.resumed).toBe(false);
  });

  it('emits an analytics event for every step reached', () => {
    const { result } = renderHook(() => useOnboardingProgress());

    act(() => {
      result.current.trackStep('register');
      result.current.trackStep('username');
      result.current.trackStep('profile_details');
    });

    const steps = trackEvent.mock.calls
      .filter(([name]) => name === 'onboarding_step')
      .map(([, props]) => (props as { step: string }).step);

    expect(steps).toEqual(['register', 'username', 'profile_details']);
  });

  it('emits a dedicated completion event', () => {
    const { result } = renderHook(() => useOnboardingProgress());
    act(() => {
      result.current.trackStep('complete');
    });
    expect(trackEvent).toHaveBeenCalledWith(
      'onboarding_completed',
      expect.objectContaining({ step: 'complete' }),
    );
  });

  it('persists the furthest step so an interrupted flow resumes', () => {
    const first = renderHook(() => useOnboardingProgress());
    act(() => {
      first.result.current.trackStep('username');
    });
    first.unmount();

    const second = renderHook(() => useOnboardingProgress());
    expect(second.result.current.resumed).toBe(true);
    expect(second.result.current.currentStep).toBe('username');
    expect(second.result.current.visitedSteps).toContain('username');
    expect(trackEvent).toHaveBeenCalledWith(
      'onboarding_resumed',
      expect.objectContaining({ step: 'username' }),
    );
  });

  it('never moves the recorded step backwards', () => {
    const { result } = renderHook(() => useOnboardingProgress());
    act(() => {
      result.current.trackStep('profile_details');
    });
    act(() => {
      result.current.trackStep('username');
    });
    expect(result.current.currentStep).toBe('profile_details');
  });

  it('clears stored progress on reset', () => {
    const { result } = renderHook(() => useOnboardingProgress());
    act(() => {
      result.current.trackStep('wallet');
    });
    act(() => {
      result.current.resetProgress();
    });
    expect(result.current.currentStep).toBe('landing');
    expect(result.current.visitedSteps).toEqual([]);
  });

  it('orders steps as declared', () => {
    expect([...ONBOARDING_STEPS]).toEqual([
      'landing',
      'register',
      'username',
      'profile_details',
      'wallet',
      'complete',
    ]);
    expect(furthestStep(['landing', 'wallet', 'username'])).toBe('wallet');
  });
});
