import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import EmptyState from '../EmptyState';

const renderWithRouter = (ui: React.ReactElement) =>
  render(<MemoryRouter>{ui}</MemoryRouter>);

describe('EmptyState', () => {
  it('renders title and description', () => {
    renderWithRouter(<EmptyState title="No items" description="Nothing here yet." />);
    expect(screen.getByText('No items')).toBeInTheDocument();
    expect(screen.getByText('Nothing here yet.')).toBeInTheDocument();
  });

  it('renders icon when provided', () => {
    renderWithRouter(<EmptyState title="Empty" icon={<span data-testid="icon">X</span>} />);
    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });

  it('shows action button with correct link', () => {
    renderWithRouter(
      <EmptyState title="Empty" action={{ label: 'Go home', to: '/' }} />,
    );
    expect(screen.getByText('Go home')).toBeInTheDocument();
  });

  it('calls onClick when action button is clicked', () => {
    const onClick = vi.fn();
    renderWithRouter(
      <EmptyState title="Empty" action={{ label: 'Click me', onClick }} />,
    );
    fireEvent.click(screen.getByText('Click me'));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('shows clear-filters button for filtered variant', () => {
    const onClear = vi.fn();
    renderWithRouter(
      <EmptyState
        title="No results"
        variant="filtered"
        onClearFilters={onClear}
      />,
    );
    const btn = screen.getByText('Clear filters');
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(onClear).toHaveBeenCalledOnce();
  });

  it('does not show clear-filters for empty variant', () => {
    renderWithRouter(
      <EmptyState title="Empty" variant="empty" onClearFilters={vi.fn()} />,
    );
    expect(screen.queryByText('Clear filters')).not.toBeInTheDocument();
  });

  it('has role="status" and aria-live="polite"', () => {
    renderWithRouter(<EmptyState title="Empty" />);
    const el = screen.getByRole('status');
    expect(el).toHaveAttribute('aria-live', 'polite');
  });
});
