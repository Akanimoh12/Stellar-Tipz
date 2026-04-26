import { useEffect } from 'react';

export function useHeroPreload(heroSrc = '/img/hero.webp'): void {
  useEffect(() => {
    const existing = document.querySelector(
      `link[rel="preload"][as="image"]`
    );
    if (existing) return;

    const link = document.createElement('link');
    link.setAttribute('rel', 'preload');
    link.setAttribute('as', 'image');
    link.setAttribute('href', heroSrc);
    link.setAttribute('type', 'image/webp');
    link.setAttribute('fetchpriority', 'high');

    document.head.appendChild(link);

    return () => {
      if (document.head.contains(link)) {
        document.head.removeChild(link);
      }
    };
  }, [heroSrc]);
}