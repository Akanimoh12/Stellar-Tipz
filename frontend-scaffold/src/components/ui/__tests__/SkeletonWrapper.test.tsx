import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import SkeletonWrapper from '../SkeletonWrapper';

afterEach(() => {
  vi.useRealTimers();
});

describe('SkeletonWrapper', () => {
  it('shows children when not loading', () => {
    render(
      <SkeletonWrapper loading={false} skeleton={<div>skeleton</div>}>
        <div>content</div>
      </SkeletonWrapper>,
    );
    expect(screen.getByText('content')).toBeInTheDocument();
    expect(screen.queryByText('skeleton')).not.toBeInTheDocument();
  });

  it('shows skeleton after delay when loading', () => {
    vi.useFakeTimers();
    render(
      <SkeletonWrapper loading={true} skeleton={<div>skeleton</div>} delayMs={200}>
        <div>content</div>
      </SkeletonWrapper>,
    );

    // Before delay: children rendered invisibly
    expect(screen.queryByText('skeleton')).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(250);
    });

    expect(screen.getByText('skeleton')).toBeInTheDocument();
  });

  it('has aria-busy on skeleton container', () => {
    vi.useFakeTimers();
    render(
      <SkeletonWrapper loading={true} skeleton={<div>skeleton</div>} delayMs={0}>
        <div>content</div>
      </SkeletonWrapper>,
    );

    act(() => {
      vi.advanceTimersByTime(10);
    });

    const statusEl = screen.getByRole('status');
    expect(statusEl).toHaveAttribute('aria-busy', 'true');
  });

  it('does not flash skeleton on fast loads', () => {
    vi.useFakeTimers();
    const { rerender } = render(
      <SkeletonWrapper loading={true} skeleton={<div>skeleton</div>} delayMs={200}>
        <div>content</div>
      </SkeletonWrapper>,
    );

    act(() => {
      vi.advanceTimersByTime(100);
    });

    rerender(
      <SkeletonWrapper loading={false} skeleton={<div>skeleton</div>} delayMs={200}>
        <div>content</div>
      </SkeletonWrapper>,
    );

    expect(screen.queryByText('skeleton')).not.toBeInTheDocument();
    expect(screen.getByText('content')).toBeInTheDocument();
  });
});
