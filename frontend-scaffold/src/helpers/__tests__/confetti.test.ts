import confetti from 'canvas-confetti';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { celebrate, isConfettiAllowed } from '../confetti';

vi.mock('canvas-confetti', () => ({ default: vi.fn() }));

const confettiMock = vi.mocked(confetti);

const SETTINGS_STORAGE_KEY = 'tipz_settings';

const installMatchMedia = (matches: boolean) => {
  window.matchMedia = vi.fn((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
};

describe('confetti helper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    installMatchMedia(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fires a celebration burst when motion is allowed', () => {
    expect(isConfettiAllowed()).toBe(true);
    expect(celebrate()).toBe(true);

    expect(confettiMock).toHaveBeenCalledTimes(1);
    expect(confettiMock).toHaveBeenCalledWith(
      expect.objectContaining({ particleCount: 80, disableForReducedMotion: true }),
    );
  });

  it('suppresses confetti when the OS prefers reduced motion', () => {
    installMatchMedia(true);

    expect(isConfettiAllowed()).toBe(false);
    expect(celebrate()).toBe(false);
    expect(confettiMock).not.toHaveBeenCalled();
  });

  it('suppresses confetti when the in-app preference is "always"', () => {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ reduceMotion: 'always' }));

    expect(isConfettiAllowed()).toBe(false);
    expect(celebrate()).toBe(false);
    expect(confettiMock).not.toHaveBeenCalled();
  });

  it('forwards custom options to the burst', () => {
    expect(celebrate({ particleCount: 12, origin: { x: 0.1, y: 0.2 } })).toBe(true);

    expect(confettiMock).toHaveBeenCalledWith(
      expect.objectContaining({ particleCount: 12, origin: { x: 0.1, y: 0.2 } }),
    );
  });
});
