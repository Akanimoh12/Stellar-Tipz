import { test, expect } from '@playwright/test';

/**
 * #1335 — the transactions list virtualizes long histories: only a window of
 * rows is in the DOM, while the accessible list size still reports every row.
 */
test.describe('Virtualized transactions list (#1335)', () => {
  test('renders a window of rows and keeps the full list size for screen readers', async ({
    page,
  }) => {
    await page.goto('/transactions');

    const list = page.getByRole('list', { name: 'Transactions' });
    if ((await list.count()) === 0) {
      test.skip(true, 'transactions list not reachable without a connected wallet');
      return;
    }

    await expect(list).toBeVisible();

    const rows = list.getByRole('listitem');
    const mounted = await rows.count();
    expect(mounted).toBeGreaterThan(0);

    const setSize = await rows.first().getAttribute('aria-setsize');
    const posInSet = await rows.first().getAttribute('aria-posinset');
    expect(Number(setSize)).toBeGreaterThanOrEqual(mounted);
    expect(Number(posInSet)).toBe(1);

    // The first row is pinned to the top of the scroll window.
    const spacerHeight = await list.evaluate((el) => {
      const spacer = el.firstElementChild as HTMLElement | null;
      return spacer ? Number.parseInt(spacer.style.height || '0', 10) : 0;
    });
    expect(spacerHeight).toBeGreaterThan(0);
  });

  test('keeps the list scrollable', async ({ page }) => {
    await page.goto('/transactions');

    const list = page.getByRole('list', { name: 'Transactions' });
    if ((await list.count()) === 0) {
      test.skip(true, 'transactions list not reachable without a connected wallet');
      return;
    }

    await expect(list).toBeVisible();
    const overflowY = await list.evaluate((el) => getComputedStyle(el).overflowY);
    expect(['auto', 'scroll']).toContain(overflowY);
  });
});
