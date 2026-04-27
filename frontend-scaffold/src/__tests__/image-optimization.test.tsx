import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { afterEach, describe, it, expect } from 'vitest';
import OptimizedImage from '../components/ui/OptimizedImage';
import { useHeroPreload } from '../hooks/useHeroPreload';

afterEach(() => {
  cleanup();
  document
    .querySelectorAll('link[rel="preload"][as="image"]')
    .forEach((el) => el.remove());
});

describe('Image optimization', () => {
  it('uses WebP format for hero image', () => {
    render(
      <OptimizedImage
        src="/img/hero.png"
        alt="Hero"
        width={1920}
        height={1080}
        priority
      />
    );
    const source = document.querySelector('source[type="image/webp"]');
    expect(source).not.toBeNull();
  });

  it('lazy loads below-fold images', () => {
    render(
      <>
        <OptimizedImage src="/img/creator1.png" alt="Creator 1" />
        <OptimizedImage src="/img/creator2.png" alt="Creator 2" />
        <OptimizedImage src="/img/creator3.png" alt="Creator 3" />
      </>
    );
    const images = document.querySelectorAll('img[loading="lazy"]');
    expect(images.length).toBeGreaterThan(0);
  });

  it('preloads hero image', async () => {
    const HeroPreloadHarness: React.FC = () => {
      useHeroPreload();
      return null;
    };
    await act(async () => {
      render(<HeroPreloadHarness />);
    });
    const preload = document.querySelector('link[rel="preload"][as="image"]');
    expect(preload).not.toBeNull();
  });
});