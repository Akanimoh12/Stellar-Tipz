import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Toast from '@/components/ui/Toast';

/**
 * #1338 — mobile interaction guarantees:
 *  - every button keeps a 44x44px minimum touch target
 *  - numeric inputs request the numeric keyboard via inputMode
 *  - fixed bottom elements respect the safe-area inset
 */
describe('mobile touch targets (#1338)', () => {
  it.each(['sm', 'md', 'lg'] as const)('size "%s" enforces a 44px minimum', (size) => {
    render(<Button size={size}>Tip</Button>);
    const button = screen.getByRole('button', { name: 'Tip' });
    expect(button.className).toContain('min-h-[44px]');
    expect(button.className).toContain('min-w-[44px]');
  });

  it('keeps the quick-amount trigger touch sized', () => {
    render(
      <Button size="sm" data-tip-amount-trigger="true">
        5 XLM
      </Button>,
    );
    expect(screen.getByRole('button', { name: '5 XLM' }).className).toContain(
      'min-h-[44px]',
    );
  });
});

describe('numeric input keyboard (#1338)', () => {
  it('adds inputMode="decimal" to number inputs', () => {
    render(<Input label="Amount" type="number" />);
    expect(screen.getByLabelText('Amount')).toHaveAttribute('inputmode', 'decimal');
  });

  it('respects an explicit inputMode', () => {
    render(<Input label="Amount" type="number" inputMode="numeric" />);
    expect(screen.getByLabelText('Amount')).toHaveAttribute('inputmode', 'numeric');
  });

  it('leaves text inputs without an inputMode', () => {
    render(<Input label="Handle" type="text" />);
    expect(screen.getByLabelText('Handle')).not.toHaveAttribute('inputmode');
  });
});

describe('safe area insets (#1338)', () => {
  it('offsets fixed bottom toasts by the safe-area inset', () => {
    render(<Toast type="info" message="Saved" onClose={() => {}} />);
    const toast = screen.getByRole('alert');
    expect(toast.className).toContain('bottom-safe');
    expect(toast.className).toContain('right-safe');
  });
});
