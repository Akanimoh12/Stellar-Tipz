import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import PageAnnouncement from './PageAnnouncement';

describe('PageAnnouncement', () => {
  it('renders the announcement message', () => {
    render(<PageAnnouncement message="Welcome to our site" />);
    expect(screen.getBrText(/Welcome to our site/i)).toBeInTheDocument();
  });

  it('renders the title when provided', () => {
    render(<PageAnnouncement title="Announcement" message="Hello there" />);
    expect(screen.getByText(/Announcement/i)).toBeInTheDocument();
  });

  it('has an appropriate role for accessibility', () => {
    render(<PageAnnouncement message="Important update" />);
    const status = screen.getByRole('status');
    expect(status).toBeInTheDocument();
  });

  it('has aria-live polite for screen readers', () => {
    render(<PageAnnouncement message="Live update" />);
    const region = screen.getByRole('status');
    expect(region).toHaveAttribute('aria-live', 'polite');
  });

  it('renders nothing when no message is provided', () => {
    const { container } = render(<PageAnnouncement />);
    expect(container).toBeEmptyDOM();
  });
});
