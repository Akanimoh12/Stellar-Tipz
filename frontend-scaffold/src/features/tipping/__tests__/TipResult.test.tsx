import React from 'react';
import { render, screen, act } from '@testing-library/react';
import confetti from 'canvas-confetti';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { notifyReducedMotionSettingsChanged } from '../../../hooks/useReducedMotion';
import TipResult from '../TipResult';

vi.mock('canvas-confetti', () => ({ default: vi.fn() }));

vi.mock('framer-motion', () => {
  const motionOnlyProps = [
    'initial',
    'animate',
    'exit',
    'transition',
    'variants',
    'custom',
    'whileHover',
    'whileTap',
    'whileInView',
    'viewport',
    'layout',
  ];

  const MotionPrimitive = ({
    children,
    ...props
  }: React.ComponentProps<'section'> & Record<string, unknown>) => {
    const domProps: Record<string, unknown> = { ...props };
    motionOnlyProps.forEach((key) => {
      delete domProps[key];
    });

    return <section {...(domProps as React.ComponentProps<'section'>)}>{children}</section>;
  };

  return {
    motion: new Proxy({}, { get: () => MotionPrimitive }),
    AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
  };
});

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

const setSavedPreference = (reduceMotion: 'auto' | 'always') => {
  window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ reduceMotion }));
};

describe('TipResult reduced motion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    installMatchMedia(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('celebrates with confetti when motion is allowed', () => {
    render(<TipResult status="success" amount="12" />);

    expect(screen.getByRole('status')).toHaveTextContent('Tip sent!');
    expect(confettiMock).toHaveBeenCalledTimes(1);
  });

  it('skips confetti but still announces success when the OS prefers reduced motion', () => {
    installMatchMedia(true);

    render(<TipResult status="success" amount="12" />);

    expect(screen.getByRole('status')).toHaveTextContent('Tip sent!');
    expect(screen.getByRole('status')).toHaveAttribute('data-reduced-motion', 'true');
    expect(confettiMock).not.toHaveBeenCalled();
  });

  it('skips confetti when the in-app preference is "always"', () => {
    setSavedPreference('always');

    render(<TipResult status="success" amount="12" />);

    expect(screen.getByRole('status')).toHaveAttribute('data-reduced-motion', 'true');
    expect(confettiMock).not.toHaveBeenCalled();
  });

  it('never celebrates a failed tip, with or without reduced motion', () => {
    const { unmount } = render(<TipResult status="error" errorMessage="Insufficient balance" />);

    expect(screen.getByRole('alert')).toHaveTextContent('Insufficient balance');
    expect(confettiMock).not.toHaveBeenCalled();

    unmount();
    setSavedPreference('always');
    render(<TipResult status="error" />);

    expect(confettiMock).not.toHaveBeenCalled();
  });

  it('does not celebrate when a success result is re-rendered while motion is reduced', () => {
    const { rerender } = render(<TipResult status="success" amount="1" />);
    expect(confettiMock).toHaveBeenCalledTimes(1);

    act(() => {
      setSavedPreference('always');
      notifyReducedMotionSettingsChanged();
    });
    rerender(<TipResult status="success" amount="1" />);

    expect(screen.getByRole('status')).toHaveAttribute('data-reduced-motion', 'true');
    expect(confettiMock).toHaveBeenCalledTimes(1);
  });
});
