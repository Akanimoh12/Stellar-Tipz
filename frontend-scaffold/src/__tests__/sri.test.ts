import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const indexHtml = readFileSync(fileURLToPath(new URL('../../index.html', import.meta.url)), 'utf8');

const externalAssetTags = [
  ...(indexHtml.match(
    /<link\b(?=[^>]*rel=["'][^"']*stylesheet[^"']*["'])[^>]*href=["']https?:\/\/[^"']+["'][^>]*>/gi,
  ) ?? []),
  ...(indexHtml.match(/<script\b[^>]*src=["']https?:\/\/[^"']+["'][^>]*><\/script>/gi) ?? []),
];

describe('Subresource Integrity (SRI)', () => {
  it('adds SRI to every external stylesheet and script in index.html', () => {
    expect(externalAssetTags.length).toBeGreaterThan(0);

    externalAssetTags.forEach((tag) => {
      expect(tag).toMatch(/integrity="sha384-[^"]+"/);
      expect(tag).toMatch(/crossorigin="anonymous"/);
    });
  });

  it('includes a graceful fallback for SRI failures', () => {
    expect(indexHtml).toContain('window.__tipzRetryExternalAsset');
    expect(indexHtml).toContain('onerror="window.__tipzRetryExternalAsset(this)"');
  });
});
