import React from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';

export type AnimationType = 'slide' | 'fade' | 'none';

interface PageTransitionProps {
  children: React.ReactNode;
  animationType?: AnimationType;
  customAnimation?: {
    initial?: any;
    animate?: any;
    exit?: any;
    transition?: any;
  };
}

const PageTransition: React.FC<PageTransitionProps> = ({
  children,
  animationType = 'fade',
  customAnimation,
}) => {
  const location = useLocation();
  const navigationType = useNavigationType();
  const [shouldAnimate, setShouldAnimate] = React.useState(true);

  // Check for reduced motion preference
  React.useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setShouldAnimate(!mediaQuery.matches);

    const handler = (e: MediaQueryListEvent) => {
      setShouldAnimate(!e.matches);
    };

    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  // Determine animation direction based on navigation type
  const getSlideDirection = () => {
    if (navigationType === 'POP') {
      return { x: 100 }; // Slide from right when going back
    }
    return { x: -100 }; // Slide from left when going forward
  };

  const getAnimation = () => {
    if (!shouldAnimate || animationType === 'none') {
      return {
        initial: {},
        animate: {},
        exit: {},
        transition: { duration: 0 },
      };
    }

    if (customAnimation) {
      return customAnimation;
    }

    switch (animationType) {
      case 'slide':
        const direction = getSlideDirection();
        return {
          initial: { opacity: 0, x: direction.x },
          animate: { opacity: 1, x: 0 },
          exit: { opacity: 0, x: direction.x * -1 },
          transition: { duration: 0.3, ease: 'easeInOut' },
        };
      case 'fade':
      default:
        return {
          initial: { opacity: 0 },
          animate: { opacity: 1 },
          exit: { opacity: 0 },
          transition: { duration: 0.2, ease: 'easeOut' },
        };
    }
  };

  const animation = getAnimation();

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location.pathname}
        initial={animation.initial}
        animate={animation.animate}
        exit={animation.exit}
        transition={animation.transition}
        data-motion={animationType !== 'none' && shouldAnimate ? 'true' : undefined}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
};

export default PageTransition;
