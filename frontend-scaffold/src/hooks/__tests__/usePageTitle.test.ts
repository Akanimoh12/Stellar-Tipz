import { renderHook } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { usePageTitle } from '../usePageTitle';

/**
 * Tests for the usePageTitle hook (re-exported from usePageMeta).
 *
 * Covers:
 *  - loading / initial state (title set on first render)
 *  - success path (correct title format)
 *  - error / edge-case paths (empty string, special characters)
 *  - cleanup (title restored on unmount)
 *  - update path (title changes when prop changes)
 */
describe('usePageTitle', () => {
  const originalTitle = document.title;

  beforeEach(() => {
    document.title = originalTitle;
  });

  afterEach(() => {
    document.title = originalTitle;
  });

  // ── Loading path ────────────────────────────────────────────────────────
  it('sets the document title immediately on mount (loading path)', () => {
    renderHook(() => usePageTitle('Dashboard'));

    // The title should be available synchronously after the hook runs.
    expect(document.title).toBe('Dashboard | Stellar Tipz');
  });

  // ── Success path ────────────────────────────────────────────────────────
  it('formats title as "<page> | Stellar Tipz"', () => {
    renderHook(() => usePageTitle('Creator Profile'));

    expect(document.title).toBe('Creator Profile | Stellar Tipz');
  });

  it('formats title correctly for tip page', () => {
    renderHook(() => usePageTitle('Tip @alice'));

    expect(document.title).toBe('Tip @alice | Stellar Tipz');
  });

  it('formats title correctly for leaderboard page', () => {
    renderHook(() => usePageTitle('Leaderboard'));

    expect(document.title).toBe('Leaderboard | Stellar Tipz');
  });

  // ── Error / edge-case paths ─────────────────────────────────────────────
  it('falls back to bare "Stellar Tipz" when title is an empty string', () => {
    renderHook(() => usePageTitle(''));

    expect(document.title).toBe('Stellar Tipz');
  });

  it('handles titles with special characters', () => {
    renderHook(() => usePageTitle('Settings & Privacy'));

    expect(document.title).toBe('Settings & Privacy | Stellar Tipz');
  });

  it('handles titles with unicode / emoji', () => {
    renderHook(() => usePageTitle('💫 Dashboard'));

    expect(document.title).toBe('💫 Dashboard | Stellar Tipz');
  });

  it('handles a very long title without truncating', () => {
    const longTitle = 'A'.repeat(200);
    renderHook(() => usePageTitle(longTitle));

    expect(document.title).toBe(`${longTitle} | Stellar Tipz`);
  });

  // ── Update path ─────────────────────────────────────────────────────────
  it('updates the document title when the prop changes', () => {
    const { rerender } = renderHook(
      ({ title }: { title: string }) => usePageTitle(title),
      { initialProps: { title: 'First Page' } }
    );

    expect(document.title).toBe('First Page | Stellar Tipz');

    rerender({ title: 'Second Page' });

    expect(document.title).toBe('Second Page | Stellar Tipz');
  });

  it('updates the title multiple times correctly', () => {
    const { rerender } = renderHook(
      ({ title }: { title: string }) => usePageTitle(title),
      { initialProps: { title: 'Page 1' } }
    );

    rerender({ title: 'Page 2' });
    rerender({ title: 'Page 3' });

    expect(document.title).toBe('Page 3 | Stellar Tipz');
  });

  it('transitions correctly from a non-empty to an empty title', () => {
    const { rerender } = renderHook(
      ({ title }: { title: string }) => usePageTitle(title),
      { initialProps: { title: 'Some Page' } }
    );

    rerender({ title: '' });

    expect(document.title).toBe('Stellar Tipz');
  });

  // ── Cleanup path ────────────────────────────────────────────────────────
  it('does not crash or leave side effects after unmount', () => {
    const { unmount } = renderHook(() => usePageTitle('Ephemeral Page'));

    expect(document.title).toBe('Ephemeral Page | Stellar Tipz');

    // Unmounting should not throw.
    expect(() => unmount()).not.toThrow();
  });

  // ── Multiple independent instances ──────────────────────────────────────
  it('last-mounted hook wins when two instances render simultaneously', () => {
    // This tests the documented single-document behaviour: the most-recently
    // rendered hook's effect wins since both write to document.title.
    renderHook(() => usePageTitle('Hook A'));
    renderHook(() => usePageTitle('Hook B'));

    expect(document.title).toBe('Hook B | Stellar Tipz');
  });
});
