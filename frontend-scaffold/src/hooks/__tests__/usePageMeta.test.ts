import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { usePageMeta, usePageTitle } from '../usePageMeta';

describe('usePageMeta', () => {
  const originalTitle = document.title;

  beforeEach(() => {
    document.title = originalTitle;
    vi.clearAllMocks();
  });

  afterEach(() => {
    document.title = originalTitle;
    vi.restoreAllMocks();
  });

  it('should update document title', () => {
    renderHook(() => usePageMeta({ title: 'Test Page' }));

    expect(document.title).toBe('Test Page | Stellar Tipz');
  });

  it('should use default title when no title provided', () => {
    renderHook(() => usePageMeta({ title: '' }));

    expect(document.title).toBe('Stellar Tipz');
  });

  it('should update meta description', () => {
    renderHook(() => usePageMeta({
      title: 'Test',
      description: 'Test description',
    }));

    const metaDescription = document.querySelector('meta[name="description"]');
    expect(metaDescription?.getAttribute('content')).toBe('Test description');
  });

  it('should update Open Graph meta tags', () => {
    renderHook(() => usePageMeta({
      title: 'Test Page',
      description: 'Test description',
      ogImage: '/custom-og.png',
      ogUrl: 'https://example.com/test',
    }));

    const ogTitle = document.querySelector('meta[property="og:title"]');
    const ogDescription = document.querySelector('meta[property="og:description"]');
    const ogImage = document.querySelector('meta[property="og:image"]');
    const ogUrl = document.querySelector('meta[property="og:url"]');

    expect(ogTitle?.getAttribute('content')).toBe('Test Page | Stellar Tipz');
    expect(ogDescription?.getAttribute('content')).toBe('Test description');
    expect(ogImage?.getAttribute('content')).toBe('/custom-og.png');
    expect(ogUrl?.getAttribute('content')).toBe('https://example.com/test');
  });

  it('should update Twitter Card meta tags', () => {
    renderHook(() => usePageMeta({
      title: 'Test Page',
      description: 'Test description',
      twitterCard: 'summary',
    }));

    const twitterCard = document.querySelector('meta[name="twitter:card"]');
    const twitterTitle = document.querySelector('meta[name="twitter:title"]');
    const twitterDescription = document.querySelector('meta[name="twitter:description"]');

    expect(twitterCard?.getAttribute('content')).toBe('summary');
    expect(twitterTitle?.getAttribute('content')).toBe('Test Page | Stellar Tipz');
    expect(twitterDescription?.getAttribute('content')).toBe('Test description');
  });

  it('should use default values when not provided', () => {
    renderHook(() => usePageMeta({ title: 'Test' }));

    const ogImage = document.querySelector('meta[property="og:image"]');
    expect(ogImage?.getAttribute('content')).toBe('/og-image.png');
  });

  it('should update title when props change', () => {
    const { rerender } = renderHook(
      ({ title }) => usePageMeta({ title }),
      { initialProps: { title: 'First Title' } }
    );

    expect(document.title).toBe('First Title | Stellar Tipz');

    rerender({ title: 'Second Title' });

    expect(document.title).toBe('Second Title | Stellar Tipz');
  });
});

describe('usePageTitle', () => {
  const originalTitle = document.title;

  beforeEach(() => {
    document.title = originalTitle;
  });

  afterEach(() => {
    document.title = originalTitle;
  });

  it('should update document title with suffix', () => {
    renderHook(() => usePageTitle('Dashboard'));

    expect(document.title).toBe('Dashboard | Stellar Tipz');
  });

  it('should update title when value changes', () => {
    const { rerender } = renderHook(
      ({ title }) => usePageTitle(title),
      { initialProps: { title: 'First' } }
    );

    expect(document.title).toBe('First | Stellar Tipz');

    rerender({ title: 'Second' });

    expect(document.title).toBe('Second | Stellar Tipz');
  });
});
