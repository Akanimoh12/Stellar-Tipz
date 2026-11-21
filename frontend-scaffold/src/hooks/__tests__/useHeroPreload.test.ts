import { renderHook } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useHeroPreload, HeroPreloadOptions } from '../useHeroPreload';

describe('useHeroPreload (#1516)', () => {
  beforeEach(() => {
    // Clean up any preload links before each test
    document.querySelectorAll('link[rel="preload"]').forEach((el) => el.remove());
  });

  afterEach(() => {
    document.querySelectorAll('link[rel="preload"]').forEach((el) => el.remove());
    vi.restoreAllMocks();
  });

  describe('loading and initialization', () => {
    it('does not create any link element when imageHref is undefined', () => {
      renderHook(() => useHeroPreload());
      const links = document.querySelectorAll('link[rel="preload"]');
      expect(links.length).toBe(0);
    });

    it('does not create any link element when imageHref is an empty string', () => {
      renderHook(() => useHeroPreload({ imageHref: '' }));
      const links = document.querySelectorAll('link[rel="preload"]');
      expect(links.length).toBe(0);
    });

    it('handles SSR environment gracefully when document is undefined', () => {
      const originalDocument = globalThis.document;
      // @ts-expect-error - simulating SSR environment
      delete globalThis.document;

      expect(() => {
        renderHook(() => useHeroPreload({ imageHref: 'https://example.com/hero.jpg' }));
      }).not.toThrow();

      globalThis.document = originalDocument;
    });
  });

  describe('success path', () => {
    it('creates and appends preload link with required attributes', () => {
      const options: HeroPreloadOptions = {
        imageHref: 'https://example.com/hero.webp',
      };

      renderHook(() => useHeroPreload(options));

      const link = document.querySelector('link[rel="preload"]') as HTMLLinkElement | null;
      expect(link).not.toBeNull();
      expect(link?.getAttribute('as')).toBe('image');
      expect(link?.getAttribute('href')).toBe('https://example.com/hero.webp');
      expect(link?.getAttribute('fetchpriority')).toBe('high');
      expect(link?.getAttribute('imagesrcset')).toBeNull();
      expect(link?.getAttribute('imagesizes')).toBeNull();
      expect(link?.getAttribute('type')).toBeNull();
    });

    it('sets optional responsive and format attributes when provided', () => {
      const options: HeroPreloadOptions = {
        imageHref: 'https://example.com/hero.webp',
        imageSrcSet: 'hero-400.webp 400w, hero-800.webp 800w',
        imageSizes: '(max-width: 600px) 400px, 800px',
        imageType: 'image/webp',
      };

      renderHook(() => useHeroPreload(options));

      const link = document.querySelector('link[rel="preload"]') as HTMLLinkElement | null;
      expect(link).not.toBeNull();
      expect(link?.getAttribute('imagesrcset')).toBe('hero-400.webp 400w, hero-800.webp 800w');
      expect(link?.getAttribute('imagesizes')).toBe('(max-width: 600px) 400px, 800px');
      expect(link?.getAttribute('type')).toBe('image/webp');
    });

    it('updates link attributes when props change on rerender', () => {
      let options: HeroPreloadOptions = {
        imageHref: 'https://example.com/hero-v1.webp',
      };

      const { rerender } = renderHook(() => useHeroPreload(options));

      let links = document.querySelectorAll('link[rel="preload"]');
      expect(links.length).toBe(1);
      expect(links[0].getAttribute('href')).toBe('https://example.com/hero-v1.webp');

      // Update options
      options = {
        imageHref: 'https://example.com/hero-v2.webp',
        imageType: 'image/webp',
      };
      rerender();

      links = document.querySelectorAll('link[rel="preload"]');
      expect(links.length).toBe(1);
      expect(links[0].getAttribute('href')).toBe('https://example.com/hero-v2.webp');
      expect(links[0].getAttribute('type')).toBe('image/webp');
    });
  });

  describe('cleanup path', () => {
    it('removes link element from document.head when component unmounts', () => {
      const { unmount } = renderHook(() =>
        useHeroPreload({ imageHref: 'https://example.com/hero.webp' })
      );

      expect(document.querySelectorAll('link[rel="preload"]').length).toBe(1);

      unmount();

      expect(document.querySelectorAll('link[rel="preload"]').length).toBe(0);
    });

    it('handles cleanup gracefully when link element was already removed externally', () => {
      const { unmount } = renderHook(() =>
        useHeroPreload({ imageHref: 'https://example.com/hero.webp' })
      );

      const link = document.querySelector('link[rel="preload"]');
      link?.remove();

      expect(() => {
        unmount();
      }).not.toThrow();
    });

    it('cleans up previous link before applying new link when imageHref changes', () => {
      let options: HeroPreloadOptions = { imageHref: 'https://example.com/hero-1.webp' };
      const { rerender } = renderHook(() => useHeroPreload(options));

      expect(document.querySelectorAll('link[rel="preload"]').length).toBe(1);

      // Change href to empty -> should remove link
      options = { imageHref: '' };
      rerender();

      expect(document.querySelectorAll('link[rel="preload"]').length).toBe(0);
    });
  });

  describe('error and edge cases', () => {
    it('handles DOM append errors gracefully', () => {
      const appendChildSpy = vi.spyOn(document.head, 'appendChild').mockImplementationOnce(() => {
        throw new Error('Failed to append to head');
      });

      expect(() => {
        renderHook(() => useHeroPreload({ imageHref: 'https://example.com/fail.jpg' }));
      }).toThrow('Failed to append to head');

      appendChildSpy.mockRestore();
    });
  });
});
