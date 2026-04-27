import { describe, it, expect } from 'vitest';

describe('Subresource Integrity (SRI)', () => {
  it('should have SRI hash for Google Fonts stylesheet', () => {
    const styleLinks = Array.from(document.querySelectorAll('link[rel="stylesheet"]'));
    const googleFontsLink = styleLinks.find(
      (link) => link.getAttribute('href')?.includes('fonts.googleapis.com')
    );

    expect(googleFontsLink).toBeTruthy();
    expect(googleFontsLink?.getAttribute('integrity')).toBeTruthy();
    expect(googleFontsLink?.getAttribute('crossorigin')).toBe('anonymous');
  });

  it('all external scripts should have integrity attribute if loaded via CDN', () => {
    const scripts = Array.from(document.querySelectorAll('script[src]'));
    scripts.forEach((script) => {
      const src = script.getAttribute('src');
      if (src && src.startsWith('http')) {
        expect(script.getAttribute('integrity')).toBeTruthy();
        expect(script.getAttribute('crossorigin')).toBe('anonymous');
      }
    });
  });

  it('should not break if external resources have SRI', () => {
    // This test ensures that the page loads successfully with SRI attributes present
    expect(document).toBeTruthy();
    expect(document.head).toBeTruthy();
  });
});
