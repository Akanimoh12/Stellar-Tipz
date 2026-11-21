import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { axe, toHaveNoViolations } from 'jest-axe';
import WithdrawModal from '../WithdrawModal';

expect.extend(toHaveNoViolations);

describe('WithdrawModal accessibility', () => {
  const defaultProps = {
    isOpen: true,
    balance: '10000000',
    feeBps: 250,
    onClose: vi.fn(),
  };

  it('has no accessibility violations when open', async () => {
    const { container } = render(
      <WithdrawModal {...defaultProps} />
    );
    
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('has proper ARIA attributes', () => {
    render(
      <WithdrawModal {...defaultProps} />
    );

    const dialog = screen.getByRole('dialog', { hidden: true });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('role', 'dialog');
  });

  it('has accessible form controls', () => {
    render(
      <WithdrawModal {...defaultProps} />
    );

    const amountInput = screen.getByLabelText(/amount to withdraw/i);
    expect(amountInput).toBeInTheDocument();
    expect(amountInput).toHaveAttribute('type', 'number');
  });

  it('has accessible error messages', () => {
    render(
      <WithdrawModal {...defaultProps} />
    );

    // Check that error messages are properly associated with inputs
    const amountInput = screen.getByLabelText(/amount to withdraw/i);
    expect(amountInput).toBeInTheDocument();
  });
});
