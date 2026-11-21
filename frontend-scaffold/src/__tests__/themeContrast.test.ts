import { describe, it, expect } from 'vitest';
import tailwindConfig from '../../tailwind.config.js';

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean;
  const num = parseInt(full, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((channel) => {
    const s = channel / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(fg: string, bg: string): number {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

describe('Theme colour contrast audit (WCAG 2.1 AA >= 4.5:1)', () => {
  const colors = tailwindConfig.theme.extend.colors;
  const lightBg = colors.background.light;
  const darkBg = colors.background.dark;

  it('passes AA contrast for all light-theme text and semantic tokens', () => {
    const lightPairs: Array<[string, string]> = [
      ['foreground.light', colors.foreground.light],
      ['muted.light', colors.muted.light],
      ['danger.light', colors.danger.light],
      ['warning.light', colors.warning.light],
      ['success.light', colors.success.light],
      ['placeholder.DEFAULT', colors.placeholder.DEFAULT],
      ['gray.400', colors.gray[400]],
      ['gray.500', colors.gray[500]],
      ['gray.600', colors.gray[600]],
      ['gray.700', colors.gray[700]],
      ['gray.800', colors.gray[800]],
    ];

    for (const [token, hex] of lightPairs) {
      const ratio = contrastRatio(hex, lightBg);
      expect(ratio, `${token} (${hex}) on ${lightBg} = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('passes AA contrast for all dark-theme text and semantic tokens', () => {
    const darkPairs: Array<[string, string]> = [
      ['foreground.dark', colors.foreground.dark],
      ['muted.dark', colors.muted.dark],
      ['danger.dark', colors.danger.dark],
      ['warning.dark', colors.warning.dark],
      ['success.dark', colors.success.dark],
      ['placeholder.dark', colors.placeholder.dark],
      ['gray.300', colors.gray[300]],
      ['gray.200', colors.gray[200]],
      ['gray.100', colors.gray[100]],
    ];

    for (const [token, hex] of darkPairs) {
      const ratio = contrastRatio(hex, darkBg);
      expect(ratio, `${token} (${hex}) on ${darkBg} = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    }
  });
});
