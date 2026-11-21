import confetti from 'canvas-confetti';

import { shouldReduceMotionNow } from '../hooks/useReducedMotion';

export interface CelebrationOptions {
  origin?: { x: number; y: number };
  particleCount?: number;
  spread?: number;
  startVelocity?: number;
  scalar?: number;
  ticks?: number;
}

const DEFAULT_CELEBRATION: CelebrationOptions = {
  origin: { x: 0.5, y: 0.6 },
  particleCount: 80,
  spread: 70,
  startVelocity: 35,
  scalar: 0.9,
  ticks: 160,
};

/**
 * Confetti is purely decorative, so it is skipped whenever motion is reduced —
 * either by the OS preference or by the in-app "Reduce motion" setting.
 */
export const isConfettiAllowed = (): boolean => !shouldReduceMotionNow();

/**
 * Fires a celebration burst unless motion is reduced.
 *
 * Returns `false` when the burst was suppressed so callers know to rely on an
 * instant (non-animated) cue for the state change instead.
 */
export const celebrate = (options: CelebrationOptions = {}): boolean => {
  if (!isConfettiAllowed()) {
    return false;
  }

  confetti({
    ...DEFAULT_CELEBRATION,
    ...options,
    // Defence in depth: canvas-confetti bails out on its own if the media
    // query flips between rendering and firing.
    disableForReducedMotion: true,
  });

  return true;
};
