import React from 'react';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import { axe, toHaveNoViolations } from 'jest-axe';
import QuickSearchModal from '../QuickSearchModal';

expect.extend(toHaveNoViolations);

describe('QuickSearchModal accessibility', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
  };

  const renderWithRouter = (ui: React.ReactElement) => {
    return render(<BrowserRouter>{ui}</BrowserRouter>);
  };

  it('has no accessibility violations when open', async () => {
    const { container } = renderWithRouter(
      <QuickSearchModal {...defaultProps} />
    );
    
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('has proper ARIA attributes', () => {
    renderWithRouter(
      <QuickSearchModal {...defaultProps} />
    );

    const dialog = screen.getByRole('dialog', { hidden: true });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('role', 'dialog');
    expect(dialog).toHaveAttribute('aria-labelledby', 'quick-search-title');
  });

  it('has accessible close button', () => {
    renderWithRouter(
      <QuickSearchModal {...defaultProps} />
    );

    const closeButton = screen.getByRole('button', { name: /close search/i, hidden: true });
    expect(closeButton).toBeInTheDocument();
    expect(closeButton).toHaveAttribute('aria-label', 'Close search');
  });

  it('has accessible heading', () => {
    renderWithRouter(
      <QuickSearchModal {...defaultProps} />
    );

    const heading = screen.getByRole('heading', { name: 'Quick search', hidden: true });
    expect(heading).toBeInTheDocument();
  });
});
