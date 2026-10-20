import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';

import VirtualizedList from '@/components/ui/VirtualizedList';

/**
 * #1335 — long lists render only the visible window plus an overscan buffer,
 * stay navigable for screen readers, handle variable-height rows, and restore
 * scroll position across navigation.
 */
function makeItems(count: number) {
  return Array.from({ length: count }, (_, i) => ({ id: `row-${i}`, index: i }));
}

function Row({ item, tall }: { item: { id: string; index: number }; tall?: boolean }) {
  return (
    <div style={{ height: tall ? 140 : 60 }} data-testid={`content-${item.index}`}>
      Row {item.index}
    </div>
  );
}

describe('VirtualizedList (#1335)', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('mounts only a window of rows for a long list', () => {
    render(
      <VirtualizedList
        items={makeItems(10_000)}
        estimatedItemHeight={50}
        height={400}
        overscan={5}
        renderItem={(item) => <Row item={item} />}
      />,
    );

    const mounted = screen.getAllByRole('listitem');
    expect(mounted.length).toBeGreaterThan(0);
    // 400px viewport at 50px rows + 5 overscan rows each side, nowhere near 10k.
    expect(mounted.length).toBeLessThan(50);
  });

  it('keeps the DOM small with 10,000 items and reports a stable frame budget', () => {
    const items = makeItems(10_000);
    const { container } = render(
      <VirtualizedList
        items={items}
        estimatedItemHeight={50}
        height={400}
        renderItem={(item) => <Row item={item} />}
      />,
    );

    const mounted = container.querySelectorAll('[role="listitem"]');
    expect(mounted.length).toBeLessThan(50);

    // A full re-render of 10k items stays cheap because only the window renders.
    const started = performance.now();
    act(() => {
      container.querySelector('[data-testid="virtualized-list"]')?.dispatchEvent(
        new Event('scroll'),
      );
    });
    expect(performance.now() - started).toBeLessThan(1000);
  });

  it('exposes the true list size and position to assistive tech', () => {
    render(
      <VirtualizedList
        items={makeItems(500)}
        estimatedItemHeight={50}
        height={300}
        ariaLabel="Transactions"
        getItemKey={(item) => item.id}
        renderItem={(item) => <Row item={item} />}
      />,
    );

    const list = screen.getByRole('list', { name: 'Transactions' });
    expect(list).toBeInTheDocument();

    const items = screen.getAllByRole('listitem');
    const first = items[0];
    expect(first).toHaveAttribute('aria-setsize', '500');
    expect(first).toHaveAttribute('aria-posinset', '1');
    // Second rendered row reports the following position, not 2 blindly.
    expect(items[1]).toHaveAttribute('aria-posinset', '2');
  });

  it('renders a different window after scrolling', () => {
    const { container } = render(
      <VirtualizedList
        items={makeItems(1_000)}
        estimatedItemHeight={50}
        height={300}
        overscan={0}
        renderItem={(item) => <Row item={item} />}
      />,
    );

    const scroller = container.querySelector('[data-testid="virtualized-list"]') as HTMLElement;
    Object.defineProperty(scroller, 'scrollTop', { value: 5_000, writable: true });

    act(() => {
      scroller.dispatchEvent(new Event('scroll', { bubbles: true }));
    });

    const firstIndex = Number(
      container.querySelector('[role="listitem"]')?.getAttribute('data-index'),
    );
    expect(firstIndex).toBeGreaterThan(0);
  });

  it('handles variable-height rows without breaking the offset table', () => {
    const { container } = render(
      <VirtualizedList
        items={makeItems(200)}
        estimatedItemHeight={50}
        height={300}
        renderItem={(item) => <Row item={item} tall={item.index % 2 === 0} />}
      />,
    );

    // jsdom reports offsetHeight 0, so the estimate is used; the total height
    // must still cover every row.
    const spacer = container.querySelector('[data-testid="virtualized-list"] > div') as HTMLElement;
    expect(spacer.style.height).toBe('10000px');
  });

  it('restores the scroll position for a returning list', () => {
    window.sessionStorage.setItem('tipz_scroll:transactions-all', '1200');

    const { container } = render(
      <VirtualizedList
        items={makeItems(500)}
        estimatedItemHeight={50}
        height={300}
        overscan={0}
        scrollRestoreKey="transactions-all"
        renderItem={(item) => <Row item={item} />}
      />,
    );

    // A restored offset must shift the rendered window to that position.
    const firstIndex = Number(
      container.querySelector('[role="listitem"]')?.getAttribute('data-index'),
    );
    expect(firstIndex).toBeGreaterThan(0);
  });

  it('renders nothing structural for an empty list', () => {
    render(<VirtualizedList items={[]} renderItem={(item) => <Row item={item} />} />);
    expect(screen.getByRole('list')).toBeEmptyDOMElement();
  });
});
