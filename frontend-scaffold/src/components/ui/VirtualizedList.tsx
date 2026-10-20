import React from 'react';

/**
 * Windowed list for long collections (#1335).
 *
 * Only the visible slice plus an overscan buffer is mounted, so a list of
 * 10,000 rows keeps a small, constant-size DOM. Rows may be variable height:
 * each mounted row is measured and the running height/offset table is used to
 * map scroll position to the visible range.
 *
 * Because the DOM no longer holds every row, each row carries `aria-setsize`
 * and `aria-posinset` so assistive technology still reports the true list size
 * and position.
 */

export interface VirtualizedListProps<T> {
  items: T[];
  /** Renders one row. Receives the absolute index so callers can key stably. */
  renderItem: (item: T, index: number) => React.ReactNode;
  /** Estimated row height in px, used before a row has been measured. */
  estimatedItemHeight?: number;
  /** Height of the scroll viewport in px. */
  height?: number;
  /** Extra rows rendered above and below the viewport. */
  overscan?: number;
  /** Rows shorter than this share the container's scroll area. */
  itemClassName?: string;
  /** Distinguishes rows for assistive tech. */
  getItemKey?: (item: T, index: number) => string;
  /** Accessible name for the list. */
  ariaLabel?: string;
  /** Key used to persist and restore scroll position across navigation. */
  scrollRestoreKey?: string;
  className?: string;
}

const OVERSCAN_DEFAULT = 6;
const HEIGHT_DEFAULT = 560;

export function VirtualizedList<T>({
  items,
  renderItem,
  estimatedItemHeight = 72,
  height = HEIGHT_DEFAULT,
  overscan = OVERSCAN_DEFAULT,
  itemClassName = '',
  getItemKey,
  ariaLabel = 'List',
  scrollRestoreKey,
  className = '',
}: VirtualizedListProps<T>) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = React.useState(0);
  const [measured, setMeasured] = React.useState<Record<number, number>>({});

  // Restore scroll position when the same list is revisited (#1335).
  React.useEffect(() => {
    if (!scrollRestoreKey || typeof window === 'undefined') return;
    try {
      const saved = Number(window.sessionStorage.getItem(`tipz_scroll:${scrollRestoreKey}`));
      if (Number.isFinite(saved) && saved > 0) {
        const node = scrollRef.current;
        if (node && typeof node.scrollTo === 'function') {
          node.scrollTo({ top: saved });
        }
        setScrollTop(saved);
      }
    } catch {
      // Storage unavailable — start at the top.
    }
  }, [scrollRestoreKey]);

  const handleScroll = React.useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      const top = event.currentTarget.scrollTop;
      setScrollTop(top);
      if (scrollRestoreKey && typeof window !== 'undefined') {
        try {
          window.sessionStorage.setItem(`tipz_scroll:${scrollRestoreKey}`, String(top));
        } catch {
          // Persistence is best-effort.
        }
      }
    },
    [scrollRestoreKey],
  );

  const measure = React.useCallback((index: number, node: HTMLElement | null) => {
    if (!node) return;
    const height = node.offsetHeight;
    setMeasured((prev) =>
      prev[index] === height ? prev : { ...prev, [index]: height },
    );
  }, []);

  // Prefix sums of measured heights (with the estimate as fallback) let a
  // variable-height list map scrollTop to a row range in O(log n).
  const offsets = React.useMemo(() => {
    const result = new Array<number>(items.length + 1);
    result[0] = 0;
    for (let i = 0; i < items.length; i++) {
      result[i + 1] = result[i] + (measured[i] ?? estimatedItemHeight);
    }
    return result;
  }, [items.length, measured, estimatedItemHeight]);

  const totalHeight = offsets[items.length] ?? 0;

  const findIndex = React.useCallback(
    (target: number) => {
      let low = 0;
      let high = items.length;
      while (low < high) {
        const mid = Math.floor((low + high) / 2);
        if (offsets[mid + 1] <= target) low = mid + 1;
        else high = mid;
      }
      return Math.min(low, Math.max(items.length - 1, 0));
    },
    [offsets, items.length],
  );

  const startIndex = Math.max(0, findIndex(scrollTop) - overscan);
  const endIndex = Math.min(
    items.length - 1,
    findIndex(scrollTop + height) + overscan,
  );
  const visible = items.slice(startIndex, endIndex + 1);

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      data-testid="virtualized-list"
      role="list"
      aria-label={ariaLabel}
      className={`overflow-y-auto ${className}`}
      style={{ height }}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        {visible.map((item, localIndex) => {
          const index = startIndex + localIndex;
          return (
            <div
              key={getItemKey ? getItemKey(item, index) : index}
              ref={(node) => measure(index, node)}
              role="listitem"
              aria-setsize={items.length}
              aria-posinset={index + 1}
              data-index={index}
              className={itemClassName}
              style={{
                position: 'absolute',
                top: offsets[index],
                left: 0,
                right: 0,
              }}
            >
              {renderItem(item, index)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default VirtualizedList;
