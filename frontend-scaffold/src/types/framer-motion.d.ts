declare module 'framer-motion' {
  import * as React from 'react';

  type MotionValue = Record<string, unknown> | string | number | boolean;

  interface MotionProps {
    initial?: MotionValue;
    animate?: MotionValue;
    exit?: MotionValue;
    transition?: Record<string, unknown>;
    variants?: Record<string, unknown>;
    custom?: unknown;
    whileHover?: MotionValue;
    whileTap?: MotionValue;
    whileInView?: MotionValue;
    viewport?: Record<string, unknown>;
    layout?: boolean | string;
  }

  type MotionComponents = {
    [Element in keyof JSX.IntrinsicElements]: React.ForwardRefExoticComponent<
      JSX.IntrinsicElements[Element] &
        MotionProps &
        React.RefAttributes<HTMLElement>
    >;
  };

  export const motion: MotionComponents;

  export const AnimatePresence: React.FC<{
    children?: React.ReactNode;
    initial?: boolean;
    mode?: 'sync' | 'wait' | 'popLayout';
  }>;

  export const MotionConfig: React.FC<{
    children?: React.ReactNode;
    reducedMotion?: 'always' | 'never' | 'user';
    transition?: Record<string, unknown>;
  }>;
}
